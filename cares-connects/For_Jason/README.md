# Content exported from the old site

Exported 2026-11-10 from the 1stContact.ai (GoHighLevel) website "Community Alliance of Resources Education and Support" and its blog "CARES Blog (2)".

```
For_Jason/
  blog/            3 published posts (Markdown + front matter)
  pages/           about.md, contact.md, donate.md
  assets/blog/     featured image for each post (named after the post slug)
  assets/pages/    cares-logo.png, donate-share-image.png (Donate og:image), about-decorative-line.svg
```

The `image` paths in front matter assume the assets are served from `/For_Jason/assets/...`. If you move them (for example into `public/`), update those paths.

## Shared site details (header and footer on every old page)

- Nav: Home, About, Contact, Donate, Find Help Now (`/find-help`)
- Footer tagline: "Community Alliance of Resources Education and Support is a 501 (c)(3) nonprofit organization."
- Email: caresconnects@gmail.com
- Location line: CA.US
- Instagram: https://instagram.com/cares_connects
- LinkedIn: https://www.linkedin.com/company/cares-connects
- Footer links: Home, About us, Contact us, Blog, Privacy Policy, Terms & Conditions (the last two were not linked on the old site)
- Copyright: "Copyright 2026. CARES CONNECTS. All rights reserved."
- "List your organization" Google Form: https://docs.google.com/forms/d/1BwqNlFJQCEyfeHqMpa8XJFiKT6qO0smfEisBGIeasnY/viewform

## Fixes made during export

The wording is unchanged. These link and spacing problems from the old site were fixed:

- Suicide-prevention post: removed a stray `|` from the end of six link URLs (wellspacehealth, placer.ca.gov, ssyaf, trevorproject, afsp). Changed the Sacramento DHS link, which pointed to `html-cleaner.com/dhs.saccounty.gov/...`, to `https://dhs.saccounty.gov/BHS/Pages/Mental-Health-Services.aspx`. Added missing spaces ("text988", "Website:[", "should**call").
- NAMI post: added missing spaces around links ("groupsmeet", "the[events calendar]at", "email[...]to") and in "NAMIsupport".
- St. Vincent de Paul post: changed the malformed `tel:1(916)645-7201` link to `tel:+19166457201`.
- Changed `http://` links to `https://`, and dropped `?edit_requested=true` from the Google Form URL.
- On About and Contact, changed internal links from `/preview/<id>` to `/contact` etc.
- Contact page: the old footer had "Privacy Policy | Terms of Service" links pointing to `www.example.com`. I left them out.

## Still needs a decision on the new site

- **Contact form**: the old form was a 1stContact form, so it won't submit from the new site. Its fields are listed in `pages/contact.md`.
- **Blog URLs**: the old blog ran at `caresconnects.org/blog`. Each post's `slug` is in its front matter if you want to set up redirects.
