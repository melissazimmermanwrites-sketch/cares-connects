"""Accuracy check for the trained brain.

  - Held-out need phrasings (eval.jsonl, never trained on): is the category right?
  - Every FAQ question: is the answer exactly the sourced answer from facts.py?
  - Off-topic and crisis backstops: does it deflect / flag?

    python eval.py
"""

import json
from collections import Counter

import torch

import facts as F
from corpus import normalize
from data import CharTokenizer
from model import GPT, load_config

cfg = load_config("ckpt/config.json")
tok = CharTokenizer.load("ckpt/vocab.json")
model = GPT(cfg)
model.load_state_dict(torch.load("ckpt/model.pt", map_location="cpu"))
model.eval()


def ask(q: str) -> str:
    prompt = f"U: {normalize(q)}\nA:"
    ids = tok.encode(prompt)
    nl = tok.stoi["\n"]
    for _ in range(220):
        with torch.no_grad():
            logits, _ = model(torch.tensor([ids[-cfg.block_size:]]))
        ids.append(int(logits[0, -1].argmax()))
        if ids[-1] == nl and ids[-2] == nl:
            break
    return tok.decode(ids)[len(prompt):].split("\n\n")[0].strip()


rows = [json.loads(line) for line in open("eval.jsonl")]
wrong = Counter()
ok = 0
misses = []
for r in rows:
    got = ask(r["q"])
    if got == r["a"]:
        ok += 1
    else:
        wrong[r["a"]] += 1
        misses.append((r["q"], r["a"], got))
print(f"held-out needs: {ok}/{len(rows)} = {ok / len(rows):.1%}")
for q, want, got in misses[:15]:
    print(f"   x {q!r}: want {want} got {got[:60]!r}")

faq_total = faq_ok = 0
for questions, answer, _ in F.FAQ:
    for q in questions:
        faq_total += 1
        faq_ok += ask(q) == answer
print(f"FAQ exact answers: {faq_ok}/{faq_total}")

novel_offtopic = ["what is the best pizza", "how old is the moon", "who wrote hamlet", "fix my car engine"]
print("novel off-topic:", [ask(q)[:40] for q in novel_offtopic])
novel_crisis = ["i feel like ending it all", "he said he will hurt me tonight"]
print("novel crisis (rules catch these first):", [ask(q) for q in novel_crisis])
