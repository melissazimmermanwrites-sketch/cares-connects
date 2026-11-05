# CARES Connects: hand-off runbook

**For Claude (or whoever is setting this up for Mel).** This file walks you through moving
CARES Connects onto Mel's own accounts. Work through it top to bottom, check each step before
moving on, and ask Mel whenever a step needs her (signing up, logging in, choosing passwords,
DNS). **When everything at the end is checked off, delete this file** (see the last section).

Never type Mel's passwords or tokens into chat or commit them. Tokens go into the host's and
GitHub's secret settings only.

---

## 0. What this is

- `cares-connects/`: Angular 22 app with server rendering. One Node/Express server serves:
  - the public site (home, find help, categories, listings, the "Find help" chat widget)
  - the admin portal at `/admin` (resources, IRS **Discover** queue, categories, exports)
  - the JSON API at `/api`
- **Database:** Turso (hosted SQLite/libSQL) in production, a local file in development. Schema
  changes are migrations in `cares-connects/drizzle/`.
- **Chat brain:** a small model trained only on CARES content. It runs **in the visitor's
  browser** from static files in `cares-connects/public/brain/`. There's no model server and no
  GPU needed in production.
- **Weekly IRS import:** a GitHub Action (`.github/workflows/discover.yml`) that adds newly
  registered California 501(c)(3)s to the admin's Discover queue.

Requirements: Node 24 (`cares-connects/.nvmrc`), npm, the Turso CLI, the GitHub CLI (`gh`).

All commands below run from `cares-connects/` unless noted.

```bash
cd cares-connects
nvm use          # Node 24
npm ci
```

---

## 1. Database (Turso)

Mel needs a Turso account (`turso auth signup`, or `turso auth login` if she has one; she does
this interactively).

**Pick ONE of these**, depending on where the demo data lives:

### A. Fresh start (recommended if nobody edited listings in a demo yet)

```bash
turso db create cares-connects
turso db show cares-connects --url               # → libsql://cares-connects-<org>.turso.io
turso db tokens create cares-connects            # → long token; keep it secret

export DATABASE_URL="libsql://cares-connects-<org>.turso.io"
export DATABASE_AUTH_TOKEN="<token>"
npm run db:migrate     # creates tables + the 58 California counties
npm run db:seed        # loads Mel's original directory (501 listings, 33 categories)
npm run discover       # first IRS import, about 10 seconds
```

`db:seed` refuses to run on a database that already has listings. Only use `--force` on a
brand-new database, because it wipes all listings.

### B. Keep the demo's data (listings were edited during the demo)

- If the demo database lives in a separate Turso **organization** that Mel was invited to, she
  can simply stay in it. Nothing moves.
- Otherwise, move it into Mel's org. Mel adds Jason to her org first, then Jason runs:
  `turso org db-transfer <database-name> <mel-org-name>`
- Or copy from a local SQLite file: `turso db create cares-connects --from-file <file.db>`

