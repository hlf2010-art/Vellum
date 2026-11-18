"""Studio AI (Start Studio AI.command) picks the sampling temperature from Vellum's stance.

Run: python3 tests/test_studio_ai.py
"""
import ast
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "Start Studio AI.command"


def load():
    tree = ast.parse(SRC.read_text(encoding="utf-8"))
    keep = [n for n in tree.body
            if (isinstance(n, ast.Assign) and any(getattr(t, "id", "") == "STANCE_TEMPERATURE" for t in n.targets))
            or (isinstance(n, ast.FunctionDef) and n.name == "sampling_temperature")]
    ns = {}
    exec(compile(ast.Module(body=keep, type_ignores=[]), str(SRC), "exec"), ns)
    return ns["sampling_temperature"]


def main():
    temp = load()
    checks = [
        ("a fact answer runs cold, as prose or JSON", temp("fact", False) == 0.15 and temp("fact", True) == 0.15),
        ("a creative fork runs warm (0.7 JSON, 0.9 prose)", temp("create", True) == 0.7 and temp("create", False) == 0.9),
        ("no stance keeps 0.35 for JSON and 0.65 for prose", temp(None, True) == 0.35 and temp("", False) == 0.65),
        ("an unknown stance falls back the same way", temp("bogus", False) == 0.65),
        ("the request handler uses it", 'sampling_temperature(body.get("stance"), is_json)' in SRC.read_text(encoding="utf-8")),
    ]
    for name, ok in checks:
        print(("PASS  " if ok else "FAIL  ") + name)
    if not all(ok for _, ok in checks):
        raise SystemExit(1)
    print("all passed")


if __name__ == "__main__":
    main()
