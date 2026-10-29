/** "tel:" link for the first phone number in a field like "(916) 555-0100 ext. 2", or null. */
export function telHref(phone: string | null): string | null {
  if (!phone) return null;
  const match = phone.match(/\+?1?[\s.-]*\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}/) ?? phone.match(/^\s*(\d{3})\s*$/);
  if (!match) return null;
  return `tel:${match[0].replace(/[^\d+]/g, '')}`;
}

export function mapsUrl(address: string | null): string | null {
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
}
