import { Component, inject, input, output } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Api } from '../core/api';

/**
 * "Where are you?" picker. Lists only counties that have listings; a statewide listing shows
 * under every county. Value is a county slug, or '' for all of California.
 */
@Component({
  selector: 'app-county-filter',
  template: `
    <label class="wrap">
      <span class="label">Where are you?</span>
      <select [value]="value()" (change)="changed.emit($any($event.target).value)">
        <option value="">All of California</option>
        @for (c of counties.value() ?? []; track c.id) {
          <option [value]="c.slug" [selected]="c.slug === value()">{{ c.name }} County</option>
        }
      </select>
    </label>
  `,
  styles: `
    .wrap {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .label {
      font-weight: 700;
      color: var(--cc-navy, #0d3b66);
    }
    select {
      min-height: 44px;
      min-width: 220px;
      padding: 0 40px 0 16px;
      border: 2px solid var(--cc-navy, #0d3b66);
      border-radius: 999px;
      background: #fff
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%230d3b66' stroke-width='2'/%3E%3C/svg%3E")
        no-repeat right 16px center;
      appearance: none;
      font: inherit;
      color: var(--cc-ink, #1f2a37);
      cursor: pointer;
    }
    select:focus-visible {
      outline: 3px solid var(--cc-blue-text, #1669a3);
      outline-offset: 2px;
    }
  `,
})
export class CountyFilter {
  private readonly api = inject(Api);

  readonly value = input<string>('');
  readonly changed = output<string>();
  readonly counties = rxResource({ stream: () => this.api.counties() });
}
