import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { BLOG_PAGE_SIZE, MAX_SEARCH_LENGTH } from '../../../../shared/blog';
import { Api } from '../../../core/api';
import { Seo } from '../../../core/seo';

/** The blogroll: newest posts first, a page at a time, searchable by word and filterable by category. */
@Component({
  selector: 'app-blog-list',
  imports: [DatePipe, RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule],
  templateUrl: './blog-list.html',
  styleUrl: './blog-list.scss',
})
export class BlogList {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly seo = inject(Seo);

  readonly maxSearchLength = MAX_SEARCH_LENGTH;

  // Bound from the query string: /blog?q=food&category=Food&page=2
  readonly page = input<string>('1');
  readonly q = input<string>('');
  readonly category = input<string>('');

  readonly pageNumber = computed(() => Math.max(Math.trunc(Number(this.page())) || 1, 1));
  readonly query = computed(() => (this.q() ?? '').trim());
  readonly activeCategory = computed(() => (this.category() ?? '').trim());
  readonly filtering = computed(() => !!(this.query() || this.activeCategory()));

  /** What's typed in the box; resets to the URL's search when it changes. */
  readonly searchText = linkedSignal(() => this.query());

  readonly categories = rxResource({ stream: () => this.api.postCategories() });
  readonly posts = rxResource({
    params: () => ({ page: this.pageNumber(), q: this.query(), category: this.activeCategory() }),
    stream: ({ params }) => this.api.posts(params),
  });
  readonly lastPage = computed(() =>
    Math.max(Math.ceil((this.posts.hasValue() ? this.posts.value().total : 0) / BLOG_PAGE_SIZE), 1),
  );

  constructor() {
    effect(() => {
      const page = this.pageNumber();
      this.seo.update({
        title: page > 1 ? `Blog, page ${page} · CARES Connects` : 'Blog · CARES Connects',
        description: 'News, stories and guides from CARES Connects on finding local help in Placer and Sacramento Counties.',
        path: page > 1 ? `/blog?page=${page}` : '/blog',
        // Searches and category views repeat posts already on the blogroll.
        noindex: this.filtering(),
      });
    });
  }

  /** Query params for a link that keeps the current search and category. */
  pageQuery(page: number): Record<string, string | number | null> {
    return { page: page > 1 ? page : null, q: this.query() || null, category: this.activeCategory() || null };
  }

  /** Query params for a category tag on a card: that category, keeping any search. */
  categoryQuery(category: string): Record<string, string | null> {
    return { category, q: this.query() || null, page: null };
  }

  search(event: Event): void {
    event.preventDefault();
    this.navigate({ q: this.searchText().trim().slice(0, MAX_SEARCH_LENGTH) || null });
  }

  setCategory(category: string): void {
    this.navigate({ category: category || null });
  }

  clearSearch(): void {
    this.searchText.set('');
    this.navigate({ q: null });
  }

  clearAll(): void {
    this.searchText.set('');
    this.navigate({ q: null, category: null });
  }

  /** Any change of search or category goes back to the first page. */
  private navigate(params: Record<string, string | null>): void {
    this.router.navigate([], { queryParams: { ...params, page: null }, queryParamsHandling: 'merge' });
  }
}
