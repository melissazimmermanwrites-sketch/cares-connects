import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { Seo } from '../../core/seo';
import { LINKS } from '../site-content';
import { DraftNotice } from './draft-notice';

@Component({
  selector: 'app-contact',
  imports: [ReactiveFormsModule, RouterLink, DraftNotice],
  templateUrl: './contact.html',
  styleUrl: './info-page.scss',
})
export class Contact {
  private readonly api = inject(Api);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);

  readonly links = LINKS;
  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(200)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(200)]],
    message: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(4000)]],
    faxExtension: [''],
  });
  readonly sending = signal(false);
  readonly error = signal<string | null>(null);
  readonly unavailable = signal(false);
  private token = '';

  constructor() {
    inject(Seo).update({
      title: 'Contact · CARES Connects',
      description: 'Get in touch with CARES Connects.',
      path: '/contact',
      // Draft: stays out of search results until the real content is in.
      noindex: true,
    });
    // Browser only: a token issued while rendering on the server would start its clock too early.
    afterNextRender(() => void this.loadToken());
  }

  private async loadToken(): Promise<void> {
    try {
      this.token = (await firstValueFrom(this.api.contactToken())).token;
      this.unavailable.set(false);
    } catch {
      this.unavailable.set(true);
    }
  }

  showError(name: 'name' | 'email' | 'message'): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  async submit(): Promise<void> {
    if (this.sending()) return;
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Please fix the highlighted fields.');
      return;
    }
    this.sending.set(true);
    try {
      await firstValueFrom(this.api.sendContactMessage({ ...this.form.getRawValue(), token: this.token }));
      await this.router.navigate(['/contact/thanks']);
    } catch (err) {
      this.error.set(errorMessage(err));
      // An expired or used form gets a fresh token, so sending again just works.
      if (err instanceof HttpErrorResponse && err.error?.code === 'token') await this.loadToken();
    } finally {
      this.sending.set(false);
    }
  }
}
