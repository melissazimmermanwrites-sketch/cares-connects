# CARES Connects: handoff for Mel

Last updated 2026-11-10. Written for Mel, and for Claude Code if she uses it to help.

There are four things to do: gather blog posts, gather donation and page details, finish the Netlify settings for the `Develop` site, and update the databases.

**Never paste passwords, tokens or secrets into chat or commit them.** They only go into the Netlify, Cloudflare and Turso settings. Commands below run from the `cares-connects/` folder.

## What's ready and what's waiting

| Work | Status | Waiting on |
|---|---|---|
| Listing pages and "List your organization" form | Merged into `Develop` | Its database tables (section 4) |
| About, Contact and Donate pages | Merged into `Develop`, as drafts | Your content and donation link |
| Blog and blog admin | In a pull request into `Develop` | Merging, then your posts |
| `Develop` site on Netlify | Building again since the repo went public | `SUBMISSION_SECRET` (section 3) |
| New database tables | Scripts ready | Section 4, on the development database first |

None of this is on caresconnects.org yet. That happens when `Develop` is merged into `main`. Until then, `/about`, `/contact`, `/donate` and the Blog link return "not found" there.

## 1. Blog posts

The posts aren't saved anywhere we can reach, so we need them from you. The best place to look is your old LeadConnector (GoHighLevel) website account.

**Please don't cancel that account until everything in sections 1 and 2 is saved.**

For each post, send Jason:

- Title
- Date it was published
- Full text
- Images, as files if you can (JPEG, PNG, GIF or WebP, up to 3 MB each)
- Its old web address, so we can try to keep old links working

A copy-and-paste into a Google Doc is fine.

### After the blog is live

You can add and edit posts yourself at `/admin/posts`:

1. Choose **New post**, then add the title and text. The buttons above the text handle headings, links, lists and images, and the preview shows how it will look.
2. Add a description. Publishing needs one, and it appears on the blog page and in search results.
3. For an older post, set its original date. A future date makes the post go live that day.
4. Choose **Save draft** or **Publish**. Publishing doesn't use up a Netlify deploy.

## 2. Donation link and page content

| Page | What we need |
|---|---|
| Donate | **The real donation link** |
| Donate | EIN, and the wording you want about receipts and taxes |
| Donate | What donations pay for, with real examples |
| About | How CARES Connects started and why |
| About | Team names, roles and photos |
| About | Link to the *Connecting the Gaps* report |
| Contact | Public email, phone and mailing address |
| Volunteers | Please confirm this wording: "We're always accepting volunteers for school credit. Contact us for more information." |

The Donate page can't take money until we have the link. The old `pay.caresconnects.org` main address shows "Pay Link Not Found", but a specific donation link there may still work, so check your account.

## 3. Netlify settings for the Develop site

`caresconnects.netlify.app` is the development site, built from the `Develop` branch. Builds started working again once the repo went public. While it was private, Netlify's Free plan blocked commits from anyone outside your Netlify team, which included Jason. **If the repo is ever made private again, `Develop` will stop deploying.**

### If a build fails with an Angular plugin error

1. In Netlify, open the **caresconnects** project, then **Project configuration → Environment variables**.
2. Add `NETLIFY_ANGULAR_PLUGIN_SKIP` with the value `true`. It must be set here, because setting it in `netlify.toml` doesn't work.
3. If the Angular plugin is listed under **Build & deploy → Build plugins**, remove it. Don't install it instead: it replaces the server code with a version that can't run the API.

### Check the other settings

"Production" in Netlify means the `Develop` build. Menu names may differ slightly.

| Setting | Value | Notes |
|---|---|---|
| `NETLIFY_ANGULAR_PLUGIN_SKIP` | `true` | Only if the Angular plugin error appears |
| `DATABASE_URL` | Your **development** database address | Must not be the live database |
| `DATABASE_AUTH_TOKEN` | Token for that database | Mark it as secret |
| `SITE_URL` | `https://caresconnects.netlify.app` | |
| `NG_ALLOWED_HOSTS` | `caresconnects.netlify.app` | Other addresses get an error |
| `NODE_ENV` | `production` | Makes login cookies HTTPS-only |
| `SUBMISSION_SECRET` | A long random value | **Needed now.** Without it, the contact and "List your organization" forms say "This form isn't available right now". Create one with `openssl rand -base64 32`, and use a different one for the live site |

