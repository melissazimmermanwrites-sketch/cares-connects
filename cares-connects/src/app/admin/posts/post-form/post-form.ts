import { DatePipe } from '@angular/common';
import { Component, computed, effect, ElementRef, inject, input, OnDestroy, signal, viewChild } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import type { AdminPost, PostInput, PostStatus } from '../../../../shared/blog';
import { slugify } from '../../../../shared/slug';
import { Api, errorMessage } from '../../../core/api';
import { applyMarkdownAction, type MarkdownAction } from './markdown-actions';

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** Writes and edits a post: fields on one side, Markdown with a live preview, draft or publish. */
@Component({
  selector: 'app-post-form',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule],
  templateUrl: './post-form.html',
  styleUrl: './post-form.scss',
})
export class PostForm implements OnDestroy {
  private readonly api = inject(Api);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  /** Route param; undefined on /admin/posts/new. */
  readonly id = input<string>();
  readonly isNew = computed(() => !this.id());

  readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    slug: ['', Validators.maxLength(120)],
    description: ['', Validators.maxLength(300)],
    author: ['CARES Connects', Validators.maxLength(100)],
    publishedOn: [''],
    coverImage: [''],
    coverAlt: ['', Validators.maxLength(300)],
    body: [''],
  });

  readonly existing = rxResource({
    params: () => (this.id() ? Number(this.id()) : undefined),
    stream: ({ params }) => (params ? this.api.adminPost(params) : of(undefined)),
  });

  readonly record = signal<AdminPost | null>(null);
  readonly status = computed<PostStatus>(() => this.record()?.status ?? 'draft');
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly error = signal<string | null>(null);
  readonly previewHtml = signal('');
  /** On phones the editor and preview take turns. */
  readonly tab = signal<'write' | 'preview'>('write');
  readonly actions: { action: MarkdownAction; label: string; icon: string }[] = [
    { action: 'heading', label: 'Heading', icon: 'title' },
    { action: 'bold', label: 'Bold', icon: 'format_bold' },
    { action: 'italic', label: 'Italic', icon: 'format_italic' },
    { action: 'link', label: 'Link', icon: 'link' },
    { action: 'bullets', label: 'Bulleted list', icon: 'format_list_bulleted' },
    { action: 'numbers', label: 'Numbered list', icon: 'format_list_numbered' },
    { action: 'quote', label: 'Quote', icon: 'format_quote' },
  ];

  private readonly bodyInput = viewChild<ElementRef<HTMLTextAreaElement>>('bodyInput');
  private previewTimer?: ReturnType<typeof setTimeout>;
  /** Until someone edits the web address, it follows the title. */
  private slugTouched = false;

  constructor() {
    effect(() => {
      if (this.existing.hasValue()) {
        const post = this.existing.value();
        if (post) this.load(post);
      }
    });
    this.form.controls.title.valueChanges.pipe(takeUntilDestroyed()).subscribe((title) => {
      if (!this.slugTouched && this.status() === 'draft') this.form.controls.slug.setValue(slugify(title), { emitEvent: false });
    });
    this.form.controls.body.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.schedulePreview());
  }

  ngOnDestroy(): void {
    clearTimeout(this.previewTimer);
  }

  private load(post: AdminPost): void {
    this.record.set(post);
    this.slugTouched = true;
    this.form.reset({
      title: post.title,
      slug: post.slug,
      description: post.description,
      author: post.author ?? '',
      publishedOn: post.publishedOn ?? '',
      coverImage: post.coverImage ?? '',
      coverAlt: post.coverAlt ?? '',
      body: post.body,
    });
    this.schedulePreview(0);
  }

  markSlugEdited(): void {
    this.slugTouched = true;
  }

  private schedulePreview(delay = 400): void {
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(async () => {
      try {
        const { html } = await firstValueFrom(this.api.previewPost(this.form.controls.body.value));
        this.previewHtml.set(html);
      } catch {
        // The preview catches up on the next change; it isn't worth interrupting someone's writing.
      }
    }, delay);
  }

  format(action: MarkdownAction): void {
    const el = this.bodyInput()?.nativeElement;
    if (!el) return;
    const result = applyMarkdownAction(el.value, el.selectionStart, el.selectionEnd, action);
    this.setBody(result.text, result.selectionStart, result.selectionEnd);
  }

  private setBody(text: string, start: number, end: number): void {
    this.form.controls.body.setValue(text);
    this.form.markAsDirty();
    const el = this.bodyInput()?.nativeElement;
    if (!el) return;
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start, end);
    });
  }

  private async upload(file: File | undefined): Promise<string | null> {
    if (!file) return null;
    if (file.size > MAX_IMAGE_BYTES) {
      this.error.set('That image is over 3 MB. Please use a smaller one.');
      return null;
    }
    this.uploading.set(true);
    this.error.set(null);
    try {
      return (await firstValueFrom(this.api.uploadMedia(file))).url;
    } catch (err) {
      this.error.set(errorMessage(err));
      return null;
    } finally {
      this.uploading.set(false);
    }
  }

  async uploadCover(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const url = await this.upload(input.files?.[0]);
    input.value = '';
    if (url) {
      this.form.patchValue({ coverImage: url });
      this.form.markAsDirty();
    }
  }

  removeCover(): void {
    this.form.patchValue({ coverImage: '', coverAlt: '' });
    this.form.markAsDirty();
  }

  async insertImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const el = this.bodyInput()?.nativeElement;
    const position = el?.selectionStart ?? this.form.controls.body.value.length;
    const url = await this.upload(input.files?.[0]);
    input.value = '';
    if (!url) return;
    const body = this.form.controls.body.value;
    const description = 'Describe this image';
    const before = `${body.slice(0, position)}${position && !body.slice(0, position).endsWith('\n\n') ? '\n\n' : ''}![`;
    this.setBody(`${before}${description}](${url})\n\n${body.slice(position)}`, before.length, before.length + description.length);
  }

  private toInput(status: PostStatus): PostInput {
    const v = this.form.getRawValue();
    const blank = (s: string) => s.trim() || null;
    return {
      title: v.title.trim(),
      slug: v.slug.trim(),
      description: v.description.trim(),
      body: v.body,
      author: blank(v.author),
      publishedOn: blank(v.publishedOn),
      coverImage: blank(v.coverImage),
      coverAlt: blank(v.coverAlt),
      status,
    };
  }

  async save(status: PostStatus): Promise<void> {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Please fix the highlighted fields.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const id = this.id();
      const input = this.toInput(status);
      const saved = await firstValueFrom(id ? this.api.updatePost(Number(id), input) : this.api.createPost(input));
      this.load(saved);
      this.snackBar.open(this.savedMessage(saved), 'OK', { duration: 3000, verticalPosition: 'top' });
      if (!id) await this.router.navigate(['/admin/posts', saved.id], { replaceUrl: true });
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  private savedMessage(post: AdminPost): string {
    if (post.status === 'draft') return 'Draft saved';
    return post.publishedOn && post.publishedOn > new Date().toISOString().slice(0, 10)
      ? `Scheduled for ${post.publishedOn}`
      : 'Published';
  }

  async remove(): Promise<void> {
    const post = this.record();
    if (!post || !confirm(`Delete “${post.title}”? This can’t be undone.`)) return;
    try {
      await firstValueFrom(this.api.deletePost(post.id));
      this.form.markAsPristine();
      await this.router.navigate(['/admin/posts']);
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }

  /** Used by the route's canDeactivate guard. */
  canLeave(): boolean {
    return !this.form.dirty || confirm('You have unsaved changes. Leave without saving?');
  }
}
