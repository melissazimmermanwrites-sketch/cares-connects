import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import type { CategoryInput, CategorySummary } from '../../../shared/api-types';

interface Draft extends CategoryInput {
  id: number | null;
}

@Component({
  selector: 'app-categories',
  imports: [FormsModule, NgTemplateOutlet, RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule],
  templateUrl: './categories.html',
  styleUrl: './categories.scss',
})
export class Categories {
  private readonly api = inject(Api);
  private readonly snackBar = inject(MatSnackBar);

  readonly list = rxResource({ stream: () => this.api.adminCategories() });
  /** The row being edited, or a new category when id is null. */
  readonly draft = signal<Draft | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  startNew(): void {
    const last = this.list.value()?.at(-1);
    this.error.set(null);
    this.draft.set({ id: null, name: '', description: null, sortOrder: (last?.sortOrder ?? 0) + 1 });
  }

  edit(c: CategorySummary): void {
    this.error.set(null);
    this.draft.set({ id: c.id, name: c.name, description: c.description, sortOrder: c.sortOrder });
  }

  update(changes: Partial<Draft>): void {
    this.draft.update((d) => (d ? { ...d, ...changes } : d));
  }

  async save(): Promise<void> {
    const d = this.draft();
    if (!d || !d.name.trim()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const input: CategoryInput = {
        name: d.name.trim(),
        description: d.description?.trim() || null,
        sortOrder: Number(d.sortOrder) || 0,
      };
      await firstValueFrom(d.id ? this.api.updateCategory(d.id, input) : this.api.createCategory(input));
      this.snackBar.open(`Saved “${input.name}”`, 'OK', { duration: 3000, verticalPosition: 'top' });
      this.draft.set(null);
      this.list.reload();
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  async remove(c: CategorySummary): Promise<void> {
    if (!confirm(`Delete the “${c.name}” category?`)) return;
    try {
      await firstValueFrom(this.api.deleteCategory(c.id));
      this.list.reload();
    } catch (err) {
      this.snackBar.open(errorMessage(err), 'OK', { duration: 5000, verticalPosition: 'top' });
    }
  }
}