Don't set `NOINDEX`. Search engines already skip `.netlify.app` addresses.

If you don't have a development database yet, create one so test edits can't touch real listings:

```bash
turso db create cares-connects-dev
export DATABASE_URL="$(turso db show cares-connects-dev --url)"
export DATABASE_AUTH_TOKEN="$(turso db tokens create cares-connects-dev)"
echo "$DATABASE_URL"    # stop unless this name ends in -dev
npm run db:setup
npm run admin:create -- <your email> "Your name"
unset DATABASE_URL DATABASE_AUTH_TOKEN
```

### Redeploy and check

Go to **Deploys → Trigger deploy → Clear cache and deploy site**, then check:

- The deploy succeeds. If it fails, send Jason the error from the deploy log.
- caresconnects.netlify.app loads, its pages say `noindex, nofollow`, and its footer ends "Please call ahead.." with two periods. The second period is left over from a test, and Jason will remove it.
- caresconnects.org still ends with one period and says `index, follow`, which confirms `Develop` doesn't change the live site.

**Free plan limit:** you get 300 credits a month, and a successful `Develop` deploy costs 15, so at most 20 merges a month. Bandwidth and server use also spend credits. If they run out, Netlify projects pause until the next cycle. PR previews and failed deploys are free. caresconnects.org is on Cloudflare and shouldn't be affected.

## 4. Database migrations

The listing form, contact form and blog need new tables: migrations `0005`, `0006` and `0007`. **This only adds tables and doesn't copy or replace your listings.** Nothing from Jason's computer goes into your database.

Do the **development database now**, since `0005` and `0006` are already in `Develop`, and run it again once the blog merges. Do the **live database only when `Develop` is merged into `main`**. `db:status` arrives with the blog pull request, so wait for that merge before starting. Run this **before** deploying the code that needs it, since the current site keeps working with the extra tables.

Confirm your database names with `turso db list`. These steps assume the live one is `cares-connects`.

```bash
# 1. Back up the live database (put today's date in the name)
turso db create cares-connects-backup-YYYYMMDD --from-db cares-connects

# 2. Connect
export DATABASE_URL="$(turso db show cares-connects --url)"
export DATABASE_AUTH_TOKEN="$(turso db tokens create cares-connects)"

# 3. See what would happen. This changes nothing.
npm run db:status

# 4. Apply it, then check again
npm run db:migrate
npm run db:status

# 5. Disconnect
unset DATABASE_URL DATABASE_AUTH_TOKEN
```

The last `db:status` should say "Up to date", with your listing count unchanged.

- **If it says PROBLEM or refuses to run:** stop and send Jason the message. Nothing has been changed.
- **Never run `npm run db:seed -- --force` on the live database.** It wipes your listings.
- **The weekly IRS job also migrates:** the GitHub Action `discover.yml` runs `db:migrate` on the live database on its schedule, so a merge to `main` can reach it without a backup. Back up before merging, or ask Jason to remove that step.

Before the contact form goes live, also add its secret to Cloudflare with `npx wrangler secret put SUBMISSION_SECRET`.

## Checklist

**Mel**

- [ ] Send blog posts
- [ ] Send the donation link and page content
- [ ] Keep the LeadConnector account until that's saved
- [ ] Add `SUBMISSION_SECRET` and check the other Netlify settings
- [ ] Keep the GitHub repo public, or `Develop` stops deploying
- [ ] Redeploy `Develop` and confirm the checks above
- [ ] Migrate the development database once the blog merges, and the live one when `Develop` goes to `main`

**Jason**

- [x] Merge the listing form and the info pages into `Develop`
- [ ] Merge the blog into `Develop`
- [ ] Remove the double period from the footer
- [ ] Put Mel's posts and content in, and take down the draft labels
- [ ] Fix the Cloudflare rendering problem, so Google can read listing and blog pages

Questions? Ask Jason. Don't delete this file until the checklist is done.
