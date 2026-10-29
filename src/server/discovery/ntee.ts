/**
 * Which IRS NTEE activity codes count as "direct human services", and which CARES category
 * each one suggests. Matching is by longest prefix, so "L41" (homeless shelters) wins over "L4".
 * Codes not listed here are ignored by discovery. Edit this table to widen or narrow the queue.
 *
 * NTEE reference: https://urban.org/sites/default/files/2022-11/NTEE%20codes.pdf
 */
export const NTEE_TO_CATEGORY: Record<string, string> = {
  // Food & nutrition
  K30: 'food', K31: 'food', K34: 'food', K35: 'food', K36: 'food', K40: 'food',

  // Housing & shelter
  L20: 'shelter-and-housing', L21: 'shelter-and-housing', L22: 'aging-adult', L30: 'shelter-and-housing',
  L40: 'shelter-and-housing', L41: 'shelter-and-housing', L80: 'shelter-and-housing',
  L81: 'in-home-help', L82: 'financial-aid', P85: 'shelter-and-housing',

  // Health
  E20: 'medical-and-dental-health', E21: 'medical-and-dental-health', E22: 'medical-and-dental-health',
  E24: 'medical-and-dental-health', E30: 'medical-and-dental-health', E32: 'medical-and-dental-health',
  E40: 'medical-and-dental-health', E42: 'medical-and-dental-health', E50: 'rehabilitation',
  E60: 'medical-and-dental-health', E62: 'medical-and-dental-health', E86: 'medical-and-dental-health',
  E92: 'in-home-help',

  // Mental health, substance use, crisis
  F20: 'substance-abuse-and-recovery', F21: 'substance-abuse-and-recovery', F22: 'substance-abuse-and-recovery',
  F30: 'mental-health', F32: 'mental-health', F33: 'mental-health', F40: 'crisis-help-lines',
  F42: 'domestic-violence-ipv', F60: 'mental-health', F70: 'mental-health', F80: 'mental-health',

  // Safety & legal
  I40: 'domestic-violence-ipv', I43: 'rehabilitation', I44: 'rehabilitation', I70: 'domestic-violence-ipv',
  I71: 'domestic-violence-ipv', I72: 'domestic-violence-ipv', I73: 'domestic-violence-ipv',
  I80: 'legal', I83: 'legal', P43: 'domestic-violence-ipv', P62: 'domestic-violence-ipv',

  // Work & money
  J20: 'job-assistance', J21: 'job-assistance', J22: 'job-assistance', J30: 'job-assistance',
  J32: 'job-assistance', J33: 'job-assistance', P51: 'financial-aid', P60: 'financial-aid',
  S43: 'small-business',

  // Youth, families, foster care
  O20: 'youth-activities', O21: 'youth-activities', O22: 'youth-activities', O23: 'youth-activities',
  O30: 'mentorship', O31: 'mentorship', P30: 'youth-activities', P31: 'foster-youth', P32: 'foster-youth',
  P33: 'parenting-resources', P40: 'parenting-resources', P42: 'parenting-resources', P45: 'parenting-resources',
  P46: 'mental-health',

  // Older adults, disability, end of life
  P44: 'in-home-help', P74: 'hospice', P75: 'aging-adult', P81: 'aging-adult', P82: 'disability-support',
  P86: 'disability-support', P87: 'disability-support', R23: 'disability-support',

  // Community & basic needs
  P20: 'community-services', P21: 'community-services', P22: 'community-services', P24: 'community-services',
  P26: 'community-services', P27: 'community-services', P28: 'community-services', P50: 'community-services',
  P29: 'clothing', P58: 'household-goods', P52: 'transportation', M20: 'community-services',

  // Immigration, veterans, education, animals
  P84: 'immigration', R21: 'immigration', W30: 'veterans', B60: 'education', B92: 'education',
  D20: 'pet-health-and-rescue', D40: 'pet-health-and-rescue',
};

/** Suggested CARES category slug for an NTEE code, or null when it's out of scope. */
export function categoryForNtee(ntee: string): string | null {
  const code = ntee.trim().toUpperCase();
  for (let len = Math.min(code.length, 4); len >= 2; len--) {
    const slug = NTEE_TO_CATEGORY[code.slice(0, len)];
    if (slug) return slug;
  }
  return null;
}
