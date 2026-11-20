import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, RESPONSE_INIT } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { Api } from '../../../core/api';
import { Seo } from '../../../core/seo';
import { SITE_URL } from '../../site-content';

/** One blog post. */
@Component({
  selector: 'app-blog-post',
  imports: [DatePipe, RouterLink, MatIconModule, MatProgressBarModule],
  templateUrl: './blog-post.html',
  styleUrl: './blog-post.scss',
})
export class BlogPost {
  private readonly api = inject(Api);
  private readonly seo = inject(Seo);
  private readonly response = inject(RESPONSE_INIT, { optional: true });

  readonly slug = input.required<string>();
  readonly post = rxResource({ params: () => this.slug(), stream: ({ params }) => this.api.post(params) });
  /** value() throws while the resource is in its error state, so check first. */
  readonly loaded = computed(() => (this.post.hasValue() ? this.post.value() : undefined));

  constructor() {
    effect(() => {
      if (this.post.error()) {
        // A real 404 during server rendering, so search engines drop dead links.
        if (this.response) this.response.status = 404;
        this.seo.update({
          title: 'Post not found · CARES Connects',
          description: 'This post may have been moved or removed.',
          path: '/blog',
          noindex: true,
        });
        return;
      }
      const p = this.loaded();
      if (!p) return;
      this.seo.update({
        title: `${p.title} · CARES Connects`,
        description: p.description,
        path: `/blog/${p.slug}`,
        type: 'article',
        image: p.coverImage ?? undefined,
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: p.title,
          description: p.description,
          datePublished: p.publishedAt,
          image: p.coverImage ? SITE_URL + p.coverImage : undefined,
          author: { '@type': 'Organization', name: p.author ?? 'CARES Connects' },
          mainEntityOfPage: `${SITE_URL}/blog/${p.slug}`,
        },
      });
    });
  }
}
