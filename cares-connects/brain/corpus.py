"""Generate the training corpus for the CARES Connects brain.

Same idea as the CryptoBlocks brain: a closed world, every fact asked many
ways, answered ONE way. Two kinds of turns:

    U: we got evicted and have nowhere to go
    A: [need:shelter-and-housing]

    U: is this free
    A: Yes. CARES Connects is free to use, and you do not need an account.

The widget parses "[need:<slug>]" to pick a category, "[crisis]" to show crisis
lines, and shows any other answer as text. Inputs are normalized the same way
here and in the widget (lowercase, a small character set) so the brain sees at
inference exactly the alphabet it trained on.

A slice of phrasings is held out to brain/eval.jsonl for an honest accuracy check.

    python corpus.py --target-mb 2.5
"""

from __future__ import annotations

import argparse
import json
import random
import re
from collections import Counter, defaultdict
from pathlib import Path

import facts as F

SEP = "\n\n"
ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "data" / "seed" / "directory.json"
GEO = ROOT / "src" / "server" / "data" / "ca-geo.json"


def normalize(text: str) -> str:
    """Must match normalize() in public/brain/brain-worker.js."""
    t = text.lower().replace("’", "'").replace("'", "")
    t = re.sub(r"[^a-z0-9 ?.,/-]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def turn(q: str, a: str) -> str:
    return f"U: {normalize(q)}\nA: {a}{SEP}"


NEED_TEMPLATES = [
    "{x}", "i need {x}", "need {x}", "i need help with {x}", "looking for {x}", "i am looking for {x}",
    "where can i get {x}", "where can i find {x}", "can you help me find {x}", "help me find {x}",
    "is there {x} near me", "{x} near me", "any {x} near me", "my family needs {x}", "we need {x}",
    "my mom needs {x}", "my son needs {x}", "who has {x}", "who offers {x}", "i want {x}", "i would like {x}",
    "do you know where i can get {x}", "how do i get {x}", "help with {x}", "{x} please", "i need {x} asap",
    "i really need {x}", "searching for {x}", "options for {x}", "i am trying to find {x}",
]
# Openers and endings wrap every need at random, so the wrapper carries no signal and the
# model has to read the need itself (the first model keyed on wrappers like "could you…").
PREFIXES = ["", "", "", "hi ", "hello ", "hey, ", "please ", "so ", "um ", "ok ", "excuse me, ", "i was wondering, "]
SUFFIXES = ["", "", "", " please", " for my family", " in my area", " today", " right now", " for my kids",
            " for my mom", " thanks", " near me", " in my town", " asap", " for me"]
WRAPS_PER_TEMPLATE = 3

SITUATION_TEMPLATES = ["{s}", "{s}. what can i do", "{s}, can you help", "help, {s}", "{s} and need help",
                       "{s}. where do i go", "{s} please help", "hi, {s}"]
# Held out from training; used only by eval.jsonl to measure generalization.
HELDOUT_NEED = ["could you point me to {x}", "anywhere with {x}", "trying to get {x} for my family"]
HELDOUT_SIT = ["so {s}, what now", "{s} and i dont know what to do"]


def place_words() -> set[str]:
    geo = json.loads(GEO.read_text())
    return {c["name"].lower() for c in geo["counties"]}


def tag_phrases(seed: dict) -> dict[str, list[str]]:
    """Tags from real listings that point to one category at least 60% of the time."""
    counts: dict[str, Counter] = defaultdict(Counter)
    for r in seed["resources"]:
        for t in r["tags"]:
            for c in r["categories"]:
                counts[t][c] += 1
    places = place_words()
    city_like = {t for r in seed["resources"] for t in r["tags"] if r["address"] and t in r["address"].lower()}
    out: dict[str, list[str]] = defaultdict(list)
    for tag, by_cat in counts.items():
        cat, top = by_cat.most_common(1)[0]
        total = sum(by_cat.values())
        if total < 2 or top / total < 0.6:
            continue
        if tag in F.TAG_STOPLIST or tag in city_like or any(p in tag for p in places):
            continue
        if not re.fullmatch(r"[a-z0-9 '/-]{3,40}", tag):
            continue
        out[cat].append(tag)
    return out


def phrase_table(phrases: dict[str, list[str]], situations: dict[str, list[str]]) -> dict[str, str]:
    """Need phrase → category for the widget's exact-match pass (public/brain/phrases.json).
    Phrases claimed by more than one category are dropped rather than guessed."""
    owners: dict[str, set[str]] = defaultdict(set)
    merged = {cat: list(xs) + list(situations.get(cat, [])) for cat, xs in phrases.items()}
    for cat, xs in merged.items():
        for x in xs:
            key = normalize(re.sub(r"^(a|an|some|the) ", "", x))
            if len(key) >= 3:
                owners[key].add(cat)
    return {k: next(iter(v)) for k, v in sorted(owners.items()) if len(v) == 1}


def build(target_mb: float, seed: int = 7) -> tuple[str, list[dict]]:
    rng = random.Random(seed)
    data = json.loads(SEED.read_text())
    valid = {c["slug"] for c in data["categories"]}
    missing = set(F.NEED_PHRASES) - valid
    if missing:
        raise SystemExit(f"NEED_PHRASES has unknown categories: {missing}")

    phrases: dict[str, list[str]] = {c: list(F.NEED_PHRASES.get(c, [])) for c in valid}
    for cat, tags in tag_phrases(data).items():
        phrases[cat].extend(t for t in tags if t not in phrases[cat])
    names = {c["slug"]: c["name"].lower().replace("&", "and").replace("/", " ") for c in data["categories"]}
    for slug, name in names.items():
        phrases[slug].append(name)

    need_turns: list[str] = []
    eval_rows: list[dict] = []
    for cat, xs in phrases.items():
        label = f"[need:{cat}]"
        for x in xs:
            for tpl in NEED_TEMPLATES:
                core = tpl.format(x=x)
                for _ in range(WRAPS_PER_TEMPLATE):
                    need_turns.append(turn(rng.choice(PREFIXES) + core + rng.choice(SUFFIXES), label))
            eval_rows.append({"q": normalize(rng.choice(HELDOUT_NEED).format(x=x)), "a": label})
        sits = F.SITUATIONS.get(cat, [])
        for s in sits:
            # Situations are few next to tag phrases, so each gets its bare form plus many wraps.
            need_turns.append(turn(s, label))
            for tpl in SITUATION_TEMPLATES:
                core = tpl.format(s=s)
                for _ in range(WRAPS_PER_TEMPLATE * 2):
                    need_turns.append(turn(rng.choice(PREFIXES) + core + rng.choice(SUFFIXES), label))
            # Two situations from the same need in one message ("we got evicted and have nowhere to go").
            for other in sits:
                if other != s:
                    for joiner in (" and ", ", ", ". ", " so "):
                        need_turns.append(turn(s + joiner + other, label))
            eval_rows.append({"q": normalize(rng.choice(HELDOUT_SIT).format(s=s)), "a": label})

    fixed_turns: list[str] = []
    for questions, answer, _source in F.FAQ:
        for q in questions:
            for variant in (q, q + "?", "hi " + q, q + " please"):
                fixed_turns.append(turn(variant, answer))
    for q in F.GREETING_Q:
        fixed_turns += [turn(q, F.GREETING_A), turn(q + "!", F.GREETING_A)]
    for q in F.THANKS_Q:
        fixed_turns.append(turn(q, F.THANKS_A))
    for q in F.OFFTOPIC_Q:
        fixed_turns += [turn(q, F.DEFLECT), turn(q + "?", F.DEFLECT)]
    for q in F.OUT_OF_STATE_Q:
        fixed_turns.append(turn(q, F.OUT_OF_STATE_A))
    for q in F.CRISIS_Q:
        fixed_turns += [turn(q, "[crisis]"), turn("help " + q, "[crisis]")]

    # Fixed turns are few, so repeat them enough to weigh about as much as need turns.
    weight = max(1, len(need_turns) // max(1, len(fixed_turns)) // 2)
    need_turns = list(dict.fromkeys(need_turns))  # drop exact repeats from random wrapping
    pool = need_turns + fixed_turns * weight
    out: list[str] = []
    size = 0
    while size < target_mb * 1_000_000:
        rng.shuffle(pool)
        for t in pool:
            out.append(t)
            size += len(t)
    held = {r["q"] for r in eval_rows}
    leaked = [t for t in need_turns if t.split("\n")[0][3:] in held]
    if leaked:
        raise SystemExit(f"{len(leaked)} eval questions leaked into training")
    table = phrase_table(phrases, F.SITUATIONS)
    (ROOT / "public" / "brain" / "phrases.json").write_text(json.dumps(table, separators=(",", ":")))
    print(f"phrase table: {len(table)} phrases -> public/brain/phrases.json")
    stats = {c: len(v) for c, v in phrases.items()}
    print("phrases per category:", dict(sorted(stats.items(), key=lambda kv: -kv[1])))
    print(f"unique need turns {len(need_turns)}, fixed {len(fixed_turns)} x{weight}, eval {len(eval_rows)}")
    return "".join(out), eval_rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target-mb", type=float, default=2.5)
    ap.add_argument("--out", default="corpus.txt")
    args = ap.parse_args()
    text, eval_rows = build(args.target_mb)
    Path(args.out).write_text(text)
    Path("eval.jsonl").write_text("".join(json.dumps(r) + "\n" for r in eval_rows))
    print(f"wrote {args.out}: {len(text) / 1e6:.2f} MB, {len(set(text))} distinct chars")


if __name__ == "__main__":
    main()
