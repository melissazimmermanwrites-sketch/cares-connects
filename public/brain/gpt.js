/* Dependency-free char-level GPT inference. Mirrors the PyTorch brain in
   model.py exactly (LayerNorm eps 1e-5, exact-erf GELU, weight-tied head,
   causal attention, temperature+top_k sampling). Runs in node and browser.

   Incremental KV-cache decoding: each step forwards only the new token and
   attends over cached keys/values, so an N-char answer costs O(N) matmuls
   instead of O(N^2). Answers stop at the blank-line separator well under the
   256-token context window, so no sliding is needed and output is identical
   to the PyTorch model (verified greedy). */
'use strict';
(function (root) {
  function erf(x) { // Abramowitz-Stegun 7.1.26, |err| < 1.5e-7
    var s = x < 0 ? -1 : 1; x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t
      - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  function gelu(x) { return 0.5 * x * (1 + erf(x / Math.SQRT2)); }

  function GPT(meta, arrbuf) {
    this.cfg = meta.config;
    this.chars = meta.chars;
    this.stoi = {}; this.itos = {};
    for (var i = 0; i < this.chars.length; i++) { this.stoi[this.chars[i]] = i; this.itos[i] = this.chars[i]; }
    var f32 = new Float32Array(arrbuf);
    this.T = {};
    for (var j = 0; j < meta.tensors.length; j++) {
      var d = meta.tensors[j];
      this.T[d.name] = f32.subarray(d.offset / 4, d.offset / 4 + d.count);
    }
  }
  GPT.prototype.encode = function (s) { var o = []; for (var i = 0; i < s.length; i++) if (s[i] in this.stoi) o.push(this.stoi[s[i]]); return o; };
  GPT.prototype.decode = function (ids) { var o = ''; for (var i = 0; i < ids.length; i++) o += this.itos[ids[i]]; return o; };

  // y[out] = x[in] @ W[out,in]^T + b[out]   (single row)
  GPT.prototype._lin1 = function (x, inD, W, outD, b) {
    var y = new Float32Array(outD);
    for (var o = 0; o < outD; o++) { var s = b ? b[o] : 0, wo = o * inD;
      for (var i = 0; i < inD; i++) s += x[i] * W[wo + i]; y[o] = s; }
    return y;
  };
  GPT.prototype._ln1 = function (x, D, g, b) {
    var m = 0, i; for (i = 0; i < D; i++) m += x[i]; m /= D;
    var v = 0; for (i = 0; i < D; i++) { var d = x[i] - m; v += d * d; } v /= D;
    var inv = 1 / Math.sqrt(v + 1e-5), y = new Float32Array(D);
    for (i = 0; i < D; i++) y[i] = (x[i] - m) * inv * g[i] + b[i];
    return y;
  };

  // Fresh decode state (per-layer KV cache).
  GPT.prototype.init = function () {
    var C = this.cfg.n_embd, kv = [];
    for (var L = 0; L < this.cfg.n_layer; L++)
      kv.push({ k: new Float32Array(this.cfg.block_size * C), v: new Float32Array(this.cfg.block_size * C), n: 0 });
    return { kv: kv, pos: 0 };
  };

  // Feed one token; update cache; return logits (Float32Array[vocab]).
  GPT.prototype.feed = function (st, token) {
    var W = this.T, cfg = this.cfg, C = cfg.n_embd, H = cfg.n_head, hd = C / H, i, L, h, s, d;
    var x = new Float32Array(C), te = W['tok_emb.weight'], pe = W['pos_emb.weight'], pos = st.pos;
    for (i = 0; i < C; i++) x[i] = te[token * C + i] + pe[pos * C + i];
    for (L = 0; L < cfg.n_layer; L++) {
      var p = 'blocks.' + L + '.', cache = st.kv[L], n = cache.n;
      var a = this._ln1(x, C, W[p + 'ln_1.weight'], W[p + 'ln_1.bias']);
      var qkv = this._lin1(a, C, W[p + 'attn.c_attn.weight'], 3 * C, W[p + 'attn.c_attn.bias']);
      for (i = 0; i < C; i++) { cache.k[n * C + i] = qkv[C + i]; cache.v[n * C + i] = qkv[2 * C + i]; }
      cache.n = n + 1;
      var ao = new Float32Array(C), scale = 1 / Math.sqrt(hd);
      for (h = 0; h < H; h++) {
        var off = h * hd, sc = new Float32Array(n + 1), mx = -Infinity;
        for (s = 0; s <= n; s++) { var dot = 0; for (d = 0; d < hd; d++) dot += qkv[off + d] * cache.k[s * C + off + d]; dot *= scale; sc[s] = dot; if (dot > mx) mx = dot; }
        var sum = 0; for (s = 0; s <= n; s++) { sc[s] = Math.exp(sc[s] - mx); sum += sc[s]; }
        for (d = 0; d < hd; d++) { var acc = 0; for (s = 0; s <= n; s++) acc += sc[s] / sum * cache.v[s * C + off + d]; ao[off + d] = acc; }
      }
      var pr = this._lin1(ao, C, W[p + 'attn.c_proj.weight'], C, W[p + 'attn.c_proj.bias']);
      for (i = 0; i < C; i++) x[i] += pr[i];
      var b2 = this._ln1(x, C, W[p + 'ln_2.weight'], W[p + 'ln_2.bias']);
      var fc = this._lin1(b2, C, W[p + 'mlp.c_fc.weight'], 4 * C, W[p + 'mlp.c_fc.bias']);
      for (i = 0; i < fc.length; i++) fc[i] = gelu(fc[i]);
      var mo = this._lin1(fc, 4 * C, W[p + 'mlp.c_proj.weight'], C, W[p + 'mlp.c_proj.bias']);
      for (i = 0; i < C; i++) x[i] += mo[i];
    }
    st.pos++;
    var ln = this._ln1(x, C, W['ln_f.weight'], W['ln_f.bias']);
    var head = W['head.weight'], V = cfg.vocab_size, logits = new Float32Array(V);
    for (var vv = 0; vv < V; vv++) { var a2 = 0, wo = vv * C; for (i = 0; i < C; i++) a2 += ln[i] * head[wo + i]; logits[vv] = a2; }
    return logits;
  };
  GPT.prototype._pick = function (logits, temp, topK, greedy) {
    var V = logits.length, i;
    if (greedy) { var bi = 0, bv = -Infinity; for (i = 0; i < V; i++) if (logits[i] > bv) { bv = logits[i]; bi = i; } return bi; }
    var l = new Float32Array(V);
    for (i = 0; i < V; i++) l[i] = logits[i] / Math.max(temp, 1e-6);
    if (topK && topK < V) {
      var idx = []; for (i = 0; i < V; i++) idx.push(i);
      idx.sort(function (a, b) { return l[b] - l[a]; });
      var kth = l[idx[topK - 1]];
      for (i = 0; i < V; i++) if (l[i] < kth) l[i] = -Infinity;
    }
    var mx = -Infinity; for (i = 0; i < V; i++) if (l[i] > mx) mx = l[i];
    var sum = 0, p = new Float32Array(V);
    for (i = 0; i < V; i++) { p[i] = Math.exp(l[i] - mx); sum += p[i]; }
    var r = Math.random() * sum, acc = 0;
    for (i = 0; i < V; i++) { acc += p[i]; if (r <= acc) return i; }
    return V - 1;
  };
  // Stream generation. onToken(char) called per emitted char. Returns full ids.
  GPT.prototype.generate = function (prompt, opts, onToken) {
    opts = opts || {};
    var temp = opts.temperature == null ? 0.3 : opts.temperature;
    var topK = opts.topK == null ? 10 : opts.topK, maxT = opts.maxTokens || 400;
    var greedy = !!opts.greedy, stop = opts.stop !== false;
    var ids = this.encode(prompt), nl = this.stoi['\n'], bs = this.cfg.block_size;
    var st = this.init(), logits = null, i;
    for (i = 0; i < ids.length; i++) logits = this.feed(st, ids[i]);
    for (var step = 0; step < maxT; step++) {
      var next = this._pick(logits, temp, topK, greedy);
      ids.push(next);
      if (onToken) onToken(this.itos[next]);
      if (stop && ids.length >= 2 && next === nl && ids[ids.length - 2] === nl) break;
      if (st.pos >= bs) break; // context full — stop (answers never reach this)
      logits = this.feed(st, next);
    }
    return ids;
  };
  // Mirror chat.py answer(): prime "U: q\nA:", strip to this turn, trim to last sentence.
  GPT.prototype.answer = function (question, opts) {
    var prompt = 'U: ' + String(question).trim() + '\nA:';
    var ids = this.generate(prompt, opts);
    var text = this.decode(ids).slice(prompt.length);
    text = text.split('\n\n')[0].split('U:')[0].trim();
    var end = Math.max(text.lastIndexOf('.'), text.lastIndexOf('!'), text.lastIndexOf('?'));
    return (end !== -1 ? text.slice(0, end + 1) : text).trim() || '(no answer)';
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = { GPT: GPT };
  else root.CBGPT = { GPT: GPT };
})(typeof self !== 'undefined' ? self : this);
