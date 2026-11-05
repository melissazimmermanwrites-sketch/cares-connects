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

export default {
  /**
   * Express trusts one proxy hop (app.set('trust proxy', 1)). Tell it who the visitor is and that
   * the connection was HTTPS, so login rate limits are per visitor and HSTS is sent.
   */
  fetch(request, env, ctx) {
    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') ?? '');
    headers.set('X-Forwarded-Proto', new URL(request.url).protocol.replace(':', ''));
    return server.fetch(new Request(request, { headers }), env, ctx);
  },
};
