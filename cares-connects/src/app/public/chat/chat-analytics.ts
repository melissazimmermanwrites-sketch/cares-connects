import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { ANALYTICS_HOSTS, ZTAS_SITE_ID } from '../site-content';
import { parseBrain } from './chat-flows';

export interface ChatEventProps {
  category?: string;
  label?: string;
  value?: number;
}

/**
 * Needs that are safe to name in analytics. Anything else is reported as "other_need", because
 * analytics also records a daily visitor hash and region, and a need like domestic violence or
 * immigration help shouldn't be tied to those, even loosely.
 */
const REPORTABLE_NEEDS = new Set([
  'food',
  'clothing',
  'household-goods',
  'shelter-and-housing',
  'transportation',
  'job-assistance',
  'financial-aid',
  'education',
  'mentorship',
  'youth-activities',
  'parenting-resources',
  'community-services',
  'small-business',
  'pet-health-and-rescue',
  'donation-and-volunteer',
]);

export function reportableNeed(slug: string): string {
  return REPORTABLE_NEEDS.has(slug) ? slug : 'other_need';
}

export type ModelOutcome = 'need' | 'crisis' | 'faq' | 'no_answer';

/** What kind of answer the model gave. Never includes the answer or the visitor's words. */
export function modelOutcome(answer: string | null): ModelOutcome {
  if (answer === null) return 'no_answer';
  const parsed = parseBrain(answer);
  if (parsed && 'crisis' in parsed) return 'crisis';
  return parsed ? 'need' : 'faq';
}

const ZTA_ENDPOINT = 'https://app.ztas.io/api/track';

/**
 * Every event reports the same path. Page addresses on this site can reveal what someone needs
 * (/category/domestic-violence-ipv), and which page the chat was opened on isn't worth that.
 */
const REPORTED_PATH = '/chat';

export function chatEventBody(siteId: string, action: string, props: ChatEventProps = {}): object {
  return {
    type: 'event',
    siteId,
    path: REPORTED_PATH,
    action,
    category: props.category ?? 'chat',
    label: props.label ?? null,
    value: props.value ?? null,
  };
}

/**
 * Usage numbers for the chat's model, sent to ZTA (ztas.io) so it can be tuned later. Off until
 * ZTAS_SITE_ID is set, and nothing is sent until someone uses the chat.
 *
 * This calls ZTA's API directly rather than loading its script, because the script attaches the
 * current page's path to everything and always reports time on page.
 *
 * NEVER pass anything a visitor typed to track(). A failure here must never affect the chat.
 */
@Injectable({ providedIn: 'root' })
export class ChatAnalytics {
  private readonly document = inject(DOCUMENT);
  private readonly enabled =
    isPlatformBrowser(inject(PLATFORM_ID)) &&
    !!ZTAS_SITE_ID &&
    ANALYTICS_HOSTS.includes(this.document.defaultView?.location.hostname ?? '');

  track(action: string, props?: ChatEventProps): void {
    if (!this.enabled) return;
    try {
      fetch(ZTA_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatEventBody(ZTAS_SITE_ID!, action, props)),
        keepalive: true,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      }).catch(() => undefined);
    } catch {
      // Usage numbers are never worth breaking the chat for.
    }
  }
}
