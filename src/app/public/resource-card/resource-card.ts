import { Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { serviceAreaLabel, type PublicResource } from '../../../shared/api-types';
import { mapsUrl, telHref } from '../contact-links';

@Component({
  selector: 'app-resource-card',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './resource-card.html',
  styleUrl: './resource-card.scss',
})
export class ResourceCard {
  readonly resource = input.required<PublicResource>();
  readonly area = computed(() => serviceAreaLabel(this.resource()));

  readonly tel = computed(() => telHref(this.resource().phone));
  readonly map = computed(() => mapsUrl(this.resource().address));
  readonly summary = computed(() => {
    const text = this.resource().services ?? this.resource().mission ?? '';
    return text.length > 220 ? `${text.slice(0, 220).trimEnd()}…` : text;
  });
}
