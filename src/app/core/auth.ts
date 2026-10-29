import { HttpClient, HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { catchError, firstValueFrom, throwError } from 'rxjs';
import type { SessionUser } from '../../shared/api-types';

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly http = inject(HttpClient);
  private loaded: Promise<SessionUser | null> | null = null;

  readonly user = signal<SessionUser | null>(null);

  /** Asks the server who is signed in (once per page load). */
  ensureLoaded(): Promise<SessionUser | null> {
    this.loaded ??= firstValueFrom(this.http.get<SessionUser | null>('/api/auth/me')).then(
      (user) => {
        this.user.set(user);
        return user;
      },
      () => null,
    );
    return this.loaded;
  }

  async login(email: string, password: string): Promise<void> {
    const user = await firstValueFrom(this.http.post<SessionUser>('/api/auth/login', { email, password }));
    this.user.set(user);
    this.loaded = Promise.resolve(user);
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/logout', {}));
    this.clear();
  }

  clear(): void {
    this.user.set(null);
    this.loaded = Promise.resolve(null);
  }
}

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  return (await auth.ensureLoaded())
    ? true
    : router.createUrlTree(['/admin/login'], { queryParams: { returnUrl: state.url } });
};

/** If an admin call comes back 401 (session expired), send the user to the login page. */
export const sessionExpiredInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const router = inject(Router);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && req.url.startsWith('/api/admin')) {
        auth.clear();
        router.navigate(['/admin/login'], { queryParams: { returnUrl: router.url } });
      }
      return throwError(() => err);
    }),
  );
};
