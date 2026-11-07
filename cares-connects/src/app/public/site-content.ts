/**
 * Marketing copy and outside links for the public site, kept in one place so they're easy to edit.
 */

/** Public origin used for canonical URLs and share links (no trailing slash). */
export const SITE_URL = 'https://caresconnects.org';

export const LINKS = {
  blog: 'https://www.caresconnects.org/blog',
  listYourOrganization: 'https://docs.google.com/forms/d/1BwqNlFJQCEyfeHqMpa8XJFiKT6qO0smfEisBGIeasnY',
  instagram: 'https://instagram.com/cares_connects',
  linkedin: 'https://www.linkedin.com/company/cares-connects',
};

/**
 * Photos for the About and campaign sections. Leave null to show a branded placeholder;
 * set to a path under /public (e.g. '/images/about.webp') once the photos are added.
 */
export const IMAGES = {
  logo: null as string | null,
  about: null as string | null,
  campaign: null as string | null,
};

export type BrandColor = 'navy' | 'blue' | 'sky' | 'green' | 'yellow' | 'orange';

export interface FeaturedCategory {
  slug: string;
  title: string;
  blurb: string;
  icon: string;
  color: BrandColor;
}

/** The ten cards in "What kind of support do you need?". Each links to one directory category. */
export const FEATURED_CATEGORIES: FeaturedCategory[] = [
  { slug: 'shelter-and-housing', title: 'Housing and shelter', blurb: 'Find shelter and housing resources', icon: 'home', color: 'navy' },
  { slug: 'food', title: 'Food', blurb: 'Food pantries, services and resources', icon: 'shopping_cart', color: 'blue' },
  { slug: 'medical-and-dental-health', title: 'Health and mental health', blurb: 'Find health and mental health resources', icon: 'ecg_heart', color: 'orange' },
  { slug: 'crisis-help-lines', title: 'Crisis support', blurb: 'Hotlines, text lines, and safety planning', icon: 'chat', color: 'yellow' },
  { slug: 'veterans', title: 'Veterans and military', blurb: 'Resources and care for veterans and their families', icon: 'military_tech', color: 'green' },
  { slug: 'parenting-resources', title: 'Childcare and family', blurb: 'Childcare resources and parenting support', icon: 'family_restroom', color: 'sky' },
  { slug: 'transportation', title: 'Transportation', blurb: 'Rides and medical transport', icon: 'directions_bus', color: 'yellow' },
  { slug: 'substance-abuse-and-recovery', title: 'Substance use and recovery', blurb: 'Resources for recovery, prevention, and support', icon: 'potted_plant', color: 'green' },
  { slug: 'clothing', title: 'Clothing and basic needs', blurb: 'Clothing, diapers, and work attire', icon: 'apparel', color: 'blue' },
  { slug: 'legal', title: 'Legal help', blurb: 'Find help and resources to navigate legal issues', icon: 'balance', color: 'orange' },
];

export const FEATURES = [
  { title: '30+ support categories', text: 'Find help with housing, food, clothing, mental health and more' },
  { title: 'Local resources', text: 'Piloting in Placer and Sacramento Counties' },
  { title: 'Verified providers', text: 'Provider information checked at the source' },
  { title: 'Search + connect', text: 'Get connected based on your needs and program availability' },
];

export const STEPS = [
  {
    title: 'Tell us what you need',
    text: 'Type it in your own words or pick a category. Add your county so we show programs near you.',
  },
  { title: 'See programs that fit', text: 'Explore targeted results based on your needs and program availability.' },
  {
    title: 'Connect to local help',
    text: 'Call, open the website, or get directions in one tap. You contact the program on your own timeline.',
  },
];
