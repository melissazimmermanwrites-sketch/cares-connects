# CARES Connects brain

A small character-level GPT (about 1.8M parameters) trained from scratch on a closed corpus about
CARES Connects, using the same approach as the CryptoBlocks brain. It runs in the visitor's
browser (`public/brain/`) with greedy decoding, so the same message always gets the same answer.

It does only two things:

1. **Names the need** in a typed message: `we got evicted` → `[need:shelter-and-housing]`
2. **Answers FAQs** about CARES Connects, using only the sourced answers in `facts.py`

Listings never come from the model; the widget always fetches them live from the database.
Crisis messages are caught by hard rules in the widget (`src/app/public/chat/chat-flows.ts`)
before the model runs.

**Rule:** nothing goes into `facts.py` unless it's confirmed (CARES's own site copy, public crisis
lines, or how the chat works). If you'd have to guess, leave it out.

## Retrain

Any machine with Python and PyTorch works; a CUDA or Apple GPU makes it quick (12,000 steps take
about 7 minutes on an RTX 5070 Ti).

```bash
cd cares-connects/brain
python -m venv .venv && .venv/bin/pip install torch numpy

.venv/bin/python corpus.py --target-mb 8        # corpus.txt, eval.jsonl, ../public/brain/phrases.json
.venv/bin/python train.py --corpus corpus.txt --out-dir ckpt --iters 12000 --batch-size 128 \
  --block-size 256 --n-layer 4 --n-head 4 --n-embd 192 --eval-every 1000
.venv/bin/python eval.py                         # held-out accuracy + exact FAQ check
.venv/bin/python export_web.py                   # ../public/brain/model.json, model.bin, parity.json
```

Ship it only if `eval.py` shows held-out accuracy around 98% and every FAQ answer exact. Then
commit `public/brain/` (model.json, model.bin, parity.json, phrases.json).

## Files

| File | What |
|---|---|
| `facts.py` | The closed world: sourced FAQ answers, need phrases, situations, crisis backstops |
| `corpus.py` | Generates training turns from `facts.py` + tags on real listings (`data/seed/directory.json`); holds out phrasings for eval; writes the widget's exact-match phrase table |
| `model.py`, `data.py`, `train.py` | Model, char tokenizer, trainer (from the CryptoBlocks brain) |
| `eval.py` | Accuracy on held-out phrasings, exact FAQ answers, off-topic and crisis checks |
| `export_web.py` | float16 export for the browser, plus PyTorch greedy outputs for the parity check |
| `../public/brain/gpt.js` | Dependency-free inference engine (matches PyTorch exactly) |
| `../public/brain/brain-worker.js` | Web Worker the chat widget talks to |
