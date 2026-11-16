# Mel's blog voice

How Melissa Zimmerman writes for the CARES Connects blog, measured from her three posts in
`data/blog-import/` with werbos's Prose Fingerprint (ported to `prose-fingerprint.mjs`; raw
output in `mel-fingerprint.txt`). Re-run it on a draft to check it lands in range:

    node data/blog-style/prose-fingerprint.mjs path/to/draft.md

## The numbers

| Measure | Mel (all 3 posts) | Range across posts | Target for new posts |
|---|---|---|---|
| Length | 330 / 662 / 1,089 words | spotlight short, roundup long | 450 to 800 for a single-nonprofit spotlight |
| Avg sentence | 13.3 words, ±9.8 | 9.4 to 17.6 | 10 to 15, with real variation |
| Reading grade (Flesch-Kincaid) | 9.3 | 6.5 to 11.6 | 7 to 10 |
| Vocabulary (type/token) | 0.30 overall | 0.36 to 0.50 per post | don't chase it |
| Exclamation marks | 0 | 0 | 0 |
| Em dashes / dashes | 0 | 0 | 0. Use a period, comma or colon |
| Emoji | 0 | 0 | 0 |
| Colons | 34 (lists and "Website: … \| Phone: …" lines) | | yes, for labels and lead-ins |
| Questions | 7, nearly all in FAQ headings | | in FAQs, not as rhetorical hooks |
| Sentence openers | "The", "You", the org's name, "It's" | | lead with the org or the reader |

## What the numbers mean in practice

**Plain, warm, practical.** Every paragraph tells the reader who something is for, what it
does, and how to reach it. Warmth comes from short, concrete lines about the reader's
situation, not from adjectives.

> You learn the warning signs. You carry the worry. You take the late-night phone calls.

**Second person, short runs.** She speaks to "you" and uses runs of short, parallel
sentences for emotional beats, then returns to longer informational sentences.

> There's no fee. Your loved one doesn't need a diagnosis. You don't need a referral.
> You show up, and you're in the room.

**Removes barriers out loud.** She states plainly what you don't need (no fee, no referral,
no diagnosis, not religiously based, regardless of faith or insurance), and is honest about
limits ("these groups are ongoing support, not emergency help").

**Local and specific.** Real city names, street names, phone numbers as `tel:` links, years
founded, volunteer counts, what percentage of donations go to services. Never vague.

**Contractions are normal** (it's, you're, don't, there's). No hype words, no "amazing",
"game-changer", "journey", "navigate the landscape", no exclamation points.

## Structure she uses

Front matter like the existing posts (title, slug, description, author, categories, status).

1. **Opening paragraph** that names the organization (linked) and in one or two sentences
   says who it serves, where, and what it provides. For anything touching crisis, safety or
   abuse, a bold line with the hotline comes first.
2. **A short context paragraph**: when it was founded, who runs it, how it's funded.
3. **`##` sections** with search-friendly headings that include the place name, e.g.
   "How St. Vincent de Paul Supports the Local Community",
   "How to Request Assistance from St. Vincent de Paul".
4. **A bulleted list** of services ("Based on each individual situation, available
   assistance may include:").
5. **A numbered "how to get started" list** with the phone number linked.
6. **A one-line closing** about dignity or support, then a bold link:
   `[**Learn more and connect with <Org>.**](url)`
7. Optional **`### FAQ`** with bold questions and one- or two-sentence answers.

Titles read like a search query a neighbor would type: "<What> in <City or County>", or a
gentle phrase plus the place ("A Quiet Gem of Compassion in the Heart of Lincoln").
Descriptions are one or two plain sentences under ~160 characters, naming the org and place.

## Facts

Every phone number, address, hour, eligibility rule and program name must be checked against
the organization's own website before publishing. If something can't be confirmed, leave it
out rather than guess.
