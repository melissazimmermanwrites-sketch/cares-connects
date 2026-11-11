# Moving caresconnects.org from Netlify to Cloudflare

The app runs on **Cloudflare Workers**. Cloudflare's CDN serves the static files (including the
chat brain). One Worker (`cares-connects/cloudflare/worker.mjs`) runs the same Express server
that Netlify ran, for page rendering and `/api`. Config is `cares-connects/wrangler.jsonc`.
The database (Turso) and the weekly IRS import (GitHub Actions) don't change.

**Where each branch lives after this move:**

| Branch | Hosted on | Address |
|---|---|---|
| `main` | Cloudflare Workers (live site) | caresconnects.org |
| `Develop` | Netlify (development site) | caresconnects.netlify.app |

**Until step 6 is done, check what Netlify is publishing.** Netlify builds `Develop`, and
caresconnects.org still points at that Netlify site. If `Develop` is its production branch,
anything pushed to `Develop` goes live on the real domain, so hold those pushes until then.

The live Netlify site keeps working until step 6, so the site stays up during the move. Do the
steps in order. Commands run from `cares-connects/` unless noted.

Never paste the database token into chat or into a file. The commands below pipe it straight
from Turso into Cloudflare.

---

## 1. Cloudflare account and plan

1. Sign up at <https://dash.cloudflare.com/sign-up> (or log in).
2. Go to **Workers & Pages → Plans** and choose **Workers Paid ($5/month)**.
   The free plan allows only 10 ms of compute per request. Rendering a page and checking an
   admin password both take longer than that, so on the free plan pages and sign-in would fail.

## 2. Connect the CLI

```bash
cd cares-connects
npm ci
npx wrangler login        # opens the browser; approve access
npx wrangler whoami       # shows your account
```

## 3. Database settings (secrets)

```bash
turso db show cares-connects --url | tr -d "\n" | npx wrangler secret put DATABASE_URL
turso db tokens create cares-connects | tr -d "\n" | npx wrangler secret put DATABASE_AUTH_TOKEN
```

If wrangler asks whether to create a new Worker named `cares-connects`, answer **yes**.

The non-secret settings (`NODE_ENV`, `SITE_URL`, `NG_ALLOWED_HOSTS`) are in `wrangler.jsonc`
under `vars`. They deploy with the code, so you don't set them separately.

Optional, for the admin's "Check the IRS now" button (same as on Netlify):

```bash
npx wrangler secret put GITHUB_DISPATCH_TOKEN   # fine-grained token: Actions read/write on this repo
npx wrangler secret put GITHUB_REPOSITORY       # melissazimmermanwrites-sketch/cares-connects
```

## 4. First deploy and test on the temporary address

```bash
npm run cf:deploy
```

It prints an address like `https://cares-connects.<your-subdomain>.workers.dev`.

1. Add that hostname (without `https://`) to `NG_ALLOWED_HOSTS` in `wrangler.jsonc`.
   Until you do, that address returns "400 Bad Request". This is expected.
2. Run `npm run cf:deploy` again.
3. Open the workers.dev address and run the checklist in step 7. Everything should work except
   that canonical links point to caresconnects.org, which is correct.

To see live errors while you test: `npx wrangler tail`.

## 5. Move the domain's DNS to Cloudflare

**Status, 2026-11-06:** done. Public DNS shows Cloudflare's nameservers, with the `A` and `www`
records still pointing at Netlify. Skip to step 6 once step 4 passes.

caresconnects.org is registered at **GoDaddy**, and GoDaddy runs its DNS
(`ns31/ns32.domaincontrol.com`). Workers can only answer on a domain whose DNS is on Cloudflare.
The domain stays registered at GoDaddy; only the nameservers change.

