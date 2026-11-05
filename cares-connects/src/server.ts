import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { api } from './server/api';
import { securityHeaders, siteFiles } from './server/site';

// import.meta.dirname is undefined on Cloudflare Workers, where Cloudflare serves these files itself.
const browserDistFolder = join(import.meta.dirname ?? '.', '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(siteFiles);

/**
 * JSON API for the public directory and the admin portal. See src/server/api.ts.
 */
app.use('/api', api);

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);

/** The Express app itself, for serverless wrappers (cloudflare/worker.mjs, netlify/functions/app.mjs). */
export { app };
