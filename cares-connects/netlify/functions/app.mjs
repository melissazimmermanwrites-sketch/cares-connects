/**
 * Netlify Function that runs the whole Express server (server-side rendering + /api) from the
 * Angular build. Static files (JS, CSS, images, the chat brain) are served by Netlify's CDN;
 * netlify.toml sends every other request here.
 *
 * The build output is shipped via `included_files` and loaded at runtime rather than bundled,
 * because Angular's server build loads its own chunks lazily. It's loaded on the first request
 * (no top-level await: Netlify's bundler wraps functions as CommonJS).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import serverless from 'serverless-http';

const SERVER = 'dist/cares-connects/server/server.mjs';

let ready;
function load() {
  ready ??= (async () => {
    const roots = [process.env.LAMBDA_TASK_ROOT, process.cwd(), join(__dirname, '../..')];
    const root = roots.find((r) => r && existsSync(join(r, SERVER)));
    if (!root) throw new Error(`Angular server build not found (looked for ${SERVER} under ${roots.join(', ')})`);
    const { app } = await import(pathToFileURL(join(root, SERVER)).href);
    return serverless(app, {
      // Downloads and images must stay binary through the function.
      binary: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/*', 'application/octet-stream'],
    });
  })();
  return ready;
}

export const handler = async (event, context) => (await load())(event, context);
