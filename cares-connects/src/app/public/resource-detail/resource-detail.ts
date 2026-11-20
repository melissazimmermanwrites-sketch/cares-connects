import { Component, computed, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { Seo } from '../../core/seo';
import { serviceAreaLabel } from '../../../shared/api-types';
import { resourceIdFromParam, resourceParam } from '../../../shared/slug';
import { mapsUrl, telHref } from '../contact-links';

@Component({
  selector: 'app-resource-detail',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule],
  templateUrl: './resource-detail.html',
  styleUrl: './resource-detail.scss',
})
export class ResourceDetail {
  private readonly api = inject(Api);
  private readonly seo = inject(Seo);

  readonly id = input.required<string>();

  readonly resource = rxResource({ params: () => resourceIdFromParam(this.id()), stream: ({ params }) => this.api.resource(params) });
  /** The listing once loaded. value() throws while the resource is in its error state, so check first. */
  private readonly listing = computed(() => (this.resource.hasValue() ? this.resource.value() : undefined));
  readonly tel = computed(() => telHref(this.listing()?.phone ?? null));
  readonly map = computed(() => mapsUrl(this.listing()?.address ?? null));
  readonly area = computed(() => {
    const r = this.listing();
    return r ? serviceAreaLabel(r) : '';
  });

  constructor() {
    effect(() => {
      if (this.resource.error()) {
        this.seo.update({
          title: 'Listing not found · CARES Connects',
          description: 'This listing may have been removed or merged with another listing.',
          path: '/resources',
          noindex: true,
        });
        return;
      }
      const r = this.listing();
      if (!r) return;
      this.seo.update({
        title: `${r.name} · CARES Connects`,
        description: r.services ?? r.mission ?? `${r.name}, listed in the CARES Connects directory.`,
        path: `/resource/${resourceParam(r)}`,
        type: 'article',
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: r.name,
          url: r.website ?? undefined,
          telephone: r.phone ?? undefined,
          address: r.address ?? undefined,
          description: r.mission ?? undefined,
          areaServed: r.statewide ? 'California' : r.counties.map((c) => `${c.name} County, California`),
        },
      });
    });
  }
}
