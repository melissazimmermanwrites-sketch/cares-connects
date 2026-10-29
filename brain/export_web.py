"""Export the trained brain for in-browser inference (public/brain/).

Writes model.json (config, vocabulary, tensor table) and model.bin. Weights are
stored as float16 to halve the download; the worker widens them back to float32
before running gpt.js, so the math matches PyTorch run on the same rounded weights.
parity.json holds greedy outputs from those exact weights for the JS check.

    python export_web.py
"""

import json
import os

import numpy as np
import torch

from data import CharTokenizer
from model import GPT, load_config

CKPT, OUT = "ckpt", os.path.join("..", "public", "brain")
os.makedirs(OUT, exist_ok=True)
cfg = load_config(os.path.join(CKPT, "config.json"))
tok = CharTokenizer.load(os.path.join(CKPT, "vocab.json"))
model = GPT(cfg)
model.load_state_dict(torch.load(os.path.join(CKPT, "model.pt"), map_location="cpu"))
model.eval()

# Round every weight to float16 and load it back, so the parity reference below
# comes from the same numbers the browser will use.
with torch.no_grad():
    for p in model.state_dict().values():
        p.copy_(p.to(torch.float16).to(torch.float32))

tensors, blob = [], bytearray()
for name, t in model.state_dict().items():
    a = t.detach().cpu().contiguous().numpy().astype("<f2")
    tensors.append({"name": name, "shape": list(t.shape), "offset": len(blob), "count": int(a.size)})
    blob += a.tobytes()
with open(os.path.join(OUT, "model.bin"), "wb") as f:
    f.write(blob)
meta = {
    "config": {k: getattr(cfg, k) for k in ("vocab_size", "block_size", "n_layer", "n_head", "n_embd")},
    "chars": tok.chars,
    "dtype": "float16",
    "tensors": tensors,
    "bytes": len(blob),
}
json.dump(meta, open(os.path.join(OUT, "model.json"), "w"))


def greedy_answer(question: str, n: int = 200) -> str:
    prompt = f"U: {question}\nA:"
    ids = tok.encode(prompt)
    nl = tok.stoi["\n"]
    for _ in range(n):
        x = torch.tensor([ids[-cfg.block_size:]])
        with torch.no_grad():
            logits, _ = model(x)
        ids.append(int(logits[0, -1].argmax()))
        if ids[-1] == nl and ids[-2] == nl:
            break
    return tok.decode(ids)[len(prompt):].split("\n\n")[0].strip()


PARITY_QUESTIONS = ["is this free", "we got evicted and have nowhere to go", "i need a dentist",
                    "what is the weather", "who runs this"]
parity = [{"q": q, "a": greedy_answer(q)} for q in PARITY_QUESTIONS]
json.dump(parity, open(os.path.join(OUT, "parity.json"), "w"), indent=1)
print(f"tensors: {len(tensors)}  bytes: {len(blob)} ({len(blob) / 1e6:.1f} MB, float16)")
for p in parity:
    print(f"  {p['q']!r} -> {p['a']!r}")
