/* Web Worker for the CARES Connects brain. Runs the model off the main thread so the
   page never freezes. Same engine as the CryptoBlocks brain (gpt.js); decoding is
   GREEDY, so the same message always gets the same answer.

   Protocol:  {type:'load'} -> {type:'ready'} | {type:'error'}
              {type:'ask', id, q} -> {type:'answer', id, text} | {type:'error', id} */
'use strict';
importScripts('/brain/gpt.js');

var gpt = null;

/* Must match normalize() in brain/corpus.py. */
function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9 ?.,\/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* model.bin is float16; gpt.js wants float32. */
function f16ToF32(buf) {
  var h = new Uint16Array(buf), out = new Float32Array(h.length);
  for (var i = 0; i < h.length; i++) {
    var x = h[i], s = x & 0x8000 ? -1 : 1, e = (x >> 10) & 0x1f, m = x & 0x3ff;
    out[i] = e === 0 ? s * Math.pow(2, -14) * (m / 1024)
      : e === 31 ? (m ? NaN : s * Infinity)
      : s * Math.pow(2, e - 15) * (1 + m / 1024);
  }
  return out.buffer;
}

function load() {
  Promise.all([
    fetch('/brain/model.json').then(function (r) { if (!r.ok) throw new Error('model.json ' + r.status); return r.json(); }),
    fetch('/brain/model.bin').then(function (r) { if (!r.ok) throw new Error('model.bin ' + r.status); return r.arrayBuffer(); }),
  ]).then(function (res) {
    var meta = res[0], buf = meta.dtype === 'float16' ? f16ToF32(res[1]) : res[1];
    if (meta.dtype === 'float16') {
      // Tensor offsets were written in float16 bytes; float32 needs twice that.
      meta.tensors.forEach(function (t) { t.offset = t.offset * 2; });
    }
    gpt = new self.CBGPT.GPT(meta, buf);
    postMessage({ type: 'ready' });
  }).catch(function (err) {
    postMessage({ type: 'error', error: String((err && err.message) || err) });
  });
}

onmessage = function (e) {
  var m = e.data || {};
  if (m.type === 'load') return load();
  if (m.type !== 'ask') return;
  if (!gpt) return postMessage({ type: 'error', id: m.id, error: 'not loaded' });
  try {
    var prompt = 'U: ' + normalize(m.q) + '\nA:';
    var ids = gpt.generate(prompt, { greedy: true, maxTokens: 220 });
    var text = gpt.decode(ids).slice(prompt.length).split('\n\n')[0].trim();
    postMessage({ type: 'answer', id: m.id, text: text });
  } catch (err) {
    postMessage({ type: 'error', id: m.id, error: String((err && err.message) || err) });
  }
};
