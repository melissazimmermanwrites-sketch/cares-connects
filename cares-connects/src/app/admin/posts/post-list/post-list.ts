import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, numberAttribute, OnDestroy } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import type { AdminPostRow } from '../../../../shared/blog';
import { Api } from '../../../core/api';

/** Every blog post, newest edits first. */
@Component({
  selector: 'app-post-list',
  imports: [DatePipe, RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatPaginatorModule, MatProgressBarModule],
  templateUrl: './post-list.html',
  styleUrl: './post-list.scss',
})
export class PostList implements OnDestroy {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  readonly status = input<string>('');
  readonly q = input<string>('');
  readonly page = input(0, { transform: (v: unknown) => numberAttribute(v, 0) });

  readonly tabs = [
    { value: '', label: 'All' },
    { value: 'draft', label: 'Drafts' },
    { value: 'published', label: 'Published' },
  ];
  readonly current = computed(() => this.status() ?? '');
  readonly rows = rxResource({
    params: () => ({ status: this.current(), q: this.q() ?? '', page: this.page() }),
    stream: ({ params }) => this.api.adminPosts(params),
  });
  readonly items = computed(() => (this.rows.hasValue() ? this.rows.value().items : []));
  readonly total = computed(() => (this.rows.hasValue() ? this.rows.value().total : 0));

  readonly searchText = linkedSignal(() => this.q() ?? '');
  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const text = this.searchText();
      clearTimeout(this.searchTimer);
      if (text === (this.q() ?? '')) return;
      this.searchTimer = setTimeout(() => this.setFilters({ q: text || null }), 300);
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.searchTimer);
  }

  label(row: AdminPostRow): string {
    if (row.status === 'draft') return 'Draft';
    return row.publishedOn && row.publishedOn > new Date().toISOString().slice(0, 10) ? 'Scheduled' : 'Published';
  }

  setFilters(changes: Record<string, string | number | null>): void {
    this.router.navigate([], { queryParams: { page: null, ...changes }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  onPage(event: PageEvent): void {
    this.setFilters({ page: event.pageIndex || null });
  }
}
