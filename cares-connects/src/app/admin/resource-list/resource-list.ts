import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, numberAttribute } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, type Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../../core/api';
import { type AdminResourceQuery, type AdminResourceRow, STATUS_LABELS } from '../../../shared/api-types';

type Filters = Required<AdminResourceQuery>;

/**
 * The main admin screen: every listing in a searchable, sortable table.
 * Filters live in the URL query string so refresh/back keep your place.
 */
@Component({
  selector: 'app-resource-list',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSortModule,
    MatTableModule,
  ],
  templateUrl: './resource-list.html',
  styleUrl: './resource-list.scss',
})
export class ResourceList {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  // Bound from the query string (withComponentInputBinding).
  readonly q = input('');
  readonly county = input<string>('');
  readonly category = input<number | ''>('');
  readonly status = input<Filters['status']>('');
  readonly duplicates = input(false, { transform: (v: unknown) => v === true || v === 'true' });
  readonly archived = input<Filters['archived']>('active');
  readonly sort = input<Filters['sort']>('name');
  readonly dir = input<Filters['dir']>('asc');
  readonly page = input(0, { transform: (v: unknown) => numberAttribute(v, 0) });
  readonly pageSize = input(25, { transform: (v: unknown) => numberAttribute(v, 25) });

  // Widened to string keys because mat-table row variables are untyped in templates.
  readonly statusLabels: Record<string, string> = STATUS_LABELS;
  readonly columns = ['name', 'county', 'phone', 'status', 'updatedAt', 'actions'];

  readonly query = computed<Filters>(() => ({
    q: this.q() ?? '',
    county: this.county() === 'statewide' ? 'statewide' : Number(this.county()) || '',
    category: this.category() ? Number(this.category()) : '',
    status: this.status() ?? '',
    duplicates: this.duplicates(),
    archived: this.archived() || 'active',
    sort: this.sort() || 'name',
    dir: this.dir() || 'asc',
    page: this.page(),
    pageSize: this.pageSize(),
  }));

  readonly rows = rxResource({ params: () => this.query(), stream: ({ params }) => this.api.adminResources(params) });
  readonly stats = rxResource({ stream: () => this.api.stats() });
  readonly categories = rxResource({ stream: () => this.api.adminCategories() });
  readonly counties = rxResource({ stream: () => this.api.adminCounties() });
  readonly loadError = computed(() => (this.rows.error() ? errorMessage(this.rows.error()) : null));

  /** What's typed in the search box; pushed to the URL after a short pause. */
  readonly searchText = linkedSignal(() => this.q() ?? '');
  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const text = this.searchText();
      clearTimeout(this.searchTimer);
      if (text === (this.q() ?? '')) return;
      this.searchTimer = setTimeout(() => this.setFilters({ q: text }), 300);
    });
  }

  setFilters(changes: Partial<Filters>): void {
    const next = { ...this.query(), page: 0, ...changes };
    const queryParams: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(next)) {
      const isDefault =
        value === '' ||
        value === false ||
        (key === 'archived' && value === 'active') ||
        (key === 'sort' && value === 'name') ||
        (key === 'dir' && value === 'asc') ||
        (key === 'page' && value === 0) ||
        (key === 'pageSize' && value === 25);
      queryParams[key] = isDefault ? null : value;
    }
    this.router.navigate([], { queryParams, replaceUrl: true });
  }

  clearFilters(): void {
    this.searchText.set('');
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  /** CSV download of exactly what the table is showing (all pages). */
  readonly csvUrl = computed(() => {
    const { q, county, category, status, duplicates, archived } = this.query();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ q, county, category, status, duplicates, archived })) {
      if (value !== '' && value !== false) params.set(key, String(value));
    }
    return `/api/admin/export.csv?${params}`;
  });

  readonly hasFilters = computed(() => {
    const f = this.query();
    return !!(f.q || f.county || f.category || f.status || f.duplicates || f.archived !== 'active');
  });

  onSort(sort: Sort): void {
    this.setFilters({
      sort: (sort.direction ? sort.active : 'name') as Filters['sort'],
      dir: sort.direction || 'asc',
    });
  }

  onPage(event: PageEvent): void {
    this.setFilters({ page: event.pageIndex, pageSize: event.pageSize });
  }

  open(row: AdminResourceRow): void {
    this.router.navigate(['/admin/resources', row.id]);
  }
}