After a transfer, **the URL and tokens change**. Run `turso db show … --url` and
`turso db tokens create …` again inside Mel's org and use those values below.
Then run `npm run db:migrate` once (it's safe to repeat).

---

## 2. Admin logins

```bash
npm run admin:create -- <mel's email> "Mel"
```

It prompts for a password (hidden, 10+ characters). **Mel types it herself.** Run the same command
for anyone else who needs access. Running it for an existing email resets that password and
signs that person out everywhere.

Remove demo/developer admins from Mel's database once she can sign in. Ask Mel which emails to
remove first, then:

```bash
turso db shell cares-connects "DELETE FROM sessions WHERE admin_id IN (SELECT id FROM admins WHERE email = '<email>'); DELETE FROM admins WHERE email = '<email>';"
```

---

## 3. Deploy the app (Netlify)

> **Moving to Cloudflare Workers:** follow `CLOUDFLARE.md` instead of this section. The Netlify
> setup below stays valid until that move is finished.

The app is set up for Netlify: the CDN serves static files (including the chat brain) and one
Netlify Function (`cares-connects/netlify/functions/app.mjs`) runs the Express server for
page rendering and `/api`. Config is `cares-connects/netlify.toml`.

**Deploy from a local build. Don't connect Netlify's Git builds or its Angular plugin.**
Netlify's Angular plugin would swap our `server.ts` for an edge version that can't run the API.

```bash
cd cares-connects
netlify login                                   # Mel logs in
netlify sites:create --name <site-name>         # creates and links the site
# environment variables: see table below
npm ci && npm run build
netlify deploy --prod --no-build
```

**Environment variables.** Set each with `--context production` and **no `--scope` flag**
(with `--scope`, the CLI reports success but saves nothing). The token goes in as a secret:

```bash
netlify env:set DATABASE_URL "libsql://cares-connects-<org>.turso.io" --context production
netlify env:set DATABASE_AUTH_TOKEN "<token>" --secret --context production
netlify env:set NG_ALLOWED_HOSTS "caresconnects.org,www.caresconnects.org,<site-name>.netlify.app" --context production
netlify env:set SITE_URL "https://caresconnects.org" --context production
netlify env:set NODE_ENV production --context production
```

Check them with `netlify env:get <NAME> --context production`. Functions read environment
variables at deploy time, so **redeploy after changing any of them**.

| Variable | Purpose |
|---|---|
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | Turso database |
| `NG_ALLOWED_HOSTS` | every hostname the site answers on; Angular returns 400 for anything else |
| `SITE_URL` | used in the sitemap |
| `NODE_ENV=production` | login cookies become HTTPS-only |
| `NOINDEX=true` | **test sites only**: keeps the site out of search results. Don't set it on the real site. |
| `GITHUB_DISPATCH_TOKEN`, `GITHUB_REPOSITORY` | optional: lets the admin's "Check the IRS now" button start the GitHub Action (a fine-grained token with Actions read/write on this repo; repository as `owner/name`). Without them, the button explains where to run it. |

Why the IRS button works this way: a full import against Turso takes about 30–40 seconds,
longer than a Netlify function may run, so on Netlify the import always runs in GitHub Actions.

**If the domain is not caresconnects.org**, also change `SITE_URL` in
`src/app/public/site-content.ts` (canonical links and share previews), regenerate the share
image with `npm run make:images`, and commit.

**A Node host (Render, Railway, Fly.io) also works, unchanged:** build with
`npm ci --include=dev && npm run db:migrate && npm run build` and start with
`npm run serve:ssr:cares-connects`, using the same environment variables.

**A test copy is running** at `https://cares-connects-test.netlify.app` on Jason's Netlify and
Turso (`NOINDEX=true`). Once Mel's site is live, ask Jason to delete that Netlify project and,
if the data was copied rather than transferred, the test Turso database.

---

## 4. Weekly IRS import (GitHub Actions)

The workflow is `.github/workflows/discover.yml` at the repo root. It runs Mondays 15:00 UTC and
can be started manually from the Actions tab. Give it the database credentials (from the repo
root):

```bash
gh secret set DATABASE_URL         # paste when prompted
gh secret set DATABASE_AUTH_TOKEN  # paste when prompted
gh workflow run "IRS discovery"    # one manual run to confirm
gh run watch
```

The first run on a fresh database only queues orgs registered in the last 12 months, so the
queue starts manageable. Later runs queue only what's new since the previous run.

---

## 5. Point the domain

Only after Mel has seen the new site working on the host's temporary URL:

1. Add the custom domain in the host's dashboard.
2. Update DNS where caresconnects.org is registered (Mel logs in; the host shows the records).
3. Wait for HTTPS to be issued, then visit `https://caresconnects.org`.

**Before switching DNS, read "Known gaps" below.** Some links still point at pages on the
current caresconnects.org site.

---

## 6. Check everything

- [ ] Home page, `/find`, a category page and a listing page load
- [ ] The "Find help" chat: ZIP → need → results; typing "is this free?" gets an answer;
      typing a crisis phrase shows 911/988
- [ ] `/admin` sign-in works with Mel's account; editing a listing shows up on the public site
- [ ] Discover page shows the IRS queue; "Review & add" publishes a listing
- [ ] Export → Google Sheets workbook downloads
- [ ] `https://<domain>/robots.txt` and `/sitemap.xml` load
- [ ] GitHub Actions: the "IRS discovery" run is green

---

## Known gaps (tell Mel)

- **About, Contact, Donate, Blog, the "Get the report" button and the "List your organization"
  form** link to the current caresconnects.org pages and a Google Form
  (`src/app/public/site-content.ts`, `LINKS`). Once caresconnects.org points at this app, those
  pages won't exist here. Either build them, move them to another address and update `LINKS`,
  or keep the old site on a subdomain.
- **Logo and photos** are placeholders until real images are added to `public/` and set in
  `IMAGES` in the same file.
- Home page copy still says "Placer & Sacramento" in places. Update it when listings go
  statewide.
- Listing contact names, emails and phones from Mel's sheet are in `data/seed/directory.json`.
  **Keep this repository private.**

---

## Ongoing care

- **Categories or FAQ changed?** Retrain the chat brain (steps in `cares-connects/brain/README.md`: `facts.py` →
  `corpus.py` → `train.py` → `eval.py` → `export_web.py`, using any PyTorch machine with a GPU),
  then commit the new `public/brain/` files. The brain only ever states facts written in
  `brain/facts.py`; don't add anything there that isn't confirmed.
- **Schema changes:** edit `src/server/db/schema.ts` → `npm run db:generate` → commit the new
  migration. The deploy runs `db:migrate`.
- **Narrowing the IRS queue:** edit `src/server/discovery/ntee.ts`.

---

## Last step: delete this file

When every box in section 6 is checked and Mel is signed in on her own accounts:

```bash
git rm HANDOFF.md
git commit -m "Hand-off complete"
git push
```
