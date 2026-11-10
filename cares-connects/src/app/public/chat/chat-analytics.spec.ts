import { describe, expect, it } from 'vitest';
import { chatEventBody, modelOutcome, reportableNeed } from './chat-analytics';

describe('reportableNeed', () => {
  it('names everyday needs', () => {
    expect(reportableNeed('food')).toBe('food');
  });
  it('hides sensitive or unknown needs', () => {
    for (const slug of ['domestic-violence-ipv', 'suicide-prevention', 'immigration', 'substance-abuse-and-recovery', 'human-trafficking', 'mental-health', 'crisis-help-lines', 'made-up']) {
      expect(reportableNeed(slug), slug).toBe('other_need');
    }
  });
});

describe('modelOutcome', () => {
  it('sorts answers into a label without keeping the text', () => {
    expect(modelOutcome(null)).toBe('no_answer');
    expect(modelOutcome('[crisis]')).toBe('crisis');
    expect(modelOutcome('[need:food]')).toBe('need');
    expect(modelOutcome('CARES Connects is free to use.')).toBe('faq');
  });
});

describe('chatEventBody', () => {
  it('matches the ZTA API and always reports the same path', () => {
    expect(chatEventBody('site', 'chat_model_answer', { category: 'need', label: 'faq', value: 12 })).toEqual({
      type: 'event',
      siteId: 'site',
      path: '/chat',
      action: 'chat_model_answer',
      category: 'need',
      label: 'faq',
      value: 12,
    });
  });
  it('fills in defaults', () => {
    expect(chatEventBody('site', 'chat_opened')).toMatchObject({ category: 'chat', label: null, value: null });
  });
});
