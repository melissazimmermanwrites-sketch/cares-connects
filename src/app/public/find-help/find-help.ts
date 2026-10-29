import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { Api } from '../../core/api';
import { Seo } from '../../core/seo';
import { CountyFilter } from '../county-filter';
import { ResourceCard } from '../resource-card/resource-card';

/** Icons for the original categories; new ones fall back to a generic icon. */
const CATEGORY_ICONS: Record<string, string> = {
  'shelter-and-housing': 'home',
  'domestic-violence-ipv': 'shield_person',
  'crisis-help-lines': 'support_agent',
  'substance-abuse-and-recovery': 'healing',
  'medical-and-dental-health': 'medical_services',
  'suicide-prevention': 'favorite',
  'human-trafficking': 'front_hand',
  'job-assistance': 'work',
  'financial-aid': 'payments',
  legal: 'gavel',
  transportation: 'directions_bus',
  immigration: 'public',
  'disability-support': 'accessible',
  'aging-adult': 'elderly',
  'in-home-help': 'cottage',
  hospice: 'spa',
  'mental-health': 'psychology',
  mentorship: 'diversity_3',
  'parenting-resources': 'family_restroom',
  rehabilitation: 'self_improvement',
  'youth-activities': 'sports_soccer',
  'small-business': 'storefront',
  'foster-youth': 'child_care',
  latino: 'translate',
  tribal: 'landscape',
  food: 'restaurant',
  'household-goods': 'chair',
  'pet-health-and-rescue': 'pets',
  clothing: 'checkroom',
  education: 'school',
  'community-services': 'groups',
  veterans: 'military_tech',
  'donation-and-volunteer': 'volunteer_activism',
};

@Component({
  selector: 'app-find-help',
  imports: [
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    CountyFilter,
    ResourceCard,
  ],
  templateUrl: './find-help.html',
  styleUrl: './find-help.scss',
})
export class FindHelp {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  readonly q = input('');
  readonly county = input<string>('');

  readonly searchText = linkedSignal(() => this.q() ?? '');
  readonly categories = rxResource({ stream: () => this.api.categories() });
  readonly results = rxResource({
    params: () => ({ q: (this.q() ?? '').trim(), county: this.county() ?? '' }),
    stream: ({ params }) => (params.q ? this.api.resources(params) : of(null)),
  });
  readonly searching = computed(() => !!(this.q() ?? '').trim());

  constructor() {
    inject(Seo).update({
      title: 'Find help · CARES Connects',
      description:
        'Search verified local programs in Placer and Sacramento Counties by need or keyword, or browse all categories.',
      path: '/find',
    });
  }

  icon(slug: string): string {
    return CATEGORY_ICONS[slug] ?? 'category';
  }

  search(): void {
    this.router.navigate([], {
      queryParams: { q: this.searchText().trim() || null },
      queryParamsHandling: 'merge',
    });
  }

  setCounty(county: string): void {
    this.router.navigate([], { queryParams: { county: county || null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  clearSearch(): void {
    this.searchText.set('');
    this.router.navigate([], { queryParams: { q: null }, queryParamsHandling: 'merge' });
  }
}
