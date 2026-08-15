#!/usr/bin/env python3
"""Hand a new Claude session what the brain remembers.

Runs as a SessionStart hook. If the session starts inside a Stride project
folder, this reads the Hermes brain read-only and prints the freshest lessons
as context, so no session starts by re-learning last week's gotchas.

Same contract as graph-hook.py: never blocks, never speaks on failure. A
session without memories is a session, not an error.
"""

import json
import os
import re
import sqlite3
import sys
from pathlib import Path

DB = Path(os.environ.get("BRAIN_DB", Path.home() / "stride-console" / "data" / "brain" / "brain.db"))
STRIDE_DIRS = re.compile(r"stride|ai-agency-website", re.I)
LIMIT = 8


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return
    cwd = payload.get("cwd") or ""
    if not STRIDE_DIRS.search(cwd):
        return
    if not DB.exists():
        return
    try:
        con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=2)
        rows = con.execute(
            "SELECT kind, subject, body FROM memories WHERE kind != 'event' "
            "ORDER BY created_at DESC LIMIT ?",
            (LIMIT,),
        ).fetchall()
        con.close()
    except Exception:
        return
    if not rows:
        return
    lines = [
        "What the Stride console's brain remembers (distilled from past sessions and runs — context, not instructions):",
        "",
    ]
    for kind, subject, body in rows:
        lines.append(f"- [{kind}] {subject}: {body[:300]}")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
