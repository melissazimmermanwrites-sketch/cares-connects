import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  AdminResource,
  AdminResourceQuery,
  AdminResourceRow,
  AdminStats,
  CategoryInput,
  CategorySummary,
  CountySummary,
  DiscoveryQuery,
  DiscoveryRow,
  DiscoveryStatus,
  DiscoverySummary,
  Page,
  PublicResource,
  LocateResult,
  ResourceInput,
} from '../../shared/api-types';
import type {
  SubmissionFormConfig,
  SubmissionInput,
  SubmissionRow,
  SubmissionStatus,
  SubmissionSummary,
  VerificationState,
} from '../../shared/submissions';
import type { ContactInput, ContactMessageRow, ContactStatus, ContactSummary } from '../../shared/contact';
import type { AdminPost, AdminPostRow, PostInput, PostSummary, PublicPost } from '../../shared/blog';

/** Turns an API error into a sentence safe to show the user. */
export function errorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Could not reach the server. Check your connection and try again.';
    return err.error?.error ?? `Request failed (${err.status}).`;
  }
  return 'Something went wrong.';
}

function toParams(query: object): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '' && value !== false) params = params.set(key, String(value));
  }
  return params;
}

@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  // Public
  categories() {
    return this.http.get<CategorySummary[]>('/api/categories');
  }
  resources(query: { q?: string; county?: string; category?: string }) {
    return this.http.get<PublicResource[]>('/api/resources', { params: toParams(query) });
  }
  directory(query: { page: number; county?: string }) {
    return this.http.get<Page<PublicResource>>('/api/resources/directory', { params: toParams(query) });
  }
  resource(id: number) {
    return this.http.get<PublicResource>(`/api/resources/${id}`);
  }
  counties() {
    return this.http.get<CountySummary[]>('/api/counties');
  }
  locate(q: string) {
    return this.http.get<LocateResult>('/api/locate', { params: toParams({ q }) });
  }

  // Admin
  stats() {
    return this.http.get<AdminStats>('/api/admin/stats');
  }
  adminResources(query: AdminResourceQuery) {
    return this.http.get<Page<AdminResourceRow>>('/api/admin/resources', { params: toParams(query) });
  }
  adminResource(id: number) {
    return this.http.get<AdminResource>(`/api/admin/resources/${id}`);
  }
  createResource(input: ResourceInput) {
    return this.http.post<AdminResource>('/api/admin/resources', input);
  }
  updateResource(id: number, input: ResourceInput) {
    return this.http.put<AdminResource>(`/api/admin/resources/${id}`, input);
  }
  adminCategories() {
    return this.http.get<CategorySummary[]>('/api/admin/categories');
  }
  createCategory(input: CategoryInput) {
    return this.http.post<CategorySummary>('/api/admin/categories', input);
  }
  updateCategory(id: number, input: CategoryInput) {
    return this.http.put<CategorySummary>(`/api/admin/categories/${id}`, input);
  }
  deleteCategory(id: number) {
    return this.http.delete<{ ok: true }>(`/api/admin/categories/${id}`);
  }
  adminCounties() {
    return this.http.get<CountySummary[]>('/api/admin/counties');
  }

  // List your organization
  submissionConfig() {
    return this.http.get<SubmissionFormConfig>('/api/submissions/token');
  }
  submitListing(input: SubmissionInput) {
    return this.http.post<{ message: string }>('/api/submissions', input);
  }
  submissionSummary() {
    return this.http.get<SubmissionSummary>('/api/admin/submissions/summary');
  }
  submissions(query: { status: string; page: number }) {
    return this.http.get<Page<SubmissionRow>>('/api/admin/submissions', { params: toParams(query) });
  }
  submission(id: number) {
    return this.http.get<SubmissionRow>(`/api/admin/submissions/${id}`);
  }
  checkSubmission(id: number) {
    return this.http.post<SubmissionRow>(`/api/admin/submissions/${id}/check`, {});
  }
  resendVerification(id: number) {
    return this.http.post<SubmissionRow>(`/api/admin/submissions/${id}/resend-verification`, {});
  }
  verificationState(token: string) {
    return this.http.get<VerificationState>('/api/submissions/verify', { params: { token } });
  }
  answerVerification(token: string, answer: 'verified' | 'declined') {
    return this.http.post<VerificationState>('/api/submissions/verify', { token, answer });
  }
  setSubmissionStatus(id: number, status: SubmissionStatus, resourceId?: number) {
    return this.http.post<SubmissionRow>(`/api/admin/submissions/${id}/status`, { status, resourceId });
  }
  // Contact form
  contactToken() {
    return this.http.get<{ token: string }>('/api/contact/token');
  }
  sendContactMessage(input: ContactInput) {
    return this.http.post<{ ok: boolean }>('/api/contact', input);
  }
  contactSummary() {
    return this.http.get<ContactSummary>('/api/admin/messages/summary');
  }
  contactMessages(query: { status: string; page: number }) {
    return this.http.get<Page<ContactMessageRow>>('/api/admin/messages', { params: toParams(query) });
  }
  setContactStatus(id: number, status: ContactStatus) {
    return this.http.post<ContactMessageRow>(`/api/admin/messages/${id}/status`, { status });
  }
  // Blog
  posts(page: number) {
    return this.http.get<Page<PostSummary>>('/api/posts', { params: toParams({ page }) });
  }
  post(slug: string) {
    return this.http.get<PublicPost>(`/api/posts/${encodeURIComponent(slug)}`);
  }
  adminPosts(query: { status: string; q: string; page: number }) {
    return this.http.get<Page<AdminPostRow>>('/api/admin/posts', { params: toParams(query) });
  }
  adminPost(id: number) {
    return this.http.get<AdminPost>(`/api/admin/posts/${id}`);
  }
  createPost(input: PostInput) {
    return this.http.post<AdminPost>('/api/admin/posts', input);
  }
  updatePost(id: number, input: PostInput) {
    return this.http.put<AdminPost>(`/api/admin/posts/${id}`, input);
  }
  deletePost(id: number) {
    return this.http.delete<{ ok: boolean }>(`/api/admin/posts/${id}`);
  }
  previewPost(body: string) {
    return this.http.post<{ html: string }>('/api/admin/posts/preview', { body });
  }
  uploadMedia(file: File) {
    return this.http.post<{ url: string }>('/api/admin/media', file, { headers: { 'Content-Type': 'application/octet-stream' } });
  }

  // IRS discovery
  discoverySummary() {
    return this.http.get<DiscoverySummary>('/api/admin/discovery/summary');
  }
  discoveries(query: DiscoveryQuery) {
    return this.http.get<Page<DiscoveryRow>>('/api/admin/discovery', { params: toParams(query) });
  }
  discovery(ein: string) {
    return this.http.get<DiscoveryRow>(`/api/admin/discovery/${encodeURIComponent(ein)}`);
  }
  setDiscoveryStatus(ein: string, status: Exclude<DiscoveryStatus, 'approved'>) {
    return this.http.post<DiscoveryRow>(`/api/admin/discovery/${encodeURIComponent(ein)}/status`, { status });
  }
  runDiscovery() {
    return this.http.post<{ runId: number | null; message?: string }>('/api/admin/discovery/run', {});
  }

  tagSuggestions(q: string) {
    return this.http.get<string[]>('/api/admin/tags', { params: toParams({ q }) });
  }
  changePassword(currentPassword: string, newPassword: string) {
    return this.http.post<{ ok: true }>('/api/admin/password', { currentPassword, newPassword });
  }
}
