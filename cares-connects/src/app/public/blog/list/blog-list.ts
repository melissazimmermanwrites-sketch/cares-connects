import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { BLOG_PAGE_SIZE } from '../../../../shared/blog';
import { Api } from '../../../core/api';
import { Seo } from '../../../core/seo';

/** The blogroll: newest posts first, a page at a time. */
@Component({
  selector: 'app-blog-list',
  imports: [DatePipe, RouterLink, MatIconModule, MatProgressBarModule],
  templateUrl: './blog-list.html',
  styleUrl: './blog-list.scss',
})
export class BlogList {
  private readonly api = inject(Api);
  private readonly seo = inject(Seo);

  readonly page = input<string>('1');
  readonly pageNumber = computed(() => Math.max(Math.trunc(Number(this.page())) || 1, 1));
  readonly posts = rxResource({ params: () => this.pageNumber(), stream: ({ params }) => this.api.posts(params) });
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
      });
    });
  }

  pageQuery(page: number): Record<string, number | null> {
    return { page: page > 1 ? page : null };
  }
}
