# Santa Fe Windows and Doors — website

Static marketing site for a window and door replacement company in Santa Fe, New Mexico.
Built on the same architecture as the Soft Water Albuquerque site: a zero-dependency Node build,
shared partials, one config file for business details, and a Vercel serverless function that emails leads through Resend.

## Pages
| URL | Source |
|---|---|
| `/` | `src/pages/index.html`: hero + estimate form, trust strip, problem cards, 3 product lines, comparison, 3-step process, Santa Fe expertise, review placeholders, service-area chips, FAQ, CTA |
| `/windows/` | Window styles: double-hung, casement, sliding, picture, awning, bay/bow, custom/arched |
| `/doors/` | Entry, patio/sliding and French doors |
| `/window-door-repair/` | Repairs + repair-or-replace advice |
| `/energy-efficient-windows/` | Low-E glass, sealing, altitude, NFRC label |
| `/historic-adobe-homes/` | Adobe/deep openings, historic districts and the H-Board |
| `/products-pricing/` | Vinyl / fiberglass-composite / wood-clad + comparison table |
| `/free-estimate/` | Booking form |
| `/service-areas/` | Santa Fe, Santa Fe County, Los Alamos County, Española & Pojoaque, Glorieta & Pecos (each area has an `id` anchor) |
| `/reviews/`, `/about/`, `/faq/`, `/financing/`, `/contact/`, `/thank-you/` | |
| `/santa-fe-nm/` | `src/pages/santa-fe-nm.html`: Santa Fe hub page linking to the neighborhood pages |
| `/santa-fe-nm/historic-eastside/`, `/las-campanas/`, `/south-capitol/`, `/eldorado/`, `/tesuque/` | `src/pages/santa-fe-nm/*.html`: neighborhood pages with estimate form, local considerations, FAQ and nearby-area links |

## Editing
- **Business info & prices:** `site.config.json`. Every placeholder value lives here, so you can replace them all in one place.
- **Shared header, footer, product lines, form, CTA:** `src/partials/`. Pages pull them in with markers:
  `<!-- @estimate-form -->`, `<!-- @packages -->`, `<!-- @cta -->` (any `src/partials/<name>.html` works as `<!-- @name -->`).
- **Page content:** `src/pages/**/*.html`. Folders become URL paths: `src/pages/santa-fe-nm/eldorado.html` → `/santa-fe-nm/eldorado/`. The comment at the top of each page sets:
  - `title:` and `description:` → `<title>` and meta description (use `{{tokens}}` freely)
  - `crumb:` → the page name in breadcrumbs. Breadcrumbs follow the URL (Home › Service Areas › Santa Fe, NM › Eldorado) in the schema, and `<!-- @breadcrumbs -->` shows them on the page
  - `schema: faq` → builds FAQPage schema from the page's `<details><summary>` questions
  - `robots: noindex` → hides the page from search and the sitemap (used on `/thank-you/`)
- **Structured data:** `build.js` generates `HomeAndConstructionBusiness` JSON-LD from `site.config.json` (address, phone, `areaServed`).
  `openingHours` is only published once you fill it in (e.g. `"Mo-Fr 08:00-17:00"`).
- **Styles:** `assets/css/styles.css`. Colors are CSS variables at the top: lime plaster, adobe, earth ink, Santa Fe blue, night blue and a single chamisa-yellow accent. Headings use Marcellus, body text Source Sans 3. The recurring motif is the arch-topped, deep-set opening around illustrations.
- **Images:** `assets/img/` holds hand-made SVGs (logo, favicon, window/door illustrations, icons). Swap in real project photos when you have them.

## Service + area pages
28 pages pair each service with each Santa Fe area, e.g. `/santa-fe-nm/eldorado/replacement-windows/`
(`/santa-fe-nm/<service>/` for Santa Fe as a whole). Service slugs: `replacement-windows`, `doors`,
`window-door-repair`, `energy-efficient-windows`, `historic-adobe-homes` (historic pages exist only for
Santa Fe, the Historic Eastside, South Capitol and Tesuque).

- **Every page is hand-written** in its own file under `src/pages/santa-fe-nm/`. There is no template: copy,
  section layout, FAQs and closing call-to-action are unique per page.
