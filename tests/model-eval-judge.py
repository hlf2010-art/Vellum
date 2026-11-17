#!/usr/bin/env python3
"""Blind-judge Vellum model-eval results with a strong model, and compare runs.

Each output from tests/model-eval.cjs is scored on its own, without knowing which model or which version
of Vellum produced it, against a five-point rubric for its task (0-2 each, 10 in all). The summary gives
each run's mean score per task, and its share of the reference run's mean.

  python3 tests/model-eval-judge.py model-eval-results/*.json --ref sonnet-ref
  options: --judge anthropic/claude-sonnet-5.5   --base https://openrouter.ai/api/v1   --out judged.md

The key is read from VELLUM_EVAL_KEY. A judge that shares a model with one of the runs may favour it.
"""
import argparse, json, os, random, re, sys, time, urllib.request
from pathlib import Path

CONTEXT = {
    "fork": 'A designer wrote the idea "I want to make an RPG set in Shanghai." and added: "I am not sure what kind of RPG yet. What are a few really different directions this could go?" An AI teammate answered with three directions, each with a test that could fail.',
    "push": 'The board holds the idea "I want to make an RPG set in Shanghai." and three draft directions: A "Lane House Chronicle" (a narrative RPG in one Shanghai lilong across 1925, 1937 and 1949, where relationships with neighbours shape who stays, leaves or informs), B "Concession Ledger Sim" (a systems-heavy RPG running a 1930s trading house: debts, gang protection, consuls, recruited agents, a map of districts), C "Neon Pudong Cardfighter" (near-future card tactics). With B selected, the designer asked: "Isn\'t a trading-house sim really a strategy game, not an RPG? What would make this one feel like a role-playing game?" An AI teammate replied.',
    "merge": 'Same board (A "Lane House Chronicle": one lilong across 1925/1937/1949, relationships with neighbours; B "Concession Ledger Sim": 1930s trading house, debts, gangs, consuls, agents, district map; C disliked, A liked). The designer had asked whether B is really a strategy game; after an answer, the designer said: "Character-driven, with the ledger as the pressure. Honestly the lane-house one pulls at me more than this. Could the trading house live inside that lilong instead of being its own game?" An AI teammate replied.',
    "build": 'Direction A "Lane House Chronicle" (a narrative RPG in one Shanghai lilong across 1925, 1937 and 1949, where dialogue choices and relationships with neighbours shape who stays, leaves or informs) was adopted. The designer asked: "Build a prototype of the opening scene: the night in 1937 when the lane hears the shelling". An AI teammate wrote the content of a step-by-step prototype page (title, lede, items, optional choices).',
}
RUBRIC = {
    "fork": ["Specific to the real setting: concrete, accurate places, eras, groups or objects of Shanghai, not generic city flavour",
             "Each is a playable game: a clear player role and a core action the player repeats",
             "The three directions are genuinely different from each other (genre/mechanic, era/part of the city, player)",
             "Each test is concrete and falsifiable, and checks the experience the direction depends on (not trivia)",
             "Free of errors: no factual or historical mistakes, wrong city, anachronism, nonsense, or broken format"],
    "push": ["Answers the designer's actual point directly and honestly",
             "Suggestions are concrete and specific to this card, not generic design advice",
             "Grounded in the board: no invented facts, tests, results, or claims of work done",
             "Moves the decision forward, ending with one useful question",
             "Clean: readable length and format, no errors or confusions about the cards"],
    "merge": ["Engages the designer's proposal (folding B into A) and says clearly whether and how it works",
              "Suggestions are concrete and use what A and B actually contain (the lilong, neighbours, debts, the years)",
              "Grounded in the board: no invented facts, tests, results, or claims of work done",
              "Moves the decision forward, naming a cost or trade-off and ending with one useful question",
              "Clean: readable length and format, no errors or confusions about the cards (e.g. the lilong is one lane, not districts)"],
    "build": ["Builds what was asked: the night in 1937 when the lane hears the shelling",
              "Is the experience itself (what the player reads and does, in order), not a description of a prototype",
              "Has specific local and historical texture (lilong/shikumen life, neighbours with names, 1937 Shanghai)",
              "Choices are meaningful and fit the direction (relationships, staying or leaving, informing)",
              "Free of errors: no anachronism, wrong place, nonsense, or broken structure"],
}


def show(task, out):
    if out is None:
        return "(no output)"
    if task == "fork":
        return "\n".join(f"- {d.get('title')}: {d.get('text')} Test: {d.get('test')}" for d in out)
    if task == "build":
        items = "\n".join(f"- {i.get('title')}: {i.get('body')}" + (f" (choices: {' / '.join(i['choices'])})" if i.get('choices') else "") for i in out.get("items", []))
        return f"Title: {out.get('title')}\nKicker: {out.get('kicker')}\nLede: {out.get('lede')}\nItems:\n{items}\nButton: {out.get('cta')}"
    return str(out)


