import { Component, computed, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { DIRECTORY_PAGE_SIZE } from '../../../shared/api-types';
import { Api } from '../../core/api';
import { Seo } from '../../core/seo';
import { CountyFilter } from '../county-filter';
import { ResourceCard } from '../resource-card/resource-card';

/** Every listing, A to Z, a page at a time. Each card links through to that listing's own page. */
@Component({
  selector: 'app-directory',
  imports: [RouterLink, MatIconModule, MatProgressBarModule, CountyFilter, ResourceCard],
  templateUrl: './directory.html',
  styleUrl: './directory.scss',
})
export class DirectoryPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly seo = inject(Seo);

  readonly page = input<string>('1');
  readonly county = input<string>('');

  readonly pageNumber = computed(() => Math.max(Math.trunc(Number(this.page())) || 1, 1));
  readonly listings = rxResource({
    params: () => ({ page: this.pageNumber(), county: this.county() ?? '' }),
    stream: ({ params }) => this.api.directory(params),
  });
  readonly lastPage = computed(() => Math.max(Math.ceil((this.listings.hasValue() ? this.listings.value().total : 0) / DIRECTORY_PAGE_SIZE), 1));

  constructor() {
    effect(() => {
      const page = this.pageNumber();
      const county = this.county();
      this.seo.update({
        title: page > 1 ? `All listings, page ${page} · CARES Connects` : 'All listings · CARES Connects',
        description: 'Every program in the CARES Connects directory, A to Z, with phone numbers, websites and directions.',
        path: page > 1 ? `/resources?page=${page}` : '/resources',
        // County views repeat the same listings, so only the full list is offered to search engines.
        noindex: !!county,
      });
    });
  }

  queryFor(page: number): Record<string, string | number | null> {
    return { page: page > 1 ? page : null, county: this.county() || null };
  }

  setCounty(county: string): void {
    this.router.navigate([], { queryParams: { county: county || null, page: null } });
  }
}
