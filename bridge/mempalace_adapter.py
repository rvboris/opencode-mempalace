#!/usr/bin/env python3
import json
import sys
import tempfile
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from mempalace.config import MempalaceConfig
from mempalace.convo_miner import mine_convos
import mempalace.mcp_server as mcp_server


restore_stdout = getattr(mcp_server, "_restore_stdout", None)
if callable(restore_stdout):
    restore_stdout()


def write_result(result: dict) -> None:
    output = json.dumps(result, ensure_ascii=False)
    sys.stdout.buffer.write(output.encode("utf-8", errors="replace"))
    sys.stdout.buffer.flush()


def write_utf8_text(path: Path, text: str) -> None:
    path.write_bytes(text.encode("utf-8", errors="replace"))


def main() -> int:
    try:
        payload = json.load(sys.stdin)

        mode = payload["mode"]
        if mode == "search":
            result = mcp_server.tool_search(
                query=payload["query"],
                limit=payload.get("limit", 5),
                wing=payload.get("wing"),
                room=payload.get("room"),
            )
        elif mode == "save":
            result = mcp_server.tool_add_drawer(
                wing=payload["wing"],
                room=payload["room"],
                content=payload["content"],
                added_by=payload.get("added_by", "opencode"),
            )
        elif mode == "kg_add":
            result = mcp_server.tool_kg_add(
                subject=payload["subject"],
                predicate=payload["predicate"],
                object=payload["object"],
                valid_from=payload.get("valid_from", ""),
                source_closet=payload.get("source_closet", ""),
            )
        elif mode == "diary_write":
            result = mcp_server.tool_diary_write(
                agent_name=payload["agent_name"],
                entry=payload["entry"],
                topic=payload.get("topic", "autosave"),
            )
        elif mode == "mine_messages":
            palace_path = payload.get("palace_path") or MempalaceConfig().palace_path
            extract_mode = payload.get("extract_mode", "general")
            with tempfile.TemporaryDirectory(prefix="mempalace-autosave-") as tmpdir:
                transcript_path = Path(tmpdir) / "session.txt"
                write_utf8_text(transcript_path, payload["transcript"])
                with redirect_stdout(StringIO()):
                    mine_convos(
                        convo_dir=tmpdir,
                        palace_path=palace_path,
                        wing=payload.get("wing"),
                        agent=payload.get("agent", "opencode"),
                        extract_mode=extract_mode,
                    )
            result = {
                "success": True,
                "mode": "mine_messages",
                "wing": payload.get("wing"),
            }
        else:
            result = {"success": False, "error": f"Unknown mode: {mode}"}
    except Exception as error:
        result = {"success": False, "error": str(error)}

    write_result(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
