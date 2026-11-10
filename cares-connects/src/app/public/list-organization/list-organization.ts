import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { afterNextRender, Component, ElementRef, inject, OnDestroy, PLATFORM_ID, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  APPLICATION_METHODS,
  ELIGIBILITY_BASES,
  FEE_OPTIONS,
  OUTREACH_CHANNELS,
  SERVICE_LENGTHS,
  WAIT_TIMES,
  type SubmissionInput,
} from '../../../shared/submissions';
import { Api, errorMessage } from '../../core/api';
import { Seo } from '../../core/seo';

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(id?: string): void;
  remove(id: string): void;
}

/** Public "List your organization" form. Submissions wait in the admin review queue. */
@Component({
  selector: 'app-list-organization',
  imports: [ReactiveFormsModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule],
  templateUrl: './list-organization.html',
  styleUrl: './list-organization.scss',
})
export class ListOrganization implements OnDestroy {
  private readonly api = inject(Api);
  private readonly seo = inject(Seo);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly categories = rxResource({ stream: () => this.api.categories() });
  readonly counties = rxResource({ stream: () => this.api.counties() });

  readonly options = {
    applicationMethods: APPLICATION_METHODS,
    eligibility: ELIGIBILITY_BASES,
    outreach: OUTREACH_CHANNELS,
    fees: FEE_OPTIONS,
    waitTime: WAIT_TIMES,
    serviceLength: SERVICE_LENGTHS,
  };

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    website: ['', [Validators.required, Validators.maxLength(500)]],
    phone: ['', [Validators.required, Validators.maxLength(40)]],
    address: ['', Validators.maxLength(300)],
    ein: ['', Validators.pattern(/^\d{2}-?\d{7}$/)],
    contactName: ['', [Validators.required, Validators.maxLength(200)]],
    contactEmail: ['', [Validators.required, Validators.email, Validators.maxLength(200)]],
    mission: ['', Validators.maxLength(2000)],
    services: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(4000)]],
    statewide: [false],
    countyIds: this.fb.control<number[]>([]),
    categoryIds: this.fb.control<number[]>([], Validators.required),
    applicationMethods: this.fb.control<string[]>([]),
    eligibility: this.fb.control<string[]>([]),
    outreach: this.fb.control<string[]>([]),
    fees: this.fb.control<string | null>(null),
    waitTime: this.fb.control<string | null>(null),
    serviceLength: this.fb.control<string[]>([]),
    authorized: [false, Validators.requiredTrue],
    faxExtension: [''],
  });

  readonly sending = signal(false);
  readonly error = signal<string | null>(null);
  readonly unavailable = signal(false);
  readonly turnstileOn = signal(false);

  private readonly turnstileHost = viewChild<ElementRef<HTMLElement>>('turnstile');
  private token = '';
  private turnstileId: string | null = null;
  private turnstileResponse: string | null = null;

  constructor() {
    this.seo.update({
      title: 'List your organization · CARES Connects',
      description: 'Add your nonprofit or public agency to the free CARES Connects directory. We review every submission before it goes live.',
      path: '/list-your-organization',
    });
    // Browser only: a token issued while rendering on the server would start its clock too early.
    afterNextRender(() => void this.loadConfig());
  }

  ngOnDestroy(): void {
    if (this.turnstileId) this.turnstile()?.remove(this.turnstileId);
  }

  private turnstile(): TurnstileApi | undefined {
    return (this.document.defaultView as unknown as { turnstile?: TurnstileApi } | null)?.turnstile;
  }

  private async loadConfig(): Promise<void> {
    if (!this.isBrowser) return;
    try {
      const config = await firstValueFrom(this.api.submissionConfig());
      this.token = config.token;
      if (config.turnstileSiteKey) await this.showTurnstile(config.turnstileSiteKey);
      this.unavailable.set(false);
    } catch {
      this.unavailable.set(true);
    }
  }

  private async showTurnstile(siteKey: string): Promise<void> {
    this.turnstileOn.set(true);
    if (this.turnstileId) {
      this.turnstile()?.reset(this.turnstileId);
      this.turnstileResponse = null;
      return;
    }
    if (!this.turnstile()) {
      await new Promise<void>((resolve, reject) => {
        const script = this.document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Could not load the check'));
        this.document.head.appendChild(script);
      });
    }
    // The host element appears once turnstileOn is rendered.
    await new Promise((resolve) => setTimeout(resolve));
    const host = this.turnstileHost()?.nativeElement;
    if (!host) return;
    this.turnstileId =
      this.turnstile()?.render(host, {
        sitekey: siteKey,
        callback: (response: string) => (this.turnstileResponse = response),
        'expired-callback': () => (this.turnstileResponse = null),
      }) ?? null;
  }

  toggle(controlName: 'applicationMethods' | 'eligibility' | 'outreach' | 'serviceLength', value: string, on: boolean): void {
    const control = this.form.controls[controlName];
    control.setValue(on ? [...control.value, value] : control.value.filter((v) => v !== value));
  }

  async submit(): Promise<void> {
    if (this.sending()) return;
    this.error.set(null);
    const v = this.form.getRawValue();
    if (this.form.invalid || (!v.statewide && !v.countyIds.length)) {
      this.form.markAllAsTouched();
      this.error.set(
        !this.form.invalid ? 'Pick at least one county, or choose statewide.' : 'Please fix the highlighted fields.',
      );
      return;
    }
    const blank = (s: string) => s.trim() || null;
    const input: SubmissionInput = {
      name: v.name,
      website: v.website,
      phone: v.phone,
      address: blank(v.address),
      ein: blank(v.ein),
      contactName: v.contactName,
      contactEmail: v.contactEmail.trim(),
      mission: blank(v.mission),
      services: v.services,
      statewide: v.statewide,
      countyIds: v.statewide ? [] : v.countyIds,
      categoryIds: v.categoryIds,
      answers: {
        applicationMethods: v.applicationMethods,
        eligibility: v.eligibility,
        outreach: v.outreach,
        fees: v.fees,
        waitTime: v.waitTime,
        serviceLength: v.serviceLength,
      },
      authorized: true,
      token: this.token,
      turnstile: this.turnstileResponse,
      faxExtension: v.faxExtension,
    };
    this.sending.set(true);
    try {
      await firstValueFrom(this.api.submitListing(input));
      await this.router.navigate(['/list-your-organization/thanks'], { state: { email: input.contactEmail } });
    } catch (err) {
      this.error.set(errorMessage(err));
      // An expired or used form gets a fresh token, so sending again just works.
      if (err instanceof HttpErrorResponse && err.error?.code === 'token') await this.loadConfig();
    } finally {
      this.sending.set(false);
    }
  }
}