1. In Cloudflare: **Add a domain** → `caresconnects.org` → **Free** plan → let it scan records.
2. Review the imported records. They should be:
   - `A caresconnects.org → 75.2.60.5` (Netlify)
   - `CNAME www → caresconnects.netlify.app` (Netlify)
   - `TXT caresconnects.org → google-site-verification=…` (**keep**: Google Search Console)
   - `TXT _dmarc → v=DMARC1; …` (**keep**)

   Set the two Netlify records to **DNS only** (grey cloud) for now, so Netlify keeps serving
   the site through the switch. There are no MX (email) records, so email isn't affected.
3. Cloudflare shows two nameservers (like `xxx.ns.cloudflare.com`). In GoDaddy:
   **My Products → caresconnects.org → DNS → Nameservers → Change → "I'll use my own
   nameservers"** and enter Cloudflare's two.
4. Wait until Cloudflare emails that the domain is **Active** (minutes to a few hours).
   The site is still served by Netlify during this time.

## 6. Point the domain at the Worker

**Status, 2026-11-06:** done. Both custom domains are attached through `routes` in
`wrangler.jsonc`, so `npx wrangler deploy` keeps them. `workers_dev: true` keeps the
workers.dev test address on.

In Cloudflare: **DNS → Records**, delete the Netlify `A` record for `caresconnects.org` and the
`www` CNAME. Then:

**Workers & Pages → cares-connects → Settings → Domains & Routes → Add → Custom domain**:
add `caresconnects.org`, then add `www.caresconnects.org`.

Cloudflare creates the DNS records and the HTTPS certificate itself, usually within a few
minutes. During those minutes the site may be unreachable, so do this at a quiet time.

## 7. Check everything (on https://caresconnects.org)

- [x] Home page, `/find`, a category page and a listing page load
- [ ] The "Find help" chat: ZIP → need → results; typing "is this free?" gets an answer;
      typing a crisis phrase shows 911/988
- [ ] `/admin` sign-in works; editing a listing shows up on the public site
- [ ] Discover page shows the IRS queue; "Review & add" publishes a listing
- [ ] Export → Google Sheets workbook downloads
- [x] `/robots.txt` and `/sitemap.xml` load
- [x] `www.caresconnects.org` loads too

## 8. Make Netlify the development site

**Status, 2026-11-10:** done. Netlify has no custom domains, builds `Develop` from
`cares-connects`, and uses the `cares-connects-dev` database. Both netlify.app checks print
`x-robots-tag: noindex, nofollow`, and caresconnects.org prints nothing. Cloudflare's
**Always Use HTTPS** is on, so `http://` redirects to `https://`.

Do this after step 7 passes. **Keep the Netlify project and its files** (`netlify.toml`,
`netlify/`, `serverless-http`), because `Develop` deploys from them.

1. In Netlify, under domain management, remove `caresconnects.org` and `www.caresconnects.org`.
2. Confirm the production branch is `Develop` and the base directory is `cares-connects`.
3. Give it its own database, so test edits can't change real listings. In `cares-connects/`:

   ```bash
   turso db create cares-connects-dev
   export DATABASE_URL="$(turso db show cares-connects-dev --url)"
   export DATABASE_AUTH_TOKEN="$(turso db tokens create cares-connects-dev)"
   echo "$DATABASE_URL"    # stop unless this name ends in -dev
   npm run db:setup
   npm run admin:create -- <email> "Dev admin"
   netlify env:set DATABASE_URL "$DATABASE_URL" --context production
   netlify env:set DATABASE_AUTH_TOKEN "$DATABASE_AUTH_TOKEN" --secret --context production
   unset DATABASE_URL DATABASE_AUTH_TOKEN
   ```

   Never run `db:seed -- --force` against the production database: it wipes and reseeds.

4. Set the rest of its settings. "production" here is Netlify's name for the `Develop` build:

   ```bash
   netlify env:set SITE_URL "https://caresconnects.netlify.app" --context production
   netlify env:set NG_ALLOWED_HOSTS "caresconnects.netlify.app" --context production
   ```

   Search engines are already kept off every `.netlify.app` address by `src/server/robots.ts`,
   so there's nothing to set. Don't set `NOINDEX` here or in `wrangler.jsonc`: on a deploy that
   serves caresconnects.org, it would take the real site out of Google.

