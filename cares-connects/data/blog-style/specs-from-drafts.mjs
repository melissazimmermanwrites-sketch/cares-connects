// Builds make-cover specs from draft front matter: title, org (from `coverOrg:` or first link text), icon by category.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const ICON_BY_CATEGORY = {
  'Food': 'food', 'Shelter & Housing': 'house', 'Medical and Dental Health': 'medical',
  'Substance Abuse & Recovery': 'recovery', 'Job Assistance': 'briefcase', 'Youth Activities': 'youth',
  'Aging Adult': 'senior', 'Parenting Resources': 'parenting', 'Financial Aid': 'money', 'Veterans': 'veterans',
  'Disability Support': 'disability', 'Foster Youth': 'foster', 'Domestic Violence / IPV': 'shield',
  'Legal': 'legal', 'Transportation': 'bus', 'Immigration': 'globe', 'Pet health & rescue': 'paw',
  'Crisis help lines': 'phone', 'Rehabilitation': 'key', 'Small Business': 'store', 'Clothing': 'shirt',
  'Donation and Volunteer': 'gift', 'Human Trafficking': 'hands', 'Tribal': 'feather', 'Hospice': 'candle',
  'Household goods': 'bed', 'In-home Help': 'house', 'Mentorship': 'people', 'Latino': 'chat',
  'Education': 'book', 'Community Services': 'community', 'Mental Health': 'mind', 'Suicide Prevention': 'sunrise',
};
const dir = process.argv[2];
const specs = readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((f) => {
  const text = readFileSync(join(dir, f), 'utf8');
  const get = (k) => (new RegExp(`^${k}:\\s*(.*)$`, 'm').exec(text)?.[1] ?? '').replace(/^"|"$/g, '');
  const cat = get('categories').replace(/^\[|\]$/g, '').split(',')[0].trim();
  const body = text.replace(/^---[\s\S]*?---/, '');
  const org = get('coverOrg') || (/\[\**([^\]*]+?)\**\]\(http/.exec(body)?.[1] ?? '');
  const title = get("title").replace(new RegExp(`:\\s*${org.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "");
  return { slug: get("slug"), title, org, icon: ICON_BY_CATEGORY[cat] ?? 'senior', category: cat };
});
console.log(JSON.stringify(specs, null, 2));
