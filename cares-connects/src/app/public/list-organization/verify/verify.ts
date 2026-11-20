import { afterNextRender, Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { VerificationState } from '../../../../shared/submissions';
import { Api, errorMessage } from '../../../core/api';
import { Seo } from '../../../core/seo';

/**
 * Where the verification email leads. Opening it changes nothing, because mail scanners open every
 * link in a message; only pressing a button counts as an answer.
 */
@Component({
  selector: 'app-listing-verify',
  imports: [RouterLink, MatIconModule, MatProgressBarModule],
  templateUrl: './verify.html',
  styleUrl: './verify.scss',
})
export class ListingVerify {
  private readonly api = inject(Api);
  private readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '';

  readonly state = signal<VerificationState | null>(null);
  readonly sending = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    inject(Seo).update({
      title: 'Confirm your request · CARES Connects',
      description: 'Confirm your request to list your organization.',
      path: '/list-your-organization/verify',
      noindex: true,
    });
    // Browser only, so the token isn't sent through server rendering.
    afterNextRender(() => void this.load());
  }

  private async load(): Promise<void> {
    if (!this.token) {
      this.state.set({ state: 'invalid', orgName: null });
      return;
    }
    try {
      this.state.set(await firstValueFrom(this.api.verificationState(this.token)));
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }

  async answer(answer: 'verified' | 'declined'): Promise<void> {
    this.sending.set(true);
    this.error.set(null);
    try {
      this.state.set(await firstValueFrom(this.api.answerVerification(this.token, answer)));
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.sending.set(false);
    }
  }
}
