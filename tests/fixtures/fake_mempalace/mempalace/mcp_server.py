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


def tool_search(query: str, limit: int = 5, wing: str = None, room: str = None, **_kwargs):
    return {
        "success": True,
        "mode": "search",
        "query": query,
        "wing": wing,
        "room": room,
        "limit": limit,
    }


def tool_add_drawer(wing: str, room: str, content: str, added_by: str = "mcp", **_kwargs):
    return {"success": True, "wing": wing, "room": room, "content": content, "added_by": added_by}


def tool_kg_add(subject: str, predicate: str, object: str, **_kwargs):
    return {"success": True, "subject": subject, "predicate": predicate, "object": object}


def tool_diary_write(agent_name: str, entry: str, topic: str = "autosave", **_kwargs):
    return {"success": True, "agent": agent_name, "entry": entry, "topic": topic}