def judge(base, model, key, task, out):
    crit = "\n".join(f"{i + 1}. {c}" for i, c in enumerate(RUBRIC[task]))
    prompt = f"""You are a strict, fair reviewer of an AI design teammate's work. Score only what is in the answer.

Situation: {CONTEXT[task]}

The teammate's answer:
<<<
{show(task, out)}
>>>

Score each criterion 0 (not met), 1 (partly met) or 2 (fully met). A strong expert answer earns 9-10; generic but correct work earns about 5; broken or wrong work earns 0-3.
{crit}

Reply with only JSON: {{"scores": [5 integers], "worst": "the single biggest problem, in one short sentence"}}"""
    body = {"model": model, "temperature": 0, "max_tokens": 300, "messages": [{"role": "user", "content": prompt}]}
    req = urllib.request.Request(base.rstrip("/") + "/chat/completions", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + key})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                txt = json.load(r)["choices"][0]["message"]["content"]
            j = json.loads(re.search(r"\{[\s\S]*\}", txt).group(0))
            s = [max(0, min(2, int(x))) for x in j["scores"]][:5]
            if len(s) == 5:
                return sum(s), s, j.get("worst", "")
        except Exception as e:  # retry transient errors
            err = e
            time.sleep(2 + attempt * 3)
    raise RuntimeError(f"judge failed: {err}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--ref", default="sonnet-ref", help="label of the reference run")
    ap.add_argument("--judge", default="anthropic/claude-sonnet-5.5")
    ap.add_argument("--base", default="https://openrouter.ai/api/v1")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    key = os.environ.get("VELLUM_EVAL_KEY") or sys.exit("Set VELLUM_EVAL_KEY")
    samples = []
    for f in a.files:
        d = json.load(open(f))
        for r in d["results"]:
            samples.append({"label": d["meta"]["label"], "task": r["task"], "i": r["i"], "out": r.get("out"), "flags": r.get("flags", []), "error": r.get("error")})
    random.Random(7).shuffle(samples)  # blind order
    cache_p = Path(a.out or "judged.md").with_suffix(".cache.json")
    cache = json.loads(cache_p.read_text()) if cache_p.exists() else {}
    for s in samples:
        k = f"{a.judge}|{s['label']}|{s['task']}|{s['i']}"
        if k not in cache:
            if s["error"] or s["out"] in (None, "", []):
                cache[k] = [0, [0] * 5, "no output: " + str(s["error"] or "empty")]
            else:
                cache[k] = list(judge(a.base, a.judge, key, s["task"], s["out"]))
            cache_p.write_text(json.dumps(cache, indent=1))
            print(f"{s['task']:6} {s['label']:22} #{s['i'] + 1}  {cache[k][0]:>2}/10  {cache[k][2][:90]}", flush=True)
        s["score"], s["parts"], s["worst"] = cache[k]
    labels = list(dict.fromkeys(json.load(open(f))["meta"]["label"] for f in a.files))  # in the order given
    tasks = [t for t in ["fork", "push", "merge", "build"] if any(s["task"] == t for s in samples)]
    mean = lambda L, t: (lambda xs: sum(xs) / len(xs) if xs else None)([s["score"] for s in samples if s["label"] == L and s["task"] == t])
    lines = [f"# Blind judgement · judge: {a.judge}", "", "Mean score out of 10 per task (share of the reference run in brackets).", "",
             "| Run | " + " | ".join(tasks) + " | All |", "|---|" + "---|" * (len(tasks) + 1)]
    for L in labels:
        cells, tot, rtot = [], [], []
        for t in tasks:
            m, r = mean(L, t), mean(a.ref, t)
            if m is None:
                cells.append("–"); continue
            tot.append(m); rtot.append(r or 0)
            cells.append(f"{m:.1f}" + (f" ({m / r * 100:.0f}%)" if r and L != a.ref else ""))
        allm = sum(tot) / len(tot) if tot else 0
        allr = sum(rtot) / len(rtot) if rtot else 0
        lines.append(f"| {L} | " + " | ".join(cells) + f" | {allm:.1f}" + (f" ({allm / allr * 100:.0f}%)" if allr and L != a.ref else "") + " |")
    lines += ["", "## Per sample", ""]
    for t in tasks:
        for L in labels:
            for s in sorted([x for x in samples if x["label"] == L and x["task"] == t], key=lambda x: x["i"]):
                lines.append(f"- **{t} · {L} #{s['i'] + 1}: {s['score']}/10** ({'-'.join(map(str, s['parts']))}) {s['worst']}")
    out = "\n".join(lines)
    Path(a.out or "judged.md").write_text(out)
    print("\n" + "\n".join(lines[:6 + len(labels)]))


if __name__ == "__main__":
    main()
