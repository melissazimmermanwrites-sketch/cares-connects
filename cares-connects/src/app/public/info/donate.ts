import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Seo } from '../../core/seo';
import { DONATION_OPTIONS } from '../site-content';

/** Copy from the old site's Donate page. Each amount opens a Stripe Payment Link; no payment runs through this site. */
@Component({
  selector: 'app-donate',
  imports: [RouterLink],
  templateUrl: './donate.html',
  styleUrl: './info-page.scss',
})
export class Donate {
  readonly options = DONATION_OPTIONS;

  constructor() {
    inject(Seo).update({
      title: 'Donate · CARES Connects',
      description:
        'Donate to CARES, a 501(c)(3) nonprofit. Your gift helps close the gap between available support services and the people who need them.',
      path: '/donate',
    });
  }
}
