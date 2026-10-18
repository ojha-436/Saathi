"""Shortcuts eval: people's own saved Saathi shortcuts (docs/superpowers/specs/2026-10-18-saathi-shortcuts-design.md §8).

    SAATHI_LOCAL=1 LOCAL_DATA_DIR=$(mktemp -d) uv run python -m eval.shortcuts_eval --unit
        Offline checks of the store, validation, /command expansion, workspaces and the demo rule. No model calls.

Writes nothing to the live workspace in --unit mode (a throwaway local database).
"""
import argparse
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

HERE = Path(__file__).parent


def unit() -> list[tuple[str, bool]]:
    from fastapi import HTTPException

    from app import shortcuts as s
    from app.config import TZ
    from app.firebase import db

    results: list[tuple[str, bool]] = []

    def check(name: str, fn) -> None:
        try:
            ok = bool(fn())
        except Exception as e:  # a crash is a failed check, with the reason shown
            ok, name = False, f"{name} ({type(e).__name__}: {e})"
        results.append((name, ok))

    def status(fn) -> int:
        try:
            fn()
        except HTTPException as e:
            return e.status_code
        return 200

    def new(**kw):
        base = {"name": "Dispatch check", "command": "dispatch-check", "instruction": "1. Find the {PO number} delivery schedule.",
                "inputs": ["PO number"], "minutes_saved": 15}
        return s.ShortcutIn(**{**base, **kw})

    u = {"uid": "u1", "org_id": "o1", "name": "Test Person", "role": "engineer"}
    u_other_org = {**u, "org_id": "o2"}
    demo_user = {"uid": "rahul", "org_id": "o1", "name": "Rahul", "role": "purchase"}

    check("slug turns words into a command", lambda: s.slug("Dispatch Check!") == "dispatch-check" and s.slug("x") == "shortcut")
    check("parse keeps everything after the command, any case, several lines",
          lambda: s.parse("/Dispatch-Check po-7781\nalso Lot 2") == ("dispatch-check", "po-7781\nalso Lot 2"))
    check("parse: bare command, text that isn't one, too short",
          lambda: s.parse("/dispatch-check") == ("dispatch-check", "") and s.parse("what /x") is None and s.parse("/a") is None)
    check("no shortcuts yet: a /word gets the 'make one' reply",
          lambda: s.expand(u, "/anything")["reply"].startswith("You don't have any shortcuts yet"))

    sc = s.create(new(), user=u)
    check("create returns the saved shortcut with an id", lambda: sc["id"] and sc["command"] == "dispatch-check" and sc["runs"] == 0)

    def known():
        r = s.expand(u, "/dispatch-check PO-7781")
        return "PO-7781" in r["prompt"] and "Find the {PO number} delivery schedule" in r["prompt"] and \
            r["shortcut"] == {"id": sc["id"], "name": "Dispatch check"}
    check("expand fills the person's own shortcut into the prompt", known)
    check("unknown command lists the person's shortcuts", lambda: "/dispatch-check" in s.expand(u, "/nope")["reply"])
    check("/clear and plain text pass through", lambda: s.expand(u, "/clear") is None and s.expand(u, "hello") is None)

    check("duplicate command is a 400", lambda: status(lambda: s.create(new(), user=u)) == 400)
    check("reserved command is a 400", lambda: status(lambda: s.create(new(command="clear"), user=u)) == 400)
    check("badly formed command is a 400", lambda: status(lambda: s.create(new(command="Bad Cmd"), user=u)) == 400)
    check("empty name or instruction is a 400", lambda: status(lambda: s.create(new(command="a1", name=" "), user=u)) == 400
          and status(lambda: s.create(new(command="a2", instruction=""), user=u)) == 400)
    check("instruction over 1500 characters is a 400", lambda: status(lambda: s.create(new(command="a3", instruction="x" * 1501), user=u)) == 400)
    check("more than 4 inputs is a 400", lambda: status(lambda: s.create(new(command="a4", inputs=["a", "b", "c", "d", "e"]), user=u)) == 400)

    check("fixup makes a taken or reserved command free",
          lambda: s.fixup({"name": "x", "command": "dispatch-check", "instruction": "1. a", "inputs": [], "minutes_saved": 5}, {"dispatch-check"})["command"] == "dispatch-check-2"
          and s.fixup({"name": "x", "command": "clear", "instruction": "1. a", "inputs": [], "minutes_saved": 5}, set())["command"] == "clear-2")

    def clamps():
        d = s.fixup({"name": "N" * 90, "command": "Vendor Week", "instruction": "y" * 2000, "inputs": [" PO ", "PO", "a", "b", "c", "d"],
                     "minutes_saved": 999}, set())
        return (d["command"] == "vendor-week" and len(d["name"]) <= 60 and len(d["instruction"]) <= 1500 and d["inputs"] == ["PO", "a", "b", "c"]
                and d["minutes_saved"] == 240 and s.fixup({**d, "minutes_saved": 0}, set())["minutes_saved"] == 1)
    check("fixup clamps lengths, de-duplicates inputs and minutes", clamps)

    check("another workspace sees none of them", lambda: s.mine(u_other_org) == []
          and s.expand(u_other_org, "/dispatch-check x")["reply"].startswith("You don't have any"))

    s.record_run("u1", sc["id"])
    check("record_run counts a run", lambda: next(x for x in s.mine(u) if x["id"] == sc["id"])["runs"] == 1)
    check("record_run on a deleted shortcut does nothing", lambda: s.record_run("u1", "missing") is None)

    def totals():
        r = s.list_shortcuts(user=u)
        return r["total_runs"] == 1 and r["total_minutes_saved"] == 15 and len(r["shortcuts"]) == 1
    check("list totals are runs and runs × minutes", totals)

    for i in range(19):
        s.create(new(command=f"extra-{i}", name=f"Extra {i}"), user=u)
    check("a 21st shortcut is a 400", lambda: status(lambda: s.create(new(command="one-too-many"), user=u)) == 400)

    mine_demo = s.create(new(), user=demo_user)
    check("a demo login can create", lambda: bool(mine_demo["id"]))
    check("a demo login can change one made today", lambda: status(lambda: s.update(mine_demo["id"], s.ShortcutPatch(name="Renamed"), user=demo_user)) == 200)
    ref = db.collection("assistant").document("rahul").collection("shortcuts").document(mine_demo["id"])
    ref.update({"demo": True})
    check("a demo login can't change a seeded demo shortcut", lambda: status(lambda: s.update(mine_demo["id"], s.ShortcutPatch(name="X"), user=demo_user)) == 403
          and status(lambda: s.remove(mine_demo["id"], user=demo_user)) == 403)
    ref.update({"demo": False, "created_at": datetime.now(TZ) - timedelta(days=2)})
    check("a demo login can't change an older one", lambda: status(lambda: s.update(mine_demo["id"], s.ShortcutPatch(name="X"), user=demo_user)) == 403)
    db.collection("assistant").document("u1").collection("shortcuts").document(sc["id"]).update({"created_at": datetime.now(TZ) - timedelta(days=2)})
    check("anyone else can change an older one", lambda: status(lambda: s.update(sc["id"], s.ShortcutPatch(minutes_saved=20), user=u)) == 200)
    check("someone else's shortcut is a 404", lambda: status(lambda: s.update(sc["id"], s.ShortcutPatch(name="X"), user=demo_user)) == 404)

    msgs = db.collection("assistant").document("u1").collection("messages")
    t0 = datetime.now(TZ) - timedelta(minutes=5)
    msgs.document("q1").set({"role": "user", "text": "Which revision of SRC-BF-2041 is latest?", "ts": t0, "org_id": "o1", "session_id": "s_abc12345"})
    msgs.document("a1").set({"role": "assistant", "text": "Rev C is the released revision [file:file006].", "ts": t0 + timedelta(seconds=9),
                             "org_id": "o1", "session_id": "s_abc12345"})
    msgs.document("a_other").set({"role": "assistant", "text": "Other workspace", "ts": t0, "org_id": "o2", "session_id": "s_abc12345"})

    def from_answer():
        src = s.source_from_message(u, "a1")
        return "Question: Which revision of SRC-BF-2041 is latest?" in src and "Answer: Rev C" in src
    check("source_from_message pairs the answer with its question", from_answer)
    check("source_from_message: missing, other workspace or a question id is a 404",
          lambda: status(lambda: s.source_from_message(u, "nope")) == 404 and status(lambda: s.source_from_message(u, "a_other")) == 404
          and status(lambda: s.source_from_message(u, "q1")) == 404)

    s.remove(sc["id"], user=u)
    check("remove deletes it", lambda: all(x["id"] != sc["id"] for x in s.mine(u)))
    return results


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--unit", action="store_true", help="offline checks against a throwaway local database")
    args = p.parse_args()
    if args.unit:
        if os.getenv("SAATHI_LOCAL") != "1" or not os.getenv("LOCAL_DATA_DIR"):
            sys.exit("--unit needs SAATHI_LOCAL=1 and a throwaway LOCAL_DATA_DIR (it writes test data)")
        results = unit()
        for name, ok in results:
            print(("ok   " if ok else "FAIL ") + name)
        failed = sum(not ok for _, ok in results)
        print(f"{len(results) - failed}/{len(results)} passed")
        sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
