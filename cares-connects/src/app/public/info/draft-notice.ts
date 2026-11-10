import { Component } from '@angular/core';

/** Marks a page as a mock-up. Remove it from a page once the real content is in. */
@Component({
  selector: 'app-draft-notice',
  template: `<p class="notice" role="note"><strong>Draft page.</strong> Text marked “To add” is waiting on real content.</p>`,
  styles: `
    .notice {
      margin: 0 0 24px;
      padding: 10px 14px;
      border-radius: 12px;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }
  `,
})
export class DraftNotice {}
