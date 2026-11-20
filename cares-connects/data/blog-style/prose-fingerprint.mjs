const STOP = new Set(
  ("the a an and or but so if then than of to in on at for with from by as is are was were be been being " +
    "it its i you he she they we me him her them us my your his their our this that these those what which who whom whose " +
    "not no yes do does did done have has had will would can could should may might must im ive dont its i'm i've " +
    "just about into out up down over here there when where why how all any some more most very too also do").split(/\s+/),
);

function syl(w) {
  w = w.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return w ? 1 : 0;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const m = w.match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}



function analyze(text) {
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  const upper = (text.match(/[A-Z]/g) || []).length;
  const words = text.match(/[A-Za-z][A-Za-z'\-]*/g) || [];
  const wl = words.map((w) => w.length);
  const sentences = text
    .split(/[.!?]+(?:\s|$|["')\]]+)|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length);
  const emoji = text.match(/\p{Extended_Pictographic}/gu) || [];
  const freq = {};
  words.map((w) => w.toLowerCase()).forEach((w) => (freq[w] = (freq[w] || 0) + 1));
  const uniq = Object.keys(freq).length;
  const op = {};
  sentences.forEach((s) => {
    const m = s.match(/[A-Za-z][A-Za-z'\-]*/);
    if (m) op[m[0].toLowerCase()] = (op[m[0].toLowerCase()] || 0) + 1;
  });
  const sig = Object.keys(freq)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .sort((a, b) => freq[b] - freq[a])
    .slice(0, 12);
  const ef = {};
  emoji.forEach((e) => (ef[e] = (ef[e] || 0) + 1));
  const topE = Object.keys(ef).sort((a, b) => ef[b] - ef[a]).slice(0, 5);
  const P = {
    comma: (text.match(/,/g) || []).length,
    period: (text.match(/\./g) || []).length,
    exclaim: (text.match(/!/g) || []).length,
    question: (text.match(/\?/g) || []).length,
    semicolon: (text.match(/;/g) || []).length,
    colon: (text.match(/:/g) || []).length,
    dash: (text.match(/—|--| - /g) || []).length,
    ellipsis: (text.match(/…|\.\.\.+/g) || []).length,
  };
  const lens = sentences
    .map((s) => (s.match(/[A-Za-z][A-Za-z'\-]*/g) || []).length)
    .filter((n) => n > 0);
  const avgSent = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  const variance = lens.length
    ? Math.sqrt(lens.reduce((a, b) => a + (b - avgSent) ** 2, 0) / lens.length)
    : 0;
  const syls = words.reduce((a, w) => a + syl(w), 0);
  const fk = words.length && sentences.length
    ? 0.39 * (words.length / sentences.length) + 11.8 * (syls / words.length) - 15.59
    : 0;
  return {
    words: words.length,
    sentences: sentences.length,
    uniq,
    capsRate: letters ? upper / letters : 0,
    emojiRate: words.length ? emoji.length / words.length : 0,
    topE,
    ttr: words.length ? uniq / words.length : 0,
    avgWord: wl.length ? wl.reduce((a, b) => a + b, 0) / wl.length : 0,
    avgSent,
    variance,
    fk: Math.max(0, fk),
    openers: Object.keys(op).sort((a, b) => op[b] - op[a]).slice(0, 6).map((w) => [w, op[w]]),
    sig: sig.map((w) => [w, freq[w]]),
    P,
  };
}

import { readFileSync } from 'node:fs';
const strip = (t) => t.replace(/^---[\s\S]*?---/, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*#_>]/g, '');
const files = process.argv.slice(2);
const all = files.map((f) => strip(readFileSync(f, 'utf8'))).join('\n\n');
for (const f of files) { const r = analyze(strip(readFileSync(f,'utf8'))); console.log(f.split('/').pop(), JSON.stringify({words:r.words,avgSent:+r.avgSent.toFixed(1),sd:+r.variance.toFixed(1),fk:+r.fk.toFixed(1),ttr:+r.ttr.toFixed(3)})); }
console.log(JSON.stringify(analyze(all), (k, v) => typeof v === 'number' ? +v.toFixed(3) : v, 2));
