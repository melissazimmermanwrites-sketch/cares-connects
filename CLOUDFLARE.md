# Moving caresconnects.org from Netlify to Cloudflare

The app runs on **Cloudflare Workers**. Cloudflare's CDN serves the static files (including the
chat brain). One Worker (`cares-connects/cloudflare/worker.mjs`) runs the same Express server
that Netlify ran, for page rendering and `/api`. Config is `cares-connects/wrangler.jsonc`.
The database (Turso) and the weekly IRS import (GitHub Actions) don't change.

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

In Cloudflare: **DNS → Records**, delete the Netlify `A` record for `caresconnects.org` and the
`www` CNAME. Then:

**Workers & Pages → cares-connects → Settings → Domains & Routes → Add → Custom domain**:
add `caresconnects.org`, then add `www.caresconnects.org`.

Cloudflare creates the DNS records and the HTTPS certificate itself, usually within a few
minutes. During those minutes the site may be unreachable, so do this at a quiet time.

## 7. Check everything (on https://caresconnects.org)

- [ ] Home page, `/find`, a category page and a listing page load
- [ ] The "Find help" chat: ZIP → need → results; typing "is this free?" gets an answer;
      typing a crisis phrase shows 911/988
- [ ] `/admin` sign-in works; editing a listing shows up on the public site
- [ ] Discover page shows the IRS queue; "Review & add" publishes a listing
- [ ] Export → Google Sheets workbook downloads
- [ ] `/robots.txt` and `/sitemap.xml` load
- [ ] `www.caresconnects.org` loads too

## 8. Clean up (after a week of the site working on Cloudflare)

- Delete the Netlify project: <https://app.netlify.com/projects/caresconnects> →
  Project configuration → Delete project.
- Remove the Netlify files from the repo: `cares-connects/netlify.toml`,
  `cares-connects/netlify/`, and the `serverless-http` dependency (`npm uninstall serverless-http`).
- Update section 3 of `HANDOFF.md` if it's still around.

**Rolling back** before step 8: in Cloudflare DNS, remove the Worker custom domains and add back
`A caresconnects.org → 75.2.60.5` and `CNAME www → caresconnects.netlify.app` (DNS only).

---

## Day to day

| Task | Command (from `cares-connects/`) |
|---|---|
| Deploy a change | `npm run cf:deploy` |
| Watch live logs | `npx wrangler tail` |
| Change a secret | `npx wrangler secret put <NAME>` (takes effect immediately) |
| Change `SITE_URL` / allowed hosts | edit `vars` in `wrangler.jsonc`, then deploy |
| Run the Worker locally | put `DATABASE_URL=…` in `.dev.vars` (git-ignored), then `npm run build && npm run cf:dev` |

Workers can't run a long job in the background, so the IRS import always runs in GitHub Actions,
as it did on Netlify. `.github/workflows/discover.yml` doesn't change.
