import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, numberAttribute, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  EMAIL_STATUS_LABELS,
  MAX_VERIFICATION_EMAILS,
  SUBMISSION_STATUS_LABELS,
  type CheckStatus,
  type SubmissionChecks,
  type SubmissionRow,
  type SubmissionStatus,
} from '../../../shared/submissions';
import { Api, errorMessage } from '../../core/api';

const CHECK_ICONS: Record<CheckStatus, string> = { pass: 'check_circle', warn: 'error', fail: 'cancel', unknown: 'help' };
const OVERALL_LABELS: Record<SubmissionChecks['overall'], string> = {
  pass: 'Passed the checks',
  review: 'Needs a closer look',
  fail: 'Failed a check',
};

/**
 * "List your organization" requests. Opening the queue runs the website and email checks on
 * anything not yet checked, one at a time. A person always makes the decision.
 */
@Component({
  selector: 'app-submissions',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatPaginatorModule, MatProgressBarModule],
  templateUrl: './submissions.html',
  styleUrl: './submissions.scss',
})
export class Submissions {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  readonly status = input<string>('pending');
  readonly page = input(0, { transform: (v: unknown) => numberAttribute(v, 0) });

  readonly tabs: { value: string; label: string }[] = [
    { value: 'pending', label: SUBMISSION_STATUS_LABELS.pending },
    { value: 'awaiting_email', label: SUBMISSION_STATUS_LABELS.awaiting_email },
    { value: 'duplicate', label: SUBMISSION_STATUS_LABELS.duplicate },
    { value: 'spam', label: SUBMISSION_STATUS_LABELS.spam },
    { value: 'approved', label: SUBMISSION_STATUS_LABELS.approved },
    { value: 'rejected', label: SUBMISSION_STATUS_LABELS.rejected },
  ];
  readonly checkIcons = CHECK_ICONS;
  readonly overallLabels = OVERALL_LABELS;
  readonly statusLabels = SUBMISSION_STATUS_LABELS;
  readonly emailLabels = EMAIL_STATUS_LABELS;
  readonly maxEmails = MAX_VERIFICATION_EMAILS;
  readonly resending = signal<Set<number>>(new Set());

  readonly current = computed(() => this.status() || 'pending');
  readonly rows = rxResource({
    params: () => ({ status: this.current(), page: this.page() }),
    stream: ({ params }) => this.api.submissions(params),
  });
  readonly summary = rxResource({ stream: () => this.api.submissionSummary() });
  readonly items = computed(() => (this.rows.hasValue() ? this.rows.value().items : []));

  /** Results that arrived after the list loaded. */
  private readonly updated = signal<Record<number, SubmissionRow>>({});
  readonly checking = signal<Set<number>>(new Set());
  readonly list = computed(() => this.items().map((r) => this.updated()[r.id] ?? r));

  constructor() {
    effect(() => {
      if (this.current() !== 'pending' && this.current() !== 'duplicate') return;
      const unchecked = this.items().filter((r) => !r.checks);
      if (unchecked.length) void this.checkAll(unchecked);
    });
  }

  private async checkAll(rows: SubmissionRow[]): Promise<void> {
    for (const row of rows) {
      if (this.checking().has(row.id) || this.updated()[row.id]?.checks) continue;
      await this.runCheck(row);
    }
  }

  async runCheck(row: SubmissionRow): Promise<void> {
    this.checking.update((s) => new Set(s).add(row.id));
    try {
      const fresh = await firstValueFrom(this.api.checkSubmission(row.id));
      this.updated.update((u) => ({ ...u, [row.id]: fresh }));
    } catch (err) {
      this.snackBar.open(errorMessage(err), 'OK', { duration: 5000, verticalPosition: 'top' });
    } finally {
      this.checking.update((s) => {
        const next = new Set(s);
        next.delete(row.id);
        return next;
      });
    }
  }

  /** Where a request goes when it's cleared as not spam: it still has to confirm its email. */
  afterNotSpam(row: SubmissionRow): SubmissionStatus {
    return row.emailStatus === 'verified' ? 'pending' : 'awaiting_email';
  }

  canResend(row: SubmissionRow): boolean {
    return row.status === 'awaiting_email' && row.emailStatus !== 'declined' && row.emailSendCount < this.maxEmails;
  }

  async resend(row: SubmissionRow): Promise<void> {
    this.resending.update((s) => new Set(s).add(row.id));
    try {
      const fresh = await firstValueFrom(this.api.resendVerification(row.id));
      this.updated.update((u) => ({ ...u, [row.id]: fresh }));
      this.snackBar.open(`Sent to ${row.contactEmail}`, 'OK', { duration: 4000, verticalPosition: 'top' });
    } catch (err) {
      this.snackBar.open(errorMessage(err), 'OK', { duration: 5000, verticalPosition: 'top' });
    } finally {
      this.resending.update((s) => {
        const next = new Set(s);
        next.delete(row.id);
        return next;
      });
    }
  }

  answerLines(row: SubmissionRow): string[] {
    const a = row.answers;
    const line = (label: string, value: string | string[] | null) => {
      const text = Array.isArray(value) ? value.join(', ') : value;
      return text ? `${label}: ${text}` : null;
    };
    return [
      line('Apply', a.applicationMethods),
      line('Qualifies by', a.eligibility),
      line('Heard about through', a.outreach),
      line('Fees', a.fees),
      line('Wait', a.waitTime),
      line('Service length', a.serviceLength),
    ].filter((l): l is string => !!l);
  }

  select(status: string): void {
    this.router.navigate([], { queryParams: { status: status === 'pending' ? null : status, page: null } });
  }

  onPage(event: PageEvent): void {
    this.router.navigate([], { queryParams: { page: event.pageIndex || null }, queryParamsHandling: 'merge' });
  }

  async mark(row: SubmissionRow, status: SubmissionStatus): Promise<void> {
    const previous = row.status;
    try {
      await firstValueFrom(this.api.setSubmissionStatus(row.id, status));
      this.refresh();
      this.snackBar
        .open(`${row.name}: ${this.statusLabels[status].toLowerCase()}`, 'Undo', { duration: 6000, verticalPosition: 'top' })
        .onAction()
        .subscribe(async () => {
          await firstValueFrom(this.api.setSubmissionStatus(row.id, previous));
          this.refresh();
        });
    } catch (err) {
      this.snackBar.open(errorMessage(err), 'OK', { duration: 5000, verticalPosition: 'top' });
    }
  }

  private refresh(): void {
    this.updated.set({});
    this.rows.reload();
    this.summary.reload();
  }
}
