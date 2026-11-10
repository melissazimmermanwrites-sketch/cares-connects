import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { ORGANIZATION_JSONLD, Seo } from '../../core/seo';
import { serviceAreaLabel } from '../../../shared/api-types';
import { resourceLink } from '../../../shared/slug';
import { mapsUrl, telHref } from '../contact-links';
import { FEATURED_CATEGORIES, FEATURES, IMAGES, LINKS, STEPS } from '../site-content';

/** Marketing home page, laid out like caresconnects.org. The searchable directory lives at /find. */
@Component({
  selector: 'app-home',
  imports: [RouterLink, MatIconModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  private readonly api = inject(Api);

  readonly links = LINKS;
  readonly images = IMAGES;
  readonly features = FEATURES;
  readonly steps = STEPS;

  /** Pins on the hero map illustration. */
  readonly pins = [
    { x: 150, y: 175, color: '#003868', icon: 'home' },
    { x: 260, y: 120, color: '#003868', icon: 'restaurant' },
    { x: 300, y: 300, color: '#1a7fc1', icon: 'shopping_cart' },
    { x: 420, y: 255, color: '#ff6b4a', icon: 'ecg_heart' },
    { x: 380, y: 375, color: '#ffc61e', icon: 'directions_bus' },
    { x: 450, y: 470, color: '#ff6b4a', icon: 'priority_high' },
  ];

  readonly categories = rxResource({ stream: () => this.api.categories() });
  readonly categoryCount = computed(() => this.categories.value()?.length ?? 30);
  readonly featured = computed(() => {
    const counts = new Map((this.categories.value() ?? []).map((c) => [c.slug, c.resourceCount]));
    return FEATURED_CATEGORIES.map((f) => ({ ...f, count: counts.get(f.slug) ?? null }));
  });

  /** A real, verified listing for the hero's "example result" card. */
  readonly resourceLink = resourceLink;
  readonly foodListings = rxResource({ stream: () => this.api.resources({ category: 'food', county: 'placer' }) });
  readonly example = computed(() => {
    const list = this.foodListings.value() ?? [];
    return list.find((r) => r.verificationStatus === 'verified' && r.phone && r.address) ?? list[0] ?? null;
  });
  readonly exampleTel = computed(() => telHref(this.example()?.phone ?? null));
  readonly exampleMap = computed(() => mapsUrl(this.example()?.address ?? null));
  /** "Roseville" from "123 Main St, Roseville, CA 95678". */
  readonly exampleArea = computed(() => {
    const r = this.example();
    return r ? serviceAreaLabel(r) : '';
  });
  readonly exampleCity = computed(() => this.example()?.address?.split(',').at(-2)?.trim() ?? null);

  constructor() {
    inject(Seo).update({
      title: 'CARES Connects · Find verified local help in Placer & Sacramento',
      description:
        'Free directory of verified local resources in Placer and Sacramento Counties: food, shelter, health care, crisis support, legal help and 30+ more categories. No account needed.',
      path: '/',
      jsonLd: ORGANIZATION_JSONLD,
    });
  }
}
