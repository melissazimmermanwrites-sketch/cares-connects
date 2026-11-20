/**
 * Cloudflare Worker that runs the whole Express server (server-side rendering + /api) from the
 * Angular build. Static files (JS, CSS, images, the chat brain) are served by Cloudflare's CDN
 * straight from dist/cares-connects/browser; only requests that don't match a file reach here.
 *
 * Environment variables and secrets set in Cloudflare show up in process.env (nodejs_compat),
 * so the server code reads them exactly as it does on Node.
 */
import { httpServerHandler } from 'cloudflare:node';
import { app } from '../dist/cares-connects/server/server.mjs';

const PORT = 8787;
app.listen(PORT);

const server = httpServerHandler({ port: PORT });

/**
 * While rendering a page, Angular calls this site's own /api over HTTP (e.g. GET
 * https://caresconnects.org/api/posts/slug). Cloudflare won't let a Worker fetch its own custom
 * domain (it answers 522), so those calls are answered in-process by the same Express app instead.
 */
let workerEnv;
let ownHosts = new Set();
const networkFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (workerEnv && ownHosts.has(url.hostname) && url.pathname.startsWith('/api/')) {
    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-Proto', 'https');
    return server.fetch(new Request(request, { headers }), workerEnv);
  }
  return networkFetch(request);
};

export default {
  /**
   * Express trusts one proxy hop (app.set('trust proxy', 1)). Tell it who the visitor is and that
   * the connection was HTTPS, so login rate limits are per visitor and HSTS is sent.
   */
  fetch(request, env, ctx) {
    if (!workerEnv) {
      workerEnv = env;
      ownHosts = new Set(String(env.NG_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean));
    }
    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') ?? '');
    headers.set('X-Forwarded-Proto', new URL(request.url).protocol.replace(':', ''));
    return server.fetch(new Request(request, { headers }), env, ctx);
  },
};
