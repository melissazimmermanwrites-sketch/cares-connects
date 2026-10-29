import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, numberAttribute, OnDestroy, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import {
  DISCOVERY_STATUS_LABELS,
  type DiscoveryQuery,
  type DiscoveryRow,
  type DiscoveryStatus,
} from '../../../shared/api-types';

type Filters = Required<DiscoveryQuery>;

/**
 * IRS discovery: new California 501(c)(3)s waiting for review, plus a search over every
 * human-services charity the IRS lists. "Review & add" opens a prefilled new-listing form.
 */
@Component({
  selector: 'app-discover',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
  ],
  templateUrl: './discover.html',
  styleUrl: './discover.scss',
})
export class Discover implements OnDestroy {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  readonly q = input('');
  readonly status = input<string>('new');
  readonly county = input<number | ''>('');
  readonly category = input<number | ''>('');
  readonly page = input(0, { transform: (v: unknown) => numberAttribute(v, 0) });

  readonly statusLabels: Record<string, string> = DISCOVERY_STATUS_LABELS;
  readonly columns = ['name', 'category', 'registered', 'status', 'actions'];

  readonly query = computed<Filters>(() => ({
    q: this.q() ?? '',
    status: (this.status() || 'new') as Filters['status'],
    county: this.county() ? Number(this.county()) : '',
    category: this.category() ? Number(this.category()) : '',
    page: this.page(),
    pageSize: 25,
  }));

  readonly rows = rxResource({ params: () => this.query(), stream: ({ params }) => this.api.discoveries(params) });
  readonly summary = rxResource({ stream: () => this.api.discoverySummary() });
  readonly counties = rxResource({ stream: () => this.api.adminCounties() });
  readonly categories = rxResource({ stream: () => this.api.adminCategories() });

  readonly running = computed(() => this.summary.value()?.lastRun?.status === 'running');
  readonly starting = signal(false);
  private pollTimer?: ReturnType<typeof setInterval>;

  readonly searchText = linkedSignal(() => this.q() ?? '');
  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const text = this.searchText();
      clearTimeout(this.searchTimer);
      if (text === (this.q() ?? '')) return;
      this.searchTimer = setTimeout(() => this.setFilters({ q: text }), 300);
    });
    // While a run is going, refresh the summary until it finishes, then reload the list.
    effect(() => {
      if (this.running() && !this.pollTimer) {
        this.pollTimer = setInterval(() => this.summary.reload(), 3000);
      } else if (!this.running() && this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = undefined;
        this.rows.reload();
      }
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.pollTimer);
    clearTimeout(this.searchTimer);
  }

  setFilters(changes: Partial<Filters>): void {
    const next = { ...this.query(), page: 0, ...changes };
    this.router.navigate([], {
      queryParams: {
        q: next.q || null,
        status: next.status === 'new' ? null : next.status,
        county: next.county || null,
        category: next.category || null,
        page: next.page || null,
      },
      replaceUrl: true,
    });
  }

  onPage(event: PageEvent): void {
    this.setFilters({ page: event.pageIndex });
  }

  async checkNow(): Promise<void> {
    this.starting.set(true);
    try {
      const started = await firstValueFrom(this.api.runDiscovery());
      if (started.message) this.snackBar.open(started.message, 'OK', { duration: 6000, verticalPosition: 'top' });
      this.summary.reload();
    } catch (err) {
      this.snackBar.open(errorMessage(err), 'OK', { duration: 5000, verticalPosition: 'top' });
    } finally {
      this.starting.set(false);
    }
  }

  async mark(row: DiscoveryRow, status: Exclude<DiscoveryStatus, 'approved'>): Promise<void> {
    const previous = row.status === 'approved' ? 'new' : row.status;
    try {
      await firstValueFrom(this.api.setDiscoveryStatus(row.ein, status));
      this.rows.reload();
      this.summary.reload();
      const ref = this.snackBar.open(`${row.name}: ${this.statusLabels[status].toLowerCase()}`, 'Undo', {
        duration: 6000,
        verticalPosition: 'top',
      });
      ref.onAction().subscribe(async () => {
        await firstValueFrom(this.api.setDiscoveryStatus(row.ein, previous));
        this.rows.reload();
        this.summary.reload();
      });
    } catch (err) {
      this.snackBar.open(errorMessage(err), 'OK', { duration: 5000, verticalPosition: 'top' });
    }
  }
}
