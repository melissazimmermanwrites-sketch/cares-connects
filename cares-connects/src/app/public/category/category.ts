import { Component, computed, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { Seo } from '../../core/seo';
import { CountyFilter } from '../county-filter';
import { ResourceCard } from '../resource-card/resource-card';

@Component({
  selector: 'app-category',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule, CountyFilter, ResourceCard],
  templateUrl: './category.html',
  styleUrl: './category.scss',
})
export class CategoryPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly seo = inject(Seo);

  readonly slug = input.required<string>();
  readonly county = input<string>('');

  readonly categories = rxResource({ stream: () => this.api.categories() });
  readonly category = computed(() => this.categories.value()?.find((c) => c.slug === this.slug()));
  readonly resources = rxResource({
    params: () => ({ category: this.slug(), county: this.county() ?? '' }),
    stream: ({ params }) => this.api.resources(params),
  });

  constructor() {
    effect(() => {
      const c = this.category();
      if (!c) return;
      this.seo.update({
        title: `${c.name} in Placer & Sacramento · CARES Connects`,
        description:
          c.description ??
          `${c.resourceCount} verified ${c.name.toLowerCase()} programs in Placer and Sacramento Counties, with phone numbers, websites and directions.`,
        path: `/category/${c.slug}`,
      });
    });
  }

  setCounty(county: string): void {
    this.router.navigate([], { queryParams: { county: county || null }, replaceUrl: true });
  }
}
