import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // The admin portal is behind a login and doesn't need SEO, so it renders in the browser only.
  { path: 'admin/**', renderMode: RenderMode.Client },
  { path: 'admin', renderMode: RenderMode.Client },
  // Public pages render on the server per request so edits show up immediately and Google can read them.
  { path: '**', renderMode: RenderMode.Server },
];
