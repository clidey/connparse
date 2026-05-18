#!/usr/bin/env python3
from __future__ import annotations

import json
import sys

from connparse import parse


def main() -> int:
    payload = json.loads(sys.stdin.read() or "{}")
    result = parse(payload.get("input", ""), payload.get("options") or {})
    print(json.dumps(result, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
