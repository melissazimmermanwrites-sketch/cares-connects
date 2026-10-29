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
