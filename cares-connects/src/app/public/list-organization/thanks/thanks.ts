import { Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { Seo } from '../../../core/seo';

/** Shown after the "List your organization" form is sent. */
@Component({
  selector: 'app-listing-thanks',
  imports: [RouterLink, MatIconModule],
  templateUrl: './thanks.html',
  styleUrl: './thanks.scss',
})
export class ListingThanks {
  /** Passed in memory from the form, so it never appears in the address bar or a log. */
  readonly email = signal<string | null>(null);

  constructor() {
    const state = inject(Router).currentNavigation()?.extras.state as { email?: string } | undefined;
    this.email.set(state?.email ?? null);
    inject(Seo).update({
      title: 'Thank you · CARES Connects',
      description: 'We received your request to list your organization.',
      path: '/list-your-organization/thanks',
      noindex: true,
    });
  }
}
