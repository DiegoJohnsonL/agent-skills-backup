#!/usr/bin/env python3
"""Utilities for parsing Ralph-style PRD markdown with a fenced JSON task block."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

STATUS_COMPLETE = {"completed"}
STATUS_INCOMPLETE = {"pending", "in_progress", "blocked", "failed"}


@dataclass(frozen=True)
class Task:
    id: str
    title: str
    description: str
    status: str | None
    passes: bool | None

    @property
    def is_complete(self) -> bool:
        # Require at least one explicit completion signal.
        if self.status is None and self.passes is None:
            return False

        status_complete = self.status == "completed" if self.status is not None else True
        passes_complete = self.passes is True if self.passes is not None else True
        return status_complete and passes_complete


def _id_key(task_id: str) -> tuple[Any, ...]:
    parts: list[Any] = []
    for part in task_id.split("."):
        if part.isdigit():
            parts.append(int(part))
        else:
            parts.append(part)
    return tuple(parts)


def _extract_prd_json_block(markdown: str) -> dict[str, Any]:
    pattern = re.compile(r"```json\s*(\{.*?\})\s*```", re.DOTALL)
    matches = pattern.findall(markdown)
    if not matches:
        raise ValueError("No fenced ```json block found in PRD")

    for candidate in matches:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and "description" in parsed and "tasks" in parsed:
            return parsed

    raise ValueError("No valid PRD JSON block containing description and tasks")


def load_prd(prd_path: str | Path) -> dict[str, Any]:
    content = Path(prd_path).read_text(encoding="utf-8")
    return _extract_prd_json_block(content)


def parse_tasks(prd: dict[str, Any]) -> list[Task]:
    tasks_raw = prd.get("tasks")
    if not isinstance(tasks_raw, list):
        raise ValueError("PRD field 'tasks' must be a list")

    parsed: list[Task] = []
    for raw in tasks_raw:
        if not isinstance(raw, dict):
            raise ValueError("Each task must be an object")

        task_id = raw.get("id")
        title = raw.get("title")
        description = raw.get("description")
        status = raw.get("status")
        passes = raw.get("passes")

        if not isinstance(task_id, str) or not task_id:
            raise ValueError("Each task.id must be a non-empty string")
        if not isinstance(title, str) or not title:
            raise ValueError(f"Task {task_id} has invalid title")
        if not isinstance(description, str) or not description:
            raise ValueError(f"Task {task_id} has invalid description")

        if status is not None:
            if not isinstance(status, str):
                raise ValueError(f"Task {task_id} has non-string status")
            if status not in STATUS_COMPLETE.union(STATUS_INCOMPLETE):
                raise ValueError(f"Task {task_id} has unsupported status: {status}")

        if passes is not None and not isinstance(passes, bool):
            raise ValueError(f"Task {task_id} has non-boolean passes")

        parsed.append(
            Task(
                id=task_id,
                title=title,
                description=description,
                status=status,
                passes=passes,
            )
        )

    return sorted(parsed, key=lambda t: _id_key(t.id))


def next_incomplete_task(tasks: Iterable[Task]) -> Task | None:
    for task in tasks:
        if not task.is_complete:
            return task
    return None


def summary(tasks: Iterable[Task]) -> dict[str, int]:
    task_list = list(tasks)
    total = len(task_list)
    completed = sum(1 for t in task_list if t.is_complete)
    return {
        "total": total,
        "completed": completed,
        "incomplete": total - completed,
    }


def cmd_next(args: argparse.Namespace) -> int:
    prd = load_prd(args.prd)
    tasks = parse_tasks(prd)
    nxt = next_incomplete_task(tasks)
    if nxt is None:
        print("{}")
        return 3
    print(
        json.dumps(
            {
                "id": nxt.id,
                "title": nxt.title,
                "description": nxt.description,
                "status": nxt.status,
                "passes": nxt.passes,
            }
        )
    )
    return 0


def cmd_complete(args: argparse.Namespace) -> int:
    prd = load_prd(args.prd)
    tasks = parse_tasks(prd)
    done = next_incomplete_task(tasks) is None
    print("true" if done else "false")
    return 0


def cmd_summary(args: argparse.Namespace) -> int:
    prd = load_prd(args.prd)
    tasks = parse_tasks(prd)
    nxt = next_incomplete_task(tasks)
    out = summary(tasks)
    if nxt is not None:
        out["next_task_id"] = nxt.id
    print(json.dumps(out))
    return 0


def cmd_lint(args: argparse.Namespace) -> int:
    try:
        prd = load_prd(args.prd)
        tasks = parse_tasks(prd)
    except Exception as exc:  # noqa: BLE001
        print(f"PRD lint failed: {exc}", file=sys.stderr)
        return 1

    for task in tasks:
        desc = task.description
        for section in ("Context:", "Task:", "Validation:"):
            if section not in desc:
                print(
                    f"PRD lint failed: task {task.id} description missing '{section}'",
                    file=sys.stderr,
                )
                return 1

    print("PRD lint passed")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Parse and validate Ralph PRD files")
    sub = parser.add_subparsers(dest="command", required=True)

    for name, fn in (
        ("next", cmd_next),
        ("complete", cmd_complete),
        ("summary", cmd_summary),
        ("lint", cmd_lint),
    ):
        sp = sub.add_parser(name)
        sp.add_argument("--prd", required=True)
        sp.set_defaults(func=fn)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
