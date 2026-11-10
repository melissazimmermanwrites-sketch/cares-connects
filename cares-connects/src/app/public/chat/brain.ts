import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ChatAnalytics } from './chat-analytics';

/** Must match normalize() in brain/corpus.py and public/brain/brain-worker.js. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9 ?.,/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Talks to the brain Web Worker (public/brain/brain-worker.js). The model (~3 MB) is
 * fetched only when first needed, never during server rendering. If it can't load,
 * ask() resolves to null and the chat falls back to its buttons.
 */
@Injectable({ providedIn: 'root' })
export class Brain {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly analytics = inject(ChatAnalytics);
  private worker: Worker | null = null;
  private ready: Promise<boolean> | null = null;
  private nextId = 1;
  private pending = new Map<number, (text: string | null) => void>();

  readonly status = signal<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  private phrases: Promise<[string, string][]> | null = null;

  /**
   * Deterministic first pass: the longest known need phrase in the message (from the same
   * vocabulary the brain trains on, public/brain/phrases.json). Null when none is found.
   */
  async matchPhrase(text: string): Promise<string | null> {
    if (!this.browser) return null;
    this.phrases ??= fetch('/brain/phrases.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then((table: Record<string, string>) => Object.entries(table).sort((a, b) => b[0].length - a[0].length))
      .catch(() => []);
    const padded = ` ${normalize(text).replace(/[?.,]/g, ' ')} `;
    const hit = (await this.phrases).find(([phrase]) => padded.includes(` ${phrase} `));
    return hit ? hit[1] : null;
  }

  /** Starts loading in the background; safe to call many times. */
  warmUp(): Promise<boolean> {
    if (!this.browser || typeof Worker === 'undefined') return Promise.resolve(false);
    this.ready ??= new Promise<boolean>((resolve) => {
      this.status.set('loading');
      const started = performance.now();
      const loaded = (label: 'ready' | 'failed') =>
        this.analytics.track('chat_model_load', { label, value: Math.round(performance.now() - started) });
      const worker = new Worker('/brain/brain-worker.js');
      this.worker = worker;
      worker.onmessage = (e: MessageEvent) => {
        const m = e.data ?? {};
        if (m.type === 'ready') {
          this.status.set('ready');
          loaded('ready');
          resolve(true);
        } else if (m.type === 'error' && m.id === undefined) {
          this.status.set('failed');
          loaded('failed');
          resolve(false);
        } else if (m.id !== undefined) {
          this.pending.get(m.id)?.(m.type === 'answer' ? String(m.text) : null);
          this.pending.delete(m.id);
        }
      };
      worker.onerror = () => {
        this.status.set('failed');
        loaded('failed');
        resolve(false);
      };
      worker.postMessage({ type: 'load' });
    });
    return this.ready;
  }

  /** The brain's answer for a message, or null if it isn't available. */
  async ask(q: string): Promise<string | null> {
    if (!(await this.warmUp()) || !this.worker) return null;
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(null);
      }, 8000);
      this.pending.set(id, (text) => {
        clearTimeout(timer);
        resolve(text);
      });
      this.worker!.postMessage({ type: 'ask', id, q });
    });
  }
}
