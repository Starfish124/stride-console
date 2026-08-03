#!/usr/bin/env python3
"""Register a finished Claude session with the Stride knowledge graph.

Runs as a SessionEnd hook. Claude Code hands it a JSON payload on stdin with
the transcript path, so this reads the session that just ended, decides
whether it is Stride work, renders it as markdown and posts it to the
console.

Two ways a session counts:
  - it ran inside a Stride project folder (nobody should have to remember)
  - somebody said the marker phrase during it (for the sessions that don't)

It never blocks and never speaks: a hook that fails loudly at the end of
somebody's session is worse than a graph with a gap. Failures go to a log
beside the token.
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime
from pathlib import Path

CONFIG = Path.home() / ".stride-graph" / "config.json"
LOG = Path.home() / ".stride-graph" / "hook.log"

MARKER = re.compile(r"stride\s+context", re.I)
# Folder names that are Stride work by definition.
STRIDE_DIRS = re.compile(r"stride|ai-agency-website", re.I)


def note(message):
    try:
        LOG.parent.mkdir(parents=True, exist_ok=True)
        with LOG.open("a", encoding="utf-8") as fh:
            fh.write(f"{datetime.now().isoformat(timespec='seconds')} {message}\n")
    except Exception:
        pass


def text_of(content):
    """A message's text, whatever shape the content took."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"
        )
    return ""


def parse(path):
    d = {
        "title": None, "cwd": None, "branch": None, "prompts": [], "ts": [],
        "files": Counter(), "tools": Counter(), "answers": [],
    }
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                o = json.loads(line)
            except Exception:
                continue
            t = o.get("type")
            if t == "ai-title" and o.get("aiTitle"):
                d["title"] = o["aiTitle"]
            if o.get("cwd") and not d["cwd"]:
                d["cwd"] = o["cwd"]
            if o.get("gitBranch"):
                d["branch"] = o["gitBranch"]
            if o.get("timestamp"):
                d["ts"].append(o["timestamp"])
            if o.get("isSidechain"):
                continue
            msg = o.get("message") or {}
            if t == "user" and not o.get("isMeta") and not o.get("toolUseResult"):
                txt = text_of(msg.get("content")).strip()
                if txt and not txt.startswith("<"):
                    d["prompts"].append(txt)
            elif t == "assistant":
                for b in msg.get("content") or []:
                    if not isinstance(b, dict):
                        continue
                    if b.get("type") == "text" and b.get("text", "").strip():
                        d["answers"].append(b["text"].strip())
                    if b.get("type") == "tool_use":
                        d["tools"][b.get("name", "?")] += 1
                        inp = b.get("input") or {}
                        fp = inp.get("file_path") or inp.get("notebook_path")
                        if fp:
                            d["files"][fp] += 1
    return d


def is_stride(d):
    if d["cwd"] and STRIDE_DIRS.search(d["cwd"]):
        return True
    return any(MARKER.search(p) for p in d["prompts"])


def render(d, session_id):
    """Markdown the graph can read: what was asked, what was touched, what was said."""
    title = d["title"] or (d["prompts"][0][:70] if d["prompts"] else "Session")
    when = min(d["ts"])[:10] if d["ts"] else datetime.now().date().isoformat()
    lines = [
        "---",
        f'title: "{title.replace(chr(34), chr(39))}"',
        "type: claude-session",
        f"date: {when}",
        f"project: {Path(d['cwd']).name if d['cwd'] else 'unknown'}",
        f"session: {session_id}",
    ]
    if d["branch"]:
        lines.append(f"branch: {d['branch']}")
    lines += ["---", "", f"# {title}", ""]

    if d["cwd"]:
        lines += [f"Worked in `{d['cwd']}`.", ""]

    if d["prompts"]:
        lines += ["## What was asked", ""]
        lines += [f"- {p[:400]}" for p in d["prompts"][:25]]
        lines.append("")

    if d["files"]:
        lines += ["## Files touched", ""]
        lines += [f"- `{f}` ({n})" for f, n in d["files"].most_common(40)]
        lines.append("")

    if d["tools"]:
        summary = ", ".join(f"{name} {n}" for name, n in d["tools"].most_common(10))
        lines += ["## Tools", "", summary, ""]

    if d["answers"]:
        lines += ["## What was done", ""]
        # The last few answers carry the outcome; the middle is working-out.
        lines += [a[:1500] for a in d["answers"][-4:]]
        lines.append("")

    return "\n".join(lines)


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return
    transcript = payload.get("transcript_path")
    session_id = payload.get("session_id", "unknown")
    if not transcript or not os.path.exists(transcript):
        return

    try:
        config = json.loads(CONFIG.read_text())
        url, token = config["url"], config["token"]
    except Exception:
        note("no config; run the connect command again")
        return

    try:
        d = parse(transcript)
    except Exception as err:
        note(f"parse failed: {err}")
        return

    if not d["prompts"]:
        return
    if not is_stride(d):
        return

    body = json.dumps({
        "sessionId": session_id,
        "title": d["title"] or d["prompts"][0][:70],
        "markdown": render(d, session_id),
    }).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            note(f"registered {session_id} ({res.status})")
    except urllib.error.HTTPError as err:
        note(f"refused {session_id}: {err.code}")
    except Exception as err:
        # The Mac may be asleep or off the network. The session is already
        # in ~/.claude/projects; a later run can still pick it up.
        note(f"unreachable: {err}")


if __name__ == "__main__":
    main()
