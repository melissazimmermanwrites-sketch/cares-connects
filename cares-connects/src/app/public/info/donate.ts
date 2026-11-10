import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Seo } from '../../core/seo';
import { DraftNotice } from './draft-notice';

/** Mock-up. Nothing here takes payment; the real donation link replaces the switched-off button. */
@Component({
  selector: 'app-donate',
  imports: [RouterLink, DraftNotice],
  templateUrl: './donate.html',
  styleUrl: './info-page.scss',
})
export class Donate {
  readonly amounts = ['$25', '$50', '$100', 'Other'];

  constructor() {
    inject(Seo).update({
      title: 'Donate · CARES Connects',
      description: 'Support CARES Connects.',
      path: '/donate',
      // Draft: stays out of search results until the real content is in.
      noindex: true,
    });
  }
}
