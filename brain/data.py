"""Char-level tokenizer + batch loader for the CryptoBlocks brain.

The vocabulary is exactly the set of characters in the corpus. Saved to
disk so chat.py decodes with the identical mapping the model trained on.
"""

from __future__ import annotations

import json

import torch


class CharTokenizer:
    def __init__(self, chars: list[str]):
        self.chars = chars
        self.stoi = {c: i for i, c in enumerate(chars)}
        self.itos = {i: c for i, c in enumerate(chars)}

    @property
    def vocab_size(self) -> int:
        return len(self.chars)

    @classmethod
    def from_text(cls, text: str) -> "CharTokenizer":
        return cls(sorted(set(text)))

    def encode(self, s: str) -> list[int]:
        # Unknown chars are dropped — by construction inference inputs use
        # only corpus characters, but this keeps a stray keystroke safe.
        return [self.stoi[c] for c in s if c in self.stoi]

    def decode(self, ids: list[int]) -> str:
        return "".join(self.itos[i] for i in ids)

    def save(self, path: str) -> None:
        with open(path, "w") as f:
            json.dump(self.chars, f)

    @classmethod
    def load(cls, path: str) -> "CharTokenizer":
        with open(path) as f:
            return cls(json.load(f))


def make_splits(text: str, tok: CharTokenizer, val_frac: float = 0.05):
    data = torch.tensor(tok.encode(text), dtype=torch.long)
    n = int(len(data) * (1 - val_frac))
    return data[:n], data[n:]


def turn_starts(data: torch.Tensor, tok: CharTokenizer,
                block_size: int) -> torch.Tensor:
    """Offsets where a new turn ("U: …") begins: index 0 and every position
    right after a "\\n\\n" separator. Training on windows that START here
    means every sequence shows the question before the answer it must
    produce — which is what teaches the question->answer mapping. Random
    mid-answer windows (the old default) never do."""
    nl = tok.stoi["\n"]
    sep = (data[:-1] == nl) & (data[1:] == nl)   # i where data[i:i+2]=="\n\n"
    starts = sep.nonzero(as_tuple=False).flatten() + 2
    starts = torch.cat([torch.tensor([0]), starts])
    # keep only starts with a full block + 1 target char of room
    return starts[starts < (len(data) - block_size - 1)]


def get_batch(data: torch.Tensor, block_size: int, batch_size: int,
              device: str, starts: torch.Tensor | None = None):
    if starts is not None and len(starts) > 0:
        ix = starts[torch.randint(len(starts), (batch_size,))]
    else:
        ix = torch.randint(len(data) - block_size - 1, (batch_size,))
    x = torch.stack([data[i:i + block_size] for i in ix])
    y = torch.stack([data[i + 1:i + 1 + block_size] for i in ix])
    return x.to(device), y.to(device)