- A page joins the system with `combo: <area>/<service>` in its front matter. `src/combos.json` holds only the
  names and URLs of services and areas; the build uses it to add:
  - the **Service** JSON-LD (with `areaServed`), plus FAQPage and a BreadcrumbList of Home › Service › Service in Area
  - sitemap entries with `lastmod` (build date) and `priority` 0.7
  - related-page links: `<!-- @combo-nav -->` on combo pages, `<!-- @areas-for:<service> -->` on service pages,
    `<!-- @services-in:<area> -->` on area pages (links only appear for pages that exist)
- **Adding an area later** (e.g. Los Alamos): build its area page, add it to `src/combos.json`, then write each
  combo page by hand.
- `npm run check` builds the site and verifies unique titles, descriptions, H1s and FAQ questions; combo
  descriptions of 150–160 characters including the phone number; required schema; self-canonicals; links; and
  that no sentence is reused and page-to-page wording overlap stays low.

## Placeholders to replace before launch
Search the repo for `PLACEHOLDER` to find every spot. In summary:

| What | Where |
|---|---|
| Phone (`(505) 555-0123`) and `phoneHref` | `site.config.json` |
| Email (`hello@santafewindowsanddoors.com`) | `site.config.json` (confirm the mailbox exists) |
| Hours (`hours`, and `openingHours` for schema) | `site.config.json` |
| NM contractor license (`NM License #000000`) | `site.config.json` |
| Year founded (`20XX`, not shown on pages yet) | `site.config.json` |
| Domain (`https://www.santafewindowsanddoors.com`) | `site.config.json` (used for canonical URLs, sitemap, schema) |
| **Prices are placeholders** (`$XXX`, `$X,XXX`, `$XX/mo`): vinyl, fiberglass, wood-clad, entry door, patio door, financing | `site.config.json` → `price` |
| Warranty terms (wording is generic on purpose) | trust strip in `index.html`, `packages.html`, `products-pricing.html`, `faq.html` |
| Project photos for each neighborhood page (dashed placeholder box) | `src/pages/santa-fe-nm/*.html` |
| Reviews (dashed "Placeholder" cards; no star ratings) | `index.html`, `reviews.html`, plus your Google review link in `reviews.html` |
| Owner story and team photo | `about.html` |
| Financing partner, link and disclosures | `financing.html` |
| Brands / product lines carried | `products-pricing.html` (don't claim "authorized dealer" unless true) |
| Logo and project photos | `assets/img/` |

## Build, preview & test
```bash
npm run build     # outputs dist/; fails if any {{token}} is left unresolved
npm start         # build + serve at http://localhost:3000
npm test          # tests for api/lead.js (mock req/res, mocked fetch)
```
No dependencies.

## Deploying on Vercel
1. Import this repo in Vercel. `vercel.json` already sets the build command (`node build.js`) and output folder (`dist`).
   Don't add `trailingSlash` to `vercel.json`: it redirects POSTs to `/api/lead` and breaks the form.
   `vercel.json` also permanently redirects (308) the old `/service-areas/santa-fe-nm/...` URLs, with or without a trailing slash, to `/santa-fe-nm/...`.
2. Form submissions go to the serverless function `api/lead.js`, which emails each lead through [Resend](https://resend.com).
   In **Project → Settings → Environment Variables** (Production), add:

   | Variable | Example |
   |---|---|
   | `RESEND_API_KEY` | `re_xxxxxxxx` (from Resend → API Keys) |
   | `LEAD_TO_EMAIL` | `you@yourbusiness.com` (comma-separate for several) |
   | `LEAD_FROM_EMAIL` | `Website <leads@santafewindowsanddoors.com>` (the domain must be verified in Resend) |

3. Redeploy after adding the variables. Until they're set, the form shows a "please call us" error instead of silently losing leads.
4. In Resend → Domains, verify your sending domain. At your DNS host, also add a DMARC record so Gmail doesn't spam-folder the leads:
   `TXT` record, name `_dmarc`, value `v=DMARC1; p=none;`
5. Check the setup:
   - `https://yourdomain/api/lead?check` shows true/false for each variable (never the values) and the sender domain.
   - `https://yourdomain/api/lead?check&send=you@yourbusiness.com` sends one test email and shows Resend's reply.
     It only sends to an address listed in `LEAD_TO_EMAIL`.

## Lead form fields
`first_name`, `last_name`, `phone`, `email`, `zip`, `project_type`, `openings`, `timeframe`, `historic_district`, `message`,
plus a hidden `company` honeypot (bots that fill it get a fake success and no email is sent). Name and phone are required.
