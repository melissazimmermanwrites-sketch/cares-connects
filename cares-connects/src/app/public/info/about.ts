import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Seo } from '../../core/seo';
import { DraftNotice } from './draft-notice';

/** Mock-up. The intro and mission come from the home page; the rest is waiting on real content. */
@Component({
  selector: 'app-about',
  imports: [RouterLink, DraftNotice],
  templateUrl: './about.html',
  styleUrl: './info-page.scss',
})
export class About {
  constructor() {
    inject(Seo).update({
      title: 'About · CARES Connects',
      description: 'CARES Connects is a California 501(c)(3) nonprofit improving access to local resources.',
      path: '/about',
      // Draft: stays out of search results until the real content is in.
      noindex: true,
    });
  }
}
