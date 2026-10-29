import { Component, inject, signal } from '@angular/core';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { Auth } from '../../core/auth';

const passwordsMatch = (group: AbstractControl) =>
  group.get('newPassword')?.value === group.get('confirm')?.value ? null : { mismatch: true };

@Component({
  selector: 'app-account',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './account.html',
  styleUrl: './account.scss',
})
export class Account {
  private readonly api = inject(Api);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly auth = inject(Auth);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = inject(NonNullableFormBuilder).group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(10)]],
      confirm: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  async submit(): Promise<void> {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const { currentPassword, newPassword } = this.form.getRawValue();
      await firstValueFrom(this.api.changePassword(currentPassword, newPassword));
      this.form.reset();
      this.snackBar.open('Password changed. Other devices were signed out.', 'OK', { duration: 4000, verticalPosition: 'top' });
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
