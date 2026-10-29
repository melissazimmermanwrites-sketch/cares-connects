"""Train the CryptoBlocks brain from scratch (random weights) on the
synthetic corpus. Runs on Apple MPS, CUDA, or CPU.

Usage:
    python train.py                       # sensible defaults
    python train.py --iters 6000 --eval-every 500
    python train.py --corpus corpus.txt --out-dir ckpt
"""

from __future__ import annotations

import argparse
import math
import os
import time

import torch

from data import CharTokenizer, get_batch, make_splits, turn_starts
from model import GPT, GPTConfig, save_config


def pick_device() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


@torch.no_grad()
def estimate_loss(model, splits, cfg, batch_size, device, iters=50):
    out = {}
    model.eval()
    for name, (data, starts) in splits.items():
        losses = torch.zeros(iters)
        for k in range(iters):
            x, y = get_batch(data, cfg.block_size, batch_size, device, starts)
            _, loss = model(x, y)
            losses[k] = loss.item()
        out[name] = losses.mean().item()
    model.train()
    return out


def lr_at(step, warmup, total, base_lr, min_lr):
    if step < warmup:
        return base_lr * (step + 1) / warmup
    if step > total:
        return min_lr
    ratio = (step - warmup) / max(1, total - warmup)
    coeff = 0.5 * (1 + math.cos(math.pi * ratio))
    return min_lr + coeff * (base_lr - min_lr)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", default="corpus.txt")
    ap.add_argument("--out-dir", default="ckpt")
    ap.add_argument("--iters", type=int, default=5000)
    ap.add_argument("--batch-size", type=int, default=64)
    ap.add_argument("--block-size", type=int, default=256)
    ap.add_argument("--n-layer", type=int, default=6)
    ap.add_argument("--n-head", type=int, default=6)
    ap.add_argument("--n-embd", type=int, default=240)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--eval-every", type=int, default=500)
    ap.add_argument("--seed", type=int, default=1337)
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    device = pick_device()
    os.makedirs(args.out_dir, exist_ok=True)

    with open(args.corpus) as f:
        text = f.read()
    tok = CharTokenizer.from_text(text)
    tok.save(os.path.join(args.out_dir, "vocab.json"))
    train_data, val_data = make_splits(text, tok)
    train_starts = turn_starts(train_data, tok, args.block_size)
    val_starts = turn_starts(val_data, tok, args.block_size)
    splits = {"train": (train_data, train_starts),
              "val": (val_data, val_starts)}

    cfg = GPTConfig(
        vocab_size=tok.vocab_size, block_size=args.block_size,
        n_layer=args.n_layer, n_head=args.n_head, n_embd=args.n_embd,
    )
    save_config(cfg, os.path.join(args.out_dir, "config.json"))
    model = GPT(cfg).to(device)
    print(f"device={device}  params={model.num_params()/1e6:.2f}M  "
          f"vocab={tok.vocab_size}  corpus={len(text)/1e6:.2f}MB  "
          f"tokens={len(train_data)/1e6:.2f}M  "
          f"turn-aligned starts={len(train_starts)}")

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr,
                            betas=(0.9, 0.99), weight_decay=0.1)
    warmup = max(100, args.iters // 20)
    best_val = float("inf")
    t0 = time.time()

    for step in range(args.iters + 1):
        lr = lr_at(step, warmup, args.iters, args.lr, args.lr / 10)
        for g in opt.param_groups:
            g["lr"] = lr

        if step % args.eval_every == 0 or step == args.iters:
            losses = estimate_loss(model, splits, cfg,
                                   args.batch_size, device)
            dt = time.time() - t0
            print(f"step {step:5d} | train {losses['train']:.3f} | "
                  f"val {losses['val']:.3f} | lr {lr:.1e} | {dt:.0f}s")
            if losses["val"] < best_val:
                best_val = losses["val"]
                torch.save(model.state_dict(),
                           os.path.join(args.out_dir, "model.pt"))

        if step == args.iters:
            break
        x, y = get_batch(train_data, cfg.block_size, args.batch_size, device,
                         train_starts)
        _, loss = model(x, y)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()

    print(f"done. best val loss {best_val:.3f}. "
          f"checkpoint in {args.out_dir}/model.pt")


if __name__ == "__main__":
    main()
