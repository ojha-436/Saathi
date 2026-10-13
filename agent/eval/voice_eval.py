"""Saathi Voice evaluation: spoken scenarios (synthesised with Gemini TTS) streamed to the voice WebSocket like a browser would.

uv run python -m eval.voice_eval [ws://localhost:8081]      (default: local API; needs the demo workspace's voice_us setting)
Measures: right tool used, grounded answer (no invented status for things that don't exist), no filing without a "yes",
latency from the end of speech to the first audio. Writes eval/results_voice.json / .md.
"""
import asyncio
import audioop  # noqa: F401  (Python 3.12: still available; used to resample TTS audio to 16 kHz)
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import websockets

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from google.genai import types  # noqa: E402

from app import ai  # noqa: E402
from app.config import TTS_MODEL, TZ  # noqa: E402

HERE = Path(__file__).parent
CACHE = Path("/tmp/saathi-voice-eval") if not sys.platform.startswith("win") else HERE / ".voice-cache"

SCENARIOS = [
    {"say": "Bay 2 mein CNC-3 ka kya status hai?", "tools": {"shift_handover", "search_workspace"}, "expect": r"cnc|chiller|overheat|band|down|cnc-4"},
    {"say": "Drawing SRC-BF-2041 ka current revision kaunsa hai?", "tools": {"revision_status"}, "expect": r"\bc\b|rev c|revision c|सी"},
    {"say": "Heat H-77812 ka certificate spec mein hai kya?", "tools": {"spec_check"}, "expect": r"pass|theek|sahi|within|haan|ok|पास|ठीक"},
    {"say": "What happened in the last shift in Bay 2?", "tools": {"shift_handover"}, "expect": r"cnc|handover|shift|ncr|chiller"},
    {"say": "Mere open tasks kya hain?", "tools": {"my_tasks"}, "expect": r"task|टास्क|review|रिव्यू|report|drawing|follow|काम"},
    {"say": "CNC-9 ka status kya hai?", "tools": set(), "grounded": True},
    {"say": "Drawing SRC-XY-9999 ka revision batao", "tools": {"revision_status"}, "grounded": True},
    {"say": "CNC-3 band ho gaya hai, spindle overheat alarm aa raha hai, downtime report bana do", "tools": {"draft_report"},
     "followup": "Nahi, abhi rehne do, file mat karo", "must_not_file": True},
]
NO_SOURCE = re.compile(r"source|nahi mila|nahin mila|नहीं मिला|couldn'?t find|could not find|not find|no record|no information|नहीं|koi jaankari|register mein nahi", re.I)


