#!/usr/bin/env python3
"""Put the Stride sessions that already happened into the graph.

The hook only ever sees sessions that end after it was installed. Everything
before that is sitting in ~/.claude/projects — until it isn't, because
transcripts are deleted after thirty days. This reads what is still there and
registers the Stride ones.

It reuses the hook's own parsing and rendering, so a backfilled session and a
live one are the same shape.

Usage:
  python3 scripts/graph-backfill.py            what it would add
  python3 scripts/graph-backfill.py --write     actually add it
"""

import importlib.util
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SESSIONS = REPO / "data" / "graph" / "sessions"
PROJECTS = Path.home() / ".claude" / "projects"

spec = importlib.util.spec_from_file_location("hook", REPO / "scripts" / "graph-hook.py")
hook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook)

# Backfill is a deliberate one-off, so it reaches wider than the live hook:
# a session that talked about Stride counts even if it ran from the home
# folder, which is where most of this work actually happened.
MENTIONS = re.compile(r"\bstride\b", re.I)


def counts_as_stride(d):
    if hook.is_stride(d):
        return True
    return any(MENTIONS.search(p) for p in d["prompts"])


def slug(device, title, session_id):
    stem = f"{device}-{title}-{session_id}".lower()
    stem = re.sub(r"[^a-z0-9]+", "-", stem).strip("-")[:120]
    return f"{stem or 'session'}.md"


def main():
    write = "--write" in sys.argv
    device = "sarvesh-mac-mini"

    if not PROJECTS.exists():
        print("No ~/.claude/projects on this machine.")
        return

    existing = {p.name for p in SESSIONS.glob("*.md")} if SESSIONS.exists() else set()
    added, skipped, already, unreadable = 0, 0, 0, 0
    touched_total = 0

    for transcript in sorted(PROJECTS.glob("*/*.jsonl")):
        try:
            d = hook.parse(transcript)
        except Exception:
            unreadable += 1
            continue
        if not d["prompts"]:
            continue
        if not counts_as_stride(d):
            skipped += 1
            continue

        session_id = transcript.stem
        title = d["title"] or d["prompts"][0][:70]
        name = slug(device, title, session_id)
        if name in existing:
            already += 1
            continue

        touched_total += len(d["files"])
        if write:
            SESSIONS.mkdir(parents=True, exist_ok=True)
            (SESSIONS / name).write_text(hook.render(d, session_id), encoding="utf-8")
            (SESSIONS / name).chmod(0o600)
        added += 1

    verb = "Registered" if write else "Would register"
    print(f"{verb} {added} Stride session(s), carrying {touched_total} touched file(s).")
    print(f"  {already} already in the graph, {skipped} not Stride, {unreadable} unreadable.")
    if not write and added:
        print("\nNothing was written. Re-run with --write to add them.")


if __name__ == "__main__":
    main()
