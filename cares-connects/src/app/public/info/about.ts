import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Seo } from '../../core/seo';

/** Copy from the old site's About page (exported by Mel, 2026-11-10). */
@Component({
  selector: 'app-about',
  imports: [RouterLink],
  templateUrl: './about.html',
  styleUrl: './info-page.scss',
})
export class About {
  constructor() {
    inject(Seo).update({
      title: 'About · CARES Connects',
      description: 'Meet the team and mission behind the nonprofit Community Alliance of Resources Education and Support (CARES).',
      path: '/about',
    });
  }
}
