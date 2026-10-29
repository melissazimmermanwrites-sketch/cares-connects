/**
 * The fixed parts of the chat: crisis rules, yes/no parsing, and the one follow-up
 * question per need. None of this depends on the brain model, so it behaves the same
 * whether or not the model has loaded.
 *
 * Follow-up `q` values are search words that appear in listing tags/services. If one
 * finds nothing in the person's county, the widget falls back to the whole category.
 */

export interface FollowUpOption {
  label: string;
  /** Extra search words for /api/resources?q=…; omit to show the whole category. */
  q?: string;
}

export interface FollowUp {
  question: string;
  options: FollowUpOption[];
}

const SHOW_ALL: FollowUpOption = { label: 'Show me everything' };

export const FOLLOW_UPS: Record<string, FollowUp> = {
  food: {
    question: 'Do you need food today, or ongoing help with groceries?',
    options: [{ label: 'Food today', q: 'meals' }, { label: 'A food pantry', q: 'pantry' }, { label: 'CalFresh / EBT', q: 'calfresh' }, SHOW_ALL],
  },
  'shelter-and-housing': {
    question: 'Do you have a safe place to sleep tonight?',
    options: [
      { label: 'No, I need a place tonight', q: 'emergency shelter' },
      { label: 'Yes, but I need help with rent', q: 'rental assistance' },
      { label: 'Looking for affordable housing', q: 'affordable housing' },
      SHOW_ALL,
    ],
  },
  'medical-and-dental-health': {
    question: 'What kind of care do you need?',
    options: [{ label: 'Medical', q: 'medical' }, { label: 'Dental', q: 'dental' }, { label: 'Vision', q: 'vision' }, { label: 'Health insurance', q: 'medi-cal' }, SHOW_ALL],
  },
  'mental-health': {
    question: 'Who is the support for?',
    options: [{ label: 'Me', q: 'counseling' }, { label: 'My child or teen', q: 'youth' }, { label: 'A support group', q: 'support group' }, SHOW_ALL],
  },
  'substance-abuse-and-recovery': {
    question: 'What kind of help are you looking for?',
    options: [{ label: 'Detox or treatment', q: 'treatment' }, { label: 'Meetings and peer support', q: 'support' }, { label: 'Sober living', q: 'sober living' }, SHOW_ALL],
  },
  legal: {
    question: 'What is the legal help for?',
    options: [
      { label: 'Eviction or housing', q: 'eviction' },
      { label: 'Family, custody, or divorce', q: 'family law' },
      { label: 'Clearing a record', q: 'record' },
      SHOW_ALL,
    ],
  },
  'financial-aid': {
    question: 'What do you need help paying for?',
    options: [{ label: 'Utility bills', q: 'utility' }, { label: 'Rent', q: 'rent' }, { label: 'Taxes', q: 'tax' }, SHOW_ALL],
  },
  'job-assistance': {
    question: 'What would help most?',
    options: [{ label: 'Finding a job', q: 'job placement' }, { label: 'Job training', q: 'training' }, { label: 'Resume help', q: 'resume' }, SHOW_ALL],
  },
  transportation: {
    question: 'What kind of ride?',
    options: [{ label: 'Rides to medical visits', q: 'medical' }, { label: 'Senior or disability rides', q: 'paratransit' }, { label: 'Bus help', q: 'bus' }, SHOW_ALL],
  },
  'domestic-violence-ipv': {
    question: 'Are you safe right now?',
    options: [{ label: 'I need a safe place', q: 'shelter' }, { label: 'Help with a restraining order', q: 'restraining order' }, { label: 'Someone to talk to', q: 'hotline' }, SHOW_ALL],
  },
  'aging-adult': {
    question: 'What kind of help?',
    options: [{ label: 'Activities and senior centers', q: 'senior' }, { label: 'Dementia or memory care', q: 'dementia' }, { label: 'Medicare help', q: 'medicare' }, SHOW_ALL],
  },
  'parenting-resources': {
    question: 'What would help your family?',
    options: [{ label: 'Pregnancy and new baby', q: 'prenatal' }, { label: 'Parenting classes', q: 'parenting' }, { label: 'Child care', q: 'child' }, SHOW_ALL],
  },
};

export const GENERIC_FOLLOW_UP: FollowUp = {
  question: 'Want me to narrow it down? Type a word like "Spanish" or "seniors", or see everything.',
  options: [SHOW_ALL],
};

/**
 * Hard rules that run on every message BEFORE anything else. A match shows crisis lines
 * immediately. Kept broad on purpose: a false alarm shows a phone number; a miss is worse.
 */
const CRISIS_PATTERNS = [
  /\bkill(ing)? (my ?self|myself)\b/, /\bsuicid/, /\bend (my|it) (life|all)\b/, /\bending it all\b/,
  /\bwant(ed)? to die\b/, /\b(dont|do not) want to (live|be alive)\b/, /\bhurt(ing)? (my ?self|myself)\b/,
  /\bself[- ]?harm/, /\bcut(ting)? myself\b/, /\boverdos/, /\bnot safe\b/, /\bin danger\b/,
  /\b(going to|gonna|will) (kill|hurt) me\b/, /\b(hits|hit|beats|beat|chok\w*) me\b/, /\brap(e|ed)\b/,
  /\babus(e|es|ing|ed) me\b/, /\bthreaten\w* (to )?(kill|hurt)\b/,
];

export function isCrisis(text: string): boolean {
  const t = text.toLowerCase().replace(/[’']/g, '');
  return CRISIS_PATTERNS.some((p) => p.test(t));
}

export function parseYesNo(text: string): 'yes' | 'no' | null {
  const t = text.toLowerCase().trim().replace(/[.!]+$/, '');
  if (/^(y|yes|yeah|yep|yup|sure|correct|i am|im in california|of course|ok|okay)$/.test(t)) return 'yes';
  if (/^(n|no|nope|nah|not really|i am not|im not)$/.test(t)) return 'no';
  return null;
}

/** "[need:food]" → "food"; "[crisis]" → "crisis"; anything else → null (it's an FAQ answer). */
export function parseBrain(answer: string): { need: string } | { crisis: true } | null {
  const need = answer.match(/^\[need:([a-z0-9-]+)\]$/);
  if (need) return { need: need[1] };
  if (answer.trim() === '[crisis]') return { crisis: true };
  return null;
}
