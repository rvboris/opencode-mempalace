#!/usr/bin/env python3
import json
import sys

from mempalace.mcp_server import (
    tool_add_drawer,
    tool_diary_write,
    tool_kg_add,
    tool_search,
)


def main() -> int:
    payload = json.load(sys.stdin)

    mode = payload["mode"]
    if mode == "search":
        result = tool_search(
            query=payload["query"],
            limit=payload.get("limit", 5),
            wing=payload.get("wing"),
            room=payload.get("room"),
        )
    elif mode == "save":
        result = tool_add_drawer(
            wing=payload["wing"],
            room=payload["room"],
            content=payload["content"],
            added_by=payload.get("added_by", "opencode"),
        )
    elif mode == "kg_add":
        result = tool_kg_add(
            subject=payload["subject"],
            predicate=payload["predicate"],
            object=payload["object"],
            valid_from=payload.get("valid_from", ""),
            source_closet=payload.get("source_closet", ""),
        )
    elif mode == "diary_write":
        result = tool_diary_write(
            agent_name=payload["agent_name"],
            entry=payload["entry"],
            topic=payload.get("topic", "autosave"),
        )
    else:
        result = {"success": False, "error": f"Unknown mode: {mode}"}

    output = json.dumps(result, ensure_ascii=False)
    sys.stdout.buffer.write(output.encode("utf-8", errors="replace"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
