import os
import sys

_REAL_STDOUT = sys.stdout
_REAL_STDOUT_FD = None
try:
    _REAL_STDOUT_FD = os.dup(1)
    os.dup2(2, 1)
except OSError:
    _REAL_STDOUT_FD = None
sys.stdout = sys.stderr


def _restore_stdout():
    global _REAL_STDOUT_FD
    if _REAL_STDOUT_FD is not None:
        os.dup2(_REAL_STDOUT_FD, 1)
        os.close(_REAL_STDOUT_FD)
        _REAL_STDOUT_FD = None
    sys.stdout = _REAL_STDOUT


def tool_search(query: str, limit: int = 5, wing: str = None, room: str = None, source_file: str = None, **_kwargs):
    return {
        "success": True,
        "mode": "search",
        "query": query,
        "wing": wing,
        "room": room,
        "limit": limit,
        "source_file": source_file,
    }


def tool_add_drawer(wing: str, room: str, content: str, added_by: str = "mcp", **_kwargs):
    return {"success": True, "wing": wing, "room": room, "content": content, "added_by": added_by}


def tool_kg_add(subject: str, predicate: str, object: str, **_kwargs):
    return {"success": True, "subject": subject, "predicate": predicate, "object": object}


def tool_diary_write(agent_name: str, entry: str, topic: str = "autosave", **_kwargs):
    return {"success": True, "agent": agent_name, "entry": entry, "topic": topic}


def tool_delete_drawer(drawer_id: str, **_kwargs):
    return {"success": True, "deleted": drawer_id}


def tool_delete_by_source(source_file: str, dry_run: bool = True, **_kwargs):
    return {"success": True, "source_file": source_file, "dry_run": dry_run, "drawer_count": 0}


def tool_kg_query(entity: str, as_of: str = None, direction: str = "both", **_kwargs):
    return {"entity": entity, "as_of": as_of, "direction": direction, "facts": [], "count": 0}


def tool_diary_read(agent_name: str, last_n: int = 10, wing: str = "", **_kwargs):
    return {"agent_name": agent_name, "last_n": last_n, "wing": wing, "entries": []}


def tool_checkpoint(items, diary=None, dedup_threshold=0.9, **_kwargs):
    return {"added": [], "duplicates": [], "errors": [], "items_count": len(items)}
