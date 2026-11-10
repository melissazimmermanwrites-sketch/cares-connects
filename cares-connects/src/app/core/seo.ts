import { DOCUMENT } from '@angular/common';
import { Injectable, REQUEST, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { isDevelopmentHost } from '../../shared/hosts';
import { SITE_URL } from '../public/site-content';

export interface SeoData {
  title: string;
  description: string;
  /** Path for the canonical URL, e.g. "/category/food". */
  path: string;
  image?: string;
  type?: 'website' | 'article';
  noindex?: boolean;
  /** schema.org structured data for this page. */
  jsonLd?: object | null;
}

const DEFAULT_IMAGE = '/og-image.png';
const SITE_NAME = 'CARES Connects';

/** Sets the title, description, canonical link, Open Graph / Twitter tags and JSON-LD for a page. */
@Injectable({ providedIn: 'root' })
export class Seo {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);
  /** Present only while rendering on the server. */
  private readonly request = inject(REQUEST, { optional: true });

  update(data: SeoData): void {
    const url = SITE_URL + data.path;
    const image = SITE_URL + (data.image ?? DEFAULT_IMAGE);
    const description = data.description.replace(/\s+/g, ' ').trim().slice(0, 160);

    this.title.setTitle(data.title);
    this.setName('description', description);
    // The development site matches the X-Robots-Tag header the server already sends it (robots.ts).
    const hidden = data.noindex || this.onDevelopmentSite();
    this.setName('robots', hidden ? 'noindex, nofollow' : 'index, follow');

    this.setProperty('og:site_name', SITE_NAME);
    this.setProperty('og:type', data.type ?? 'website');
    this.setProperty('og:title', data.title);
    this.setProperty('og:description', description);
    this.setProperty('og:url', url);
    this.setProperty('og:image', image);
    this.setProperty('og:image:width', '1200');
    this.setProperty('og:image:height', '630');
    this.setProperty('og:image:alt', 'CARES Connects: find verified local help in Placer and Sacramento Counties');
    this.setName('twitter:card', 'summary_large_image');
    this.setName('twitter:title', data.title);
    this.setName('twitter:description', description);
    this.setName('twitter:image', image);

    this.setCanonical(url);
    this.setJsonLd(data.jsonLd ?? null);
  }

  /** The Host header while rendering on the server, the address bar in the browser, as robots.ts reads it. */
  private onDevelopmentSite(): boolean {
    const host = this.request ? this.request.headers.get('host') : this.doc.location?.host;
    return isDevelopmentHost(host);
  }

  private setName(name: string, content: string): void {
    this.meta.updateTag({ name, content }, `name="${name}"`);
  }

  private setProperty(property: string, content: string): void {
    this.meta.updateTag({ property, content }, `property="${property}"`);
  }

  private setCanonical(url: string): void {
    let link = this.doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.doc.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  private setJsonLd(data: object | null): void {
    this.doc.head.querySelector('script#page-jsonld')?.remove();
    if (!data) return;
    const script = this.doc.createElement('script');
    script.id = 'page-jsonld';
    script.setAttribute('type', 'application/ld+json');
    // Escape "<" so listing text can never close the script tag.
    script.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
    this.doc.head.appendChild(script);
  }
}

/** The organization itself, for the home page. */
export const ORGANIZATION_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'NGO',
  name: 'CARES Connects',
  legalName: 'Community Alliance of Resources Education and Support',
  url: SITE_URL,
  logo: `${SITE_URL}/icon-512.png`,
  description: 'A California 501(c)(3) nonprofit connecting residents of Placer and Sacramento Counties with verified local resources.',
  areaServed: [
    { '@type': 'AdministrativeArea', name: 'Placer County, California' },
    { '@type': 'AdministrativeArea', name: 'Sacramento County, California' },
  ],
  nonprofitStatus: 'Nonprofit501c3',
  sameAs: ['https://instagram.com/cares_connects', 'https://www.linkedin.com/company/cares-connects'],
}
