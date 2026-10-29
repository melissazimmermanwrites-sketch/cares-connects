import { Component, RESPONSE_INIT, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Seo } from '../../core/seo';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <div class="page">
      <h1>Page not found</h1>
      <p>That page doesn't exist. <a routerLink="/find">Search the directory</a> or dial <a href="tel:211">211</a> for help.</p>
    </div>
  `,
})
export class NotFound {
  constructor() {
    inject(Seo).update({
      title: 'Page not found · CARES Connects',
      description: 'This page does not exist.',
      path: '/',
      noindex: true,
    });
    // Real 404 status during server rendering so search engines drop dead links.
    const response = inject(RESPONSE_INIT, { optional: true });
    if (response) response.status = 404;
  }
}
