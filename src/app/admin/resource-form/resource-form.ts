import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule, type MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatChipInputEvent, MatChipsModule } from '@angular/material/chips';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import {
  type AdminResource,
  type DiscoveryRow,
  type ResourceInput,
  type VerificationStatus,
} from '../../../shared/api-types';

@Component({
  selector: 'app-resource-form',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatAutocompleteModule,
    MatButtonModule,
    MatChipsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSnackBarModule,
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './resource-form.html',
  styleUrl: './resource-form.scss',
})
export class ResourceForm {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Route param; undefined on /admin/resources/new. */
  readonly id = input<string>();
  readonly isNew = computed(() => !this.id());
  /** Query param set when adding an org from the IRS discovery queue. */
  readonly fromEin = input<string>();

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    statewide: [false],
    countyIds: this.fb.control<number[]>([]),
    ein: ['', Validators.pattern(/^\d{9}$/)],
    categoryIds: this.fb.control<number[]>([], Validators.required),
    isActive: [true],
    verificationStatus: this.fb.control<VerificationStatus>('needs_verification'),
    verifiedAt: this.fb.control<Date | null>(null),
    phone: [''],
    website: [''],
    address: [''],
    mission: [''],
    services: [''],
    notes: [''],
    contactPerson: [''],
    contactPhone: [''],
    contactEmail: ['', Validators.email],
    duplicateGroup: this.fb.control<string | null>(null),
    tags: this.fb.control<string[]>([]),
  });

  readonly existing = rxResource({
    params: () => (this.id() ? Number(this.id()) : undefined),
    stream: ({ params }) => (params ? this.api.adminResource(params) : of(undefined)),
  });
  readonly categories = rxResource({ stream: () => this.api.adminCategories() });
  readonly counties = rxResource({ stream: () => this.api.adminCounties() });
  readonly discovery = rxResource({
    params: () => (this.isNew() ? this.fromEin() : undefined),
    stream: ({ params }) => (params ? this.api.discovery(params) : of(undefined)),
  });
  /** Web search to find the phone number and website the IRS file doesn't have. */
  readonly webSearchUrl = computed(() => {
    const d = this.discovery.value();
    return d ? `https://www.google.com/search?q=${encodeURIComponent(`${d.name} ${d.city ?? ''} CA`)}` : null;
  });

  readonly tagText = signal('');
  readonly tagSuggestions = rxResource({
    params: () => this.tagText().trim().toLowerCase(),
    stream: ({ params }) => this.api.tagSuggestions(params),
  });
  readonly tagOptions = computed(() => {
    const chosen = new Set(this.tags());
    return (this.tagSuggestions.value() ?? []).filter((t) => !chosen.has(t));
  });
  readonly tags = signal<string[]>([]);

  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  /** The saved record, used for the "last edited" line and the duplicates panel. */
  readonly record = signal<AdminResource | null>(null);

  constructor() {
    effect(() => {
      const r = this.existing.value();
      if (r) this.load(r);
    });
    effect(() => {
      const d = this.discovery.value();
      if (d) this.prefillFromDiscovery(d);
    });
    // Statewide listings don't need a county list.
    this.form.controls.statewide.valueChanges.pipe(takeUntilDestroyed()).subscribe((statewide) => {
      const counties = this.form.controls.countyIds;
      if (statewide) counties.disable({ emitEvent: false });
      else counties.enable({ emitEvent: false });
    });
  }

  private prefillFromDiscovery(d: DiscoveryRow): void {
    const address = [d.street, d.city].filter(Boolean).join(', ') + (d.zip ? `, CA ${d.zip.slice(0, 5)}` : '');
    this.form.patchValue({
      name: d.name,
      ein: d.ein,
      address,
      countyIds: d.county ? [d.county.id] : [],
      categoryIds: d.category ? [d.category.id] : [],
      verificationStatus: 'needs_verification',
      notes: `Found in IRS records (activity code ${d.ntee}${d.ruling ? `, registered ${d.ruling}` : ''}).`,
    });
    this.form.markAsDirty();
  }

  private load(r: AdminResource): void {
    this.record.set(r);
    this.form.reset({
      name: r.name,
      statewide: r.statewide,
      countyIds: r.countyIds,
      ein: r.ein ?? '',
      categoryIds: r.categoryIds,
      isActive: r.isActive,
      verificationStatus: r.verificationStatus,
      verifiedAt: r.verifiedAt ? new Date(r.verifiedAt) : null,
      phone: r.phone ?? '',
      website: r.website ?? '',
      address: r.address ?? '',
      mission: r.mission ?? '',
      services: r.services ?? '',
      notes: r.notes ?? '',
      contactPerson: r.contactPerson ?? '',
      contactPhone: r.contactPhone ?? '',
      contactEmail: r.contactEmail ?? '',
      duplicateGroup: r.duplicateGroup,
      tags: r.tags,
    });
    this.tags.set(r.tags);
  }

  markVerifiedToday(): void {
    this.form.patchValue({ verificationStatus: 'verified', verifiedAt: new Date() });
    this.form.markAsDirty();
  }

  clearDuplicateFlag(): void {
    this.form.patchValue({ duplicateGroup: null });
    this.form.markAsDirty();
  }

  addTag(event: MatChipInputEvent): void {
    for (const raw of event.value.split(',')) this.pushTag(raw);
    event.chipInput.clear();
    this.tagText.set('');
  }

  selectTag(event: MatAutocompleteSelectedEvent, inputEl: HTMLInputElement): void {
    this.pushTag(event.option.value);
    inputEl.value = '';
    this.tagText.set('');
  }

  removeTag(tag: string): void {
    this.setTags(this.tags().filter((t) => t !== tag));
  }

  private pushTag(raw: string): void {
    const tag = raw.trim().toLowerCase();
    if (tag && !this.tags().includes(tag)) this.setTags([...this.tags(), tag]);
  }

  private setTags(tags: string[]): void {
    this.tags.set(tags);
    this.form.controls.tags.setValue(tags);
    this.form.markAsDirty();
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.saveError.set('Please fix the highlighted fields.');
      return;
    }
    if (!this.form.controls.statewide.value && !this.form.controls.countyIds.value.length) {
      this.form.controls.countyIds.markAsTouched();
      this.saveError.set('Pick at least one county, or mark it statewide.');
      return;
    }
    const v = this.form.getRawValue();
    const blank = (s: string) => s.trim() || null;
    const input: ResourceInput = {
      name: v.name.trim(),
      statewide: v.statewide,
      countyIds: v.statewide ? [] : v.countyIds,
      ein: blank(v.ein),
      categoryIds: v.categoryIds,
      isActive: v.isActive,
      verificationStatus: v.verificationStatus,
      verifiedAt: v.verifiedAt ? v.verifiedAt.toISOString() : null,
      phone: blank(v.phone),
      website: blank(v.website),
      address: blank(v.address),
      mission: blank(v.mission),
      services: blank(v.services),
      notes: blank(v.notes),
      contactPerson: blank(v.contactPerson),
      contactPhone: blank(v.contactPhone),
      contactEmail: blank(v.contactEmail),
      duplicateGroup: v.duplicateGroup,
      tags: v.tags,
    };

    this.saving.set(true);
    this.saveError.set(null);
    try {
      const id = this.id();
      const saved = await firstValueFrom(id ? this.api.updateResource(Number(id), input) : this.api.createResource(input));
      this.load(saved);
      if (!id && this.fromEin()) {
        // Added from the IRS queue: it's published, so offer a quick way back to the next one.
        this.snackBar
          .open(`Published “${saved.name}”`, 'Back to Discover', { duration: 8000, verticalPosition: 'top' })
          .onAction()
          .subscribe(() => this.router.navigate(['/admin/discover']));
      } else {
        this.snackBar.open(`Saved “${saved.name}”`, 'OK', { duration: 3000, verticalPosition: 'top' });
      }
      if (!id) await this.router.navigate(['/admin/resources', saved.id], { replaceUrl: true });
    } catch (err) {
      this.saveError.set(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  /** Used by the route's canDeactivate guard. */
  canLeave(): boolean {
    return !this.form.dirty || confirm('You have unsaved changes. Leave without saving?');
  }
}
