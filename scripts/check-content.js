// Content and SEO checks for the built site. Run after `node build.js` (npm run check does both).
// - unique <title>, meta description, <h1> and FAQ questions across every page
// - self-referencing canonicals, a share image on every page, no broken internal links or #anchors (404 page included)
// - combo pages: 150-160 char description with the phone number, 3-5 FAQs, Service + FAQPage + BreadcrumbList schema
// - combo pages: no sentence shared with any other page, and low word-sequence overlap between pages
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const base = config.domain.replace(/\/$/, '');
const MAX_OVERLAP = 0.12; // max share of 6-word sequences two combo pages may have in common

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory() && e.name !== 'assets') walk(p);
    else if (e.name === 'index.html') files.push(p);
  }
})(DIST);
files.push(path.join(DIST, '404.html'));

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&rsquo;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ');
const text = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const pages = files.map((f) => {
  const html = fs.readFileSync(f, 'utf8');
  const rel = path.relative(DIST, path.dirname(f)).split(path.sep).join('/');
  const url = path.basename(f) === '404.html' ? '/404.html' : rel ? `/${rel}/` : '/';
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  let main = (html.match(/<main id="main">([\s\S]*?)<\/main>/) || [, ''])[1]
    .replace(/<form[\s\S]*?<\/form>/g, ' ')
    .replace(/<section class="section section--white combo-nav-section">[\s\S]*?<\/section>/g, ' ')
    .replace(/<nav class="breadcrumbs"[\s\S]*?<\/nav>/g, ' ');
  return {
    url,
    html,
    ld,
    title: decode((html.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1]),
    description: decode((html.match(/<meta name="description" content="([^"]*)"/) || [, ''])[1]),
    canonical: (html.match(/<link rel="canonical" href="([^"]*)"/) || [, ''])[1],
    h1: text((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [, ''])[1]),
    faqs: [...html.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map((m) => text(m[1])),
    combo: ld.some((x) => x['@type'] === 'Service'),
    body: text(main),
  };
});

const errors = [];
const dupes = (key, get) => {
  const seen = new Map();
  for (const p of pages) for (const v of [].concat(get(p))) {
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k) && seen.get(k) !== p.url) errors.push(`duplicate ${key}: "${v}" on ${seen.get(k)} and ${p.url}`);
    else seen.set(k, p.url);
  }
};
dupes('title', (p) => p.title);
dupes('description', (p) => p.description);
dupes('h1', (p) => p.h1);
dupes('FAQ question', (p) => p.faqs);

for (const p of pages) {
  if (!p.html.includes('name="robots" content="noindex"') && p.canonical !== base + p.url) errors.push(`${p.url}: canonical is ${p.canonical}`);
  if (!p.html.includes(`<meta property="og:image" content="${base}/assets/img/og-image.jpg">`)) errors.push(`${p.url}: missing og:image`);
  for (const m of p.html.matchAll(/href="(\/[^"#]*)(#[^"]*)?"/g)) {
    const [, u, hash] = m;
    if (u.startsWith('/assets') || u.startsWith('/api')) continue;
    const target = /\.\w+$/.test(u) ? path.join(DIST, u) : path.join(DIST, u, 'index.html');
    if (!fs.existsSync(target)) errors.push(`${p.url}: broken link ${u}`);
    else if (hash && !fs.readFileSync(target, 'utf8').includes(`id="${hash.slice(1)}"`)) errors.push(`${p.url}: missing anchor ${u}${hash}`);
  }
  if (!p.combo) continue;
  const len = p.description.length;
  if (len < 150 || len > 160) errors.push(`${p.url}: description is ${len} chars (want 150-160)`);
  if (!p.description.includes(config.phone)) errors.push(`${p.url}: description lacks the phone number`);
  if (p.faqs.length < 3 || p.faqs.length > 5) errors.push(`${p.url}: ${p.faqs.length} FAQs (want 3-5)`);
  for (const t of ['Service', 'FAQPage', 'BreadcrumbList']) if (!p.ld.some((x) => x['@type'] === t)) errors.push(`${p.url}: missing ${t} schema`);
}

// Originality: sentences of 8+ words on a combo page must not appear on any other page
const sentences = (s) => s.split(/(?<=[.!?])\s+/).map((x) => x.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()).filter((x) => x.split(' ').length >= 8);
const owner = new Map();
for (const p of pages) for (const s of new Set(sentences(p.body))) owner.set(s, [...(owner.get(s) || []), p.url]);
for (const [s, urls] of owner) if (urls.length > 1 && urls.some((u) => pages.find((p) => p.url === u).combo)) errors.push(`reused sentence on ${urls.join(', ')}: "${s.slice(0, 90)}..."`);

// Overlap: share of 6-word sequences two combo pages have in common (Jaccard)
const shingles = (s) => { const w = s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean); const out = new Set(); for (let i = 0; i + 6 <= w.length; i++) out.add(w.slice(i, i + 6).join(' ')); return out; };
const comboPages = pages.filter((p) => p.combo).map((p) => ({ ...p, sh: shingles(p.body), words: p.body.split(' ').length }));
let worst = { v: 0 };
for (let i = 0; i < comboPages.length; i++) for (let j = i + 1; j < comboPages.length; j++) {
  const A = comboPages[i].sh, B = comboPages[j].sh;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  const v = inter / (A.size + B.size - inter || 1);
  if (v > worst.v) worst = { v, a: comboPages[i].url, b: comboPages[j].url };
  if (v > MAX_OVERLAP) errors.push(`overlap ${(v * 100).toFixed(1)}% between ${comboPages[i].url} and ${comboPages[j].url}`);
}

console.log(`Checked ${pages.length} pages (${comboPages.length} combo pages).`);
if (comboPages.length) {
  const words = comboPages.map((p) => p.words);
  console.log(`Combo page body length: ${Math.min(...words)}-${Math.max(...words)} words. Highest overlap between two combo pages: ${(worst.v * 100).toFixed(1)}%${worst.a ? ` (${worst.a} vs ${worst.b})` : ''}.`);
}
if (errors.length) {
  console.error(`\n${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log('All content checks passed.');
