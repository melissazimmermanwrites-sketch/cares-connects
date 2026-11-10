import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Seo } from '../../../core/seo';

/** Shown after the contact form is sent. */
@Component({
  selector: 'app-contact-thanks',
  imports: [RouterLink, MatIconModule],
  template: `
    <div class="page">
      <mat-icon class="icon" aria-hidden="true">task_alt</mat-icon>
      <h1 class="cc-heading">Thank you for reaching out</h1>
      <p>We’ve received your message and will reply by email.</p>
      <p><strong>Need help right now?</strong> Please don’t wait for a reply. Call or text <a href="tel:988">988</a>, dial <a href="tel:211">211</a>, or call <a href="tel:911">911</a> in an emergency.</p>
      <div class="actions">
        <a routerLink="/find" class="cc-btn orange small">Find help near you</a>
        <a routerLink="/">Back to home</a>
      </div>
    </div>
  `,
  styles: `
    .page { max-width: 640px; }
    .icon { width: 56px; height: 56px; font-size: 56px; color: var(--cc-green); }
    h1 { margin: 8px 0 12px; }
    p { margin: 0 0 12px; }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; margin-top: 20px; }
  `,
})
export class ContactThanks {
  constructor() {
    inject(Seo).update({
      title: 'Thank you · CARES Connects',
      description: 'We received your message.',
      path: '/contact/thanks',
      noindex: true,
    });
  }
}
