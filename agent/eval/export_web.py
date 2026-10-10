"""Writes the latest eval summary into the web app (shown on the landing page). Run: uv run python -m eval.export_web"""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
r = json.loads((Path(__file__).parent / "results.json").read_text())
s = r["summary"]
date = r["ran_at"][:10]
(root / "web/src/lib/eval.ts").write_text(
    "// Generated from agent/eval/results.json by agent/eval/export_web.py, do not edit by hand.\n"
    f'export const EVAL = {{ retrieval: "{s["retrieval_accuracy"]}", leaks: "{s["permission_leaks"]}", '
    f'latency: "{s["median_answer_latency_s"]}", date: "{date}" }};\n'
)
print("updated web/src/lib/eval.ts")