5. Redeploy `Develop`, then check caresconnects.netlify.app loads and shows the development data.

6. **Check search settings on both sites. This step must pass:**

   ```bash
   curl -sI https://caresconnects.netlify.app/ | grep -i x-robots-tag
   curl -sI https://caresconnects.netlify.app/find | grep -i x-robots-tag
   curl -sI https://caresconnects.org/ | grep -i x-robots-tag
   ```

   The first two must each print `x-robots-tag: noindex, nofollow`. The third must print
   nothing, because the live site has to stay in Google. Don't add the development site to
   `robots.txt`: a crawler that is blocked from a page can't see its `noindex`.

**Before deploying the "List your organization" form:**

1. Apply the new tables to the production database with `npm run db:migrate`.
2. `npx wrangler secret put SUBMISSION_SECRET` with a long random value (`openssl rand -base64 32`).
   Without it, the form politely refuses submissions.
3. Required for verification emails: create a [Resend](https://resend.com) account, add
   caresconnects.org there and add the DNS records it shows in Cloudflare, then run
   `npx wrangler secret put RESEND_API_KEY`. Until then nothing reaches "To be sorted" by itself:
   requests wait in "Waiting on email", where an admin can move them along after confirming another way. `MAIL_FROM` in `vars` overrides the sender (default `verify@caresconnects.org`).
4. Recommended: create a Turnstile widget (Cloudflare dashboard → Turnstile) for caresconnects.org.
   Add `TURNSTILE_SITE_KEY` to `vars` in `wrangler.jsonc` and run
   `npx wrangler secret put TURNSTILE_SECRET_KEY`. The form works without these, with weaker bot protection.
5. Recommended: add a rate limiting rule (Security → WAF) on `POST /api/submissions`, so a flood is
   stopped before it reaches the Worker. The app's own limits still apply behind it.

**Before deploying the contact form:** apply the new tables with `npm run db:migrate`, then set
`SUBMISSION_SECRET` to a long random value (`openssl rand -base64 32`), using
`npx wrangler secret put SUBMISSION_SECRET` for Cloudflare and `netlify env:set` for Netlify. Without
it, the form refuses messages. Recommended: add a Cloudflare rate limiting rule on `POST /api/contact`.

**Before deploying the blog:** apply its tables with `npm run db:migrate`. Posts and images live in the
database, so publishing one doesn't need a deploy.

**Rolling back** before step 8: in Cloudflare DNS, remove the Worker custom domains and add back
`A caresconnects.org → 75.2.60.5` and `CNAME www → caresconnects.netlify.app` (DNS only). After
step 8, also add the domains back in Netlify and restore its production settings.

---

## Day to day

Merging to `main` doesn't update the live site by itself. Deploy from an up-to-date `main`:

| Task | Command (from `cares-connects/`) |
|---|---|
| Deploy `main` to the live site | `git checkout main && git pull`, then `npm run cf:deploy` |
| Update the development site | Push to `Develop`; Netlify builds it |
| Deploy `Develop` by hand | From the repo root (not `cares-connects/`): `netlify deploy --prod` |
| Watch live logs | `npx wrangler tail` |
| Change a secret | `npx wrangler secret put <NAME>` (takes effect immediately) |
| Change `SITE_URL` / allowed hosts | edit `vars` in `wrangler.jsonc`, then deploy |
| Run the Worker locally | put `DATABASE_URL=…` in `.dev.vars` (git-ignored), then `npm run build && npm run cf:dev` |

**Netlify blocks builds from people outside the Netlify team.** On the free plan, a commit to
this private repo only builds if its author is a member of the Netlify team; otherwise the
deploy fails with "Build blocked: Unrecognized Git contributor". Either add the contributor to
the Netlify team, or have a team member merge their work into `Develop`.

Workers can't run a long job in the background, so the IRS import always runs in GitHub Actions,
as it did on Netlify. `.github/workflows/discover.yml` doesn't change.
