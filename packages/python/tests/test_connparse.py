from __future__ import annotations

import json
import pathlib
import unittest

from connparse import canonicalize, equivalent, get_built_in_definitions, parse, parse_normalize

ROOT = pathlib.Path(__file__).resolve().parents[3]
FIXTURES = json.loads((ROOT / "specs/fixtures/compatibility.json").read_text())


def get_path(value, path):
    current = value
    for part in path.split("."):
        if isinstance(current, list):
            current = current[int(part)]
        else:
            current = current[part]
    return current


class ConnparseTests(unittest.TestCase):
    def test_shared_fixtures(self):
        for fixture in FIXTURES:
            with self.subTest(fixture=fixture["name"]):
                options = {"provider": fixture["provider"]} if fixture.get("provider") else {}
                result = parse(fixture["input"], options)
                self.assertTrue(result["ok"], result["errors"])
                self.assertEqual(result["value"]["raw"], fixture["input"])
                self.assertEqual(sorted(result["value"].keys()), [
                    "authority",
                    "credentials",
                    "fragment",
                    "options",
                    "path",
                    "query",
                    "raw",
                    "resource",
                    "safe",
                    "scheme",
                    "type",
                ])
                self.assertEqual(result["warnings"], [])
                if isinstance(result["value"]["authority"].get("hosts"), list):
                    self.assertNotIn("host", result["value"]["authority"])
                    self.assertNotIn("port", result["value"]["authority"])
                for path, expected in fixture["expected"].items():
                    self.assertEqual(get_path(result["value"], path), expected, path)

    def test_shared_fixtures_strict(self):
        for fixture in FIXTURES:
            with self.subTest(fixture=fixture["name"]):
                options = {"strict": True}
                if fixture.get("provider"):
                    options["provider"] = fixture["provider"]
                result = parse(fixture["input"], options)
                self.assertTrue(result["ok"], result["errors"])
                self.assertEqual(result["warnings"], [])

    def test_provider_coverage(self):
        ids = {definition["id"] for definition in get_built_in_definitions()}
        covered = set()
        for fixture in FIXTURES:
            options = {"provider": fixture["provider"]} if fixture.get("provider") else {}
            result = parse(fixture["input"], options)
            if result["ok"]:
                covered.add(fixture.get("provider") or result["value"]["scheme"])
        self.assertFalse(ids - covered)

    def test_parse_normalize_and_canonicalize(self):
        left = parse_normalize("postgresql://user:pass@LOCALHOST:5432/app?sslmode=require&application_name=myapp")
        right = parse_normalize("postgres://localhost/app?application_name=myapp&sslmode=require")
        self.assertTrue(left["ok"])
        self.assertTrue(right["ok"])
        self.assertEqual(left["value"], right["value"])
        self.assertEqual(left["value"]["canonical"], "postgres://localhost/app?application_name=myapp&sslmode=require")
        self.assertEqual(canonicalize("postgresql://localhost:5432/app"), "postgres://localhost/app")
        self.assertTrue(equivalent("postgresql://localhost:5432/app", "postgres://localhost/app"))

    def test_validation(self):
        self.assertFalse(parse("postgres://localhost/app?sslmode=invalid")["ok"])
        self.assertFalse(parse("postgres://localhost/app?unexpected=1", {"strict": True})["ok"])
        self.assertTrue(parse("unknown+db://example.com/main")["ok"])
        self.assertFalse(parse("unknown+db://example.com/main", {"strict": True})["ok"])


if __name__ == "__main__":
    unittest.main()
