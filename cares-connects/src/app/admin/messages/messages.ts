import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, numberAttribute } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { ContactMessageRow, ContactStatus } from '../../../shared/contact';
import { Api, errorMessage } from '../../core/api';

/** Messages from the public contact form. */
@Component({
  selector: 'app-messages',
  imports: [DatePipe, MatButtonModule, MatPaginatorModule, MatProgressBarModule],
  templateUrl: './messages.html',
  styleUrl: './messages.scss',
})
export class Messages {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  readonly status = input<string>('new');
  readonly page = input(0, { transform: (v: unknown) => numberAttribute(v, 0) });

  readonly tabs: { value: ContactStatus; label: string }[] = [
    { value: 'new', label: 'New' },
    { value: 'read', label: 'Read' },
    { value: 'spam', label: 'Spam' },
  ];
  readonly current = computed(() => (this.status() || 'new') as ContactStatus);
  readonly rows = rxResource({
    params: () => ({ status: this.current(), page: this.page() }),
    stream: ({ params }) => this.api.contactMessages(params),
  });
  readonly summary = rxResource({ stream: () => this.api.contactSummary() });
  readonly items = computed(() => (this.rows.hasValue() ? this.rows.value().items : []));
  readonly total = computed(() => (this.rows.hasValue() ? this.rows.value().total : 0));

  select(status: ContactStatus): void {
    this.router.navigate([], { queryParams: { status: status === 'new' ? null : status, page: null } });
  }

  onPage(event: PageEvent): void {
    this.router.navigate([], { queryParams: { page: event.pageIndex || null }, queryParamsHandling: 'merge' });
  }

  replyLink(row: ContactMessageRow): string {
    return `mailto:${encodeURIComponent(row.email)}?subject=${encodeURIComponent('Your message to CARES Connects')}`;
  }

  async mark(row: ContactMessageRow, status: ContactStatus): Promise<void> {
    try {
      await firstValueFrom(this.api.setContactStatus(row.id, status));
      this.rows.reload();
      this.summary.reload();
    } catch (err) {
      this.snackBar.open(errorMessage(err), 'OK', { duration: 5000, verticalPosition: 'top' });
    }
  }
}