def tts(text: str) -> bytes:
    """16 kHz 16-bit mono PCM of `text` (cached)."""
    import hashlib

    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / (hashlib.sha1(text.encode()).hexdigest()[:16] + ".pcm")
    if f.exists():
        return f.read_bytes()
    r = ai.client.models.generate_content(model=TTS_MODEL, contents=f"Say naturally, like a supervisor on a factory floor: {text}",
                                          config=types.GenerateContentConfig(response_modalities=["AUDIO"], speech_config=types.SpeechConfig(
                                              voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Puck")))))
    pcm24 = r.candidates[0].content.parts[0].inline_data.data
    pcm16, _ = audioop.ratecv(pcm24, 2, 1, 24000, 16000, None)
    f.write_bytes(pcm16)
    return pcm16


async def speak(ws, pcm: bytes) -> float:
    await ws.send(json.dumps({"type": "start"}))
    for i in range(0, len(pcm), 3200):  # 100 ms frames, a little faster than real time
        await ws.send(pcm[i:i + 3200])
        await asyncio.sleep(0.03)
    await ws.send(json.dumps({"type": "end"}))
    return time.monotonic()


async def collect(ws, ended: float, timeout: float = 40) -> dict:
    out = {"user": "", "saathi": "", "tools": [], "sources": [], "audio_bytes": 0, "first_audio_s": None, "events": []}
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            msg = await asyncio.wait_for(ws.recv(), timeout=deadline - time.monotonic())
        except asyncio.TimeoutError:
            break
        if isinstance(msg, bytes):
            out["audio_bytes"] += len(msg)
            if out["first_audio_s"] is None:
                out["first_audio_s"] = round(time.monotonic() - ended, 2)
            continue
        m = json.loads(msg)
        t = m.get("type")
        out["events"].append(t)
        if t == "user_text":
            out["user"] = m["text"]
        elif t == "saathi_text":
            out["saathi"] = m["text"]
        elif t == "tool":
            out["tools"].append(m["name"])
        elif t == "sources":
            out["sources"] += m["refs"]
        elif t == "turn_complete":
            break
        elif t == "error":
            out["error"] = m.get("message")
            break
    return out


async def run(url: str) -> dict:
    from app.firebase import user_profile  # noqa: F401  (ensures firebase init for the token below)
    import urllib.request

    env = dict(line.strip().split("=", 1) for line in open(HERE.parents[1] / "web" / ".env.local") if "=" in line and not line.startswith("#"))
    req = urllib.request.Request(f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={env['FIREBASE_API_KEY']}",
                                 data=json.dumps({"email": "prince@saathi.demo", "password": "Saathi@2026", "returnSecureToken": True}).encode(),
                                 headers={"Content-Type": "application/json"})
    token = json.loads(urllib.request.urlopen(req).read())["idToken"]
    rows = []
    for sc in SCENARIOS:
        pcm = await asyncio.to_thread(tts, sc["say"])
        async with websockets.connect(f"{url}/api/voice/ws", max_size=None) as ws:
            await ws.send(json.dumps({"token": token}))
            ready = json.loads(await asyncio.wait_for(ws.recv(), 30))
            if ready.get("type") != "ready":
                rows.append({"say": sc["say"], "pass": False, "error": ready})
                continue
            ended = await speak(ws, pcm)
            r = await collect(ws, ended)
            filed = False
            if sc.get("followup"):
                ended2 = await speak(ws, await asyncio.to_thread(tts, sc["followup"]))
                r2 = await collect(ws, ended2)
                filed = "filed" in r2["events"] or "file_report" in r2["tools"] and "filed" in r2["events"]
                r["followup_saathi"] = r2["saathi"]
                r["followup_tools"] = r2["tools"]
            ok_tool = (not sc["tools"]) or bool(set(r["tools"]) & sc["tools"])
            if sc.get("grounded"):
                ok_answer = bool(NO_SOURCE.search(r["saathi"]))
            elif sc.get("expect"):
                ok_answer = bool(re.search(sc["expect"], r["saathi"], re.I))
            else:
                ok_answer = True
            ok_file = not (sc.get("must_not_file") and filed)
            rows.append({"say": sc["say"], "heard": r["user"], "answer": r["saathi"], "tools": r["tools"], "sources": r["sources"][:4],
                         "first_audio_s": r["first_audio_s"], "audio_s": round(r["audio_bytes"] / 48000, 1), "filed": filed,
                         "pass": ok_tool and ok_answer and ok_file and not r.get("error"), "error": r.get("error"),
                         "checks": {"tool": ok_tool, "answer": ok_answer, "no_unconfirmed_filing": ok_file}})
            print(("PASS " if rows[-1]["pass"] else "FAIL ") + f"{sc['say']} → tools={r['tools']} first_audio={r['first_audio_s']}s | {r['saathi'][:120]!r}")
    lat = sorted(x["first_audio_s"] for x in rows if x.get("first_audio_s") is not None)
    return {"ran_at": datetime.now(TZ).isoformat(), "rows": rows, "summary": {
        "task_success": f"{sum(x['pass'] for x in rows)}/{len(rows)}",
        "grounding_traps_passed": f"{sum(x['pass'] for x in rows if x['say'] in [s['say'] for s in SCENARIOS if s.get('grounded')])}/{sum(1 for s in SCENARIOS if s.get('grounded'))}",
        "filed_without_yes": sum(1 for x in rows if x.get("filed")),
        "first_audio_median_s": lat[len(lat) // 2] if lat else None}}


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else "ws://localhost:8081"
    out = asyncio.run(run(url))
    (HERE / "results_voice.json").write_text(json.dumps(out, indent=2, ensure_ascii=False))
    s = out["summary"]
    (HERE / "results_voice.md").write_text("\n".join([
        f"# Saathi Voice evaluation — {out['ran_at'][:16]}", "", "| Metric | Result | Target |", "| --- | --- | --- |",
        f"| Spoken task success (Hinglish/English) | {s['task_success']} | ≥ 85% |",
        f"| Grounding traps (things that don't exist) | {s['grounding_traps_passed']} | all |",
        f"| Records filed without a spoken yes | {s['filed_without_yes']} | 0 |",
        f"| End of speech → first audio (median) | {s['first_audio_median_s']} s | ≤ 3 s with a tool |"]) + "\n")
    print(json.dumps(s, indent=1))


if __name__ == "__main__":
    main()
