// Zero-dependency static site builder.
// Reads src/pages/*.html, wraps each in src/partials/layout.html, fills {{tokens}}
// from site.config.json, and writes clean URLs to dist/ (e.g. dist/about/index.html).
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));

const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');
const partials = {
  layout: read('partials/layout.html'),
  header: read('partials/header.html'),
  footer: read('partials/footer.html'),
};

// Includes: <!-- @cta --> pulls in src/partials/cta.html, <!-- @packages --> packages.html,
// <!-- @estimate-form --> estimate-form.html, and so on.
function include(str) {
  return str.replace(/<!--\s*@([\w-]+)\s*-->/g, (m, name) => {
    const file = path.join(SRC, 'partials', `${name}.html`);
    if (!fs.existsSync(file)) throw new Error(`Unknown include <!-- @${name} -->`);
    return fs.readFileSync(file, 'utf8');
  });
}

// {{name}}, {{price.vinyl}}, {{year}} ...
function fill(str, vars) {
  return str.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key) => {
    const val = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), vars);
    return val == null ? m : String(val);
  });
}

// Page front matter lives in a leading HTML comment:
// <!-- title: ... \n description: ... \n crumb: ... \n schema: faq \n robots: noindex -->
function parsePage(raw) {
  const meta = {};
  const m = raw.match(/^<!--([\s\S]*?)-->\s*/);
  if (m) {
    m[1].split('\n').forEach((line) => {
      const i = line.indexOf(':');
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
    raw = raw.slice(m[0].length);
  }
  return { meta, body: raw };
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

const decode = (s) =>
  s.replace(/<[^>]+>/g, '').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&amp;/g, '&')
    .replace(/&rsquo;/g, '’').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const jsonLd = (obj) => `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n  </script>`;

const base = config.domain.replace(/\/$/, '');

// Site-wide LocalBusiness schema, built from site.config.json.
const business = {
  '@context': 'https://schema.org',
  '@type': 'HomeAndConstructionBusiness',
  name: config.name,
  url: base + '/',
  telephone: config.phone,
  email: config.email,
  logo: base + '/assets/img/logo.svg',
  address: {
    '@type': 'PostalAddress',
    streetAddress: config.address,
    addressLocality: config.city,
    addressRegion: config.state,
    postalCode: config.zip,
    addressCountry: 'US',
  },
  areaServed: config.areaServed.map((name) => ({ '@type': 'City', name })),
};
// Only published once real hours are set in site.config.json.
if (config.openingHours) business.openingHours = config.openingHours;

fs.rmSync(DIST, { recursive: true, force: true });
copyDir(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));

const vars = { ...config, year: new Date().getFullYear() };
const pagesDir = path.join(SRC, 'pages');
const urls = [];
const unresolved = [];
let pageCount = 0;

// Pages can be nested: src/pages/about.html → /about/,
// src/pages/santa-fe-nm.html → /santa-fe-nm/,
// src/pages/santa-fe-nm/eldorado.html → /santa-fe-nm/eldorado/
function listPages(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listPages(path.join(dir, e.name), `${prefix}${e.name}/`)
      : e.name.endsWith('.html') ? [`${prefix}${e.name}`] : []
  );
}

const pages = listPages(pagesDir).map((file) => {
  const slug = file.replace(/\.html$/, '').replace(/(^|\/)index$/, '');
  const url = slug ? `/${slug}/` : '/';
  return { file, slug, url, ...parsePage(fs.readFileSync(path.join(pagesDir, file), 'utf8')) };
});
const byUrl = Object.fromEntries(pages.map((p) => [p.url, p]));
const crumbName = (p) => fill(p.meta.crumb || p.meta.title || p.slug, vars);

// Home → each parent page that exists → this page
function trail(url) {
  const out = [{ name: 'Home', url: '/' }];
  const parts = url.split('/').filter(Boolean);
  for (let i = 1; i <= parts.length; i++) {
    const u = `/${parts.slice(0, i).join('/')}/`;
    if (byUrl[u]) out.push({ name: crumbName(byUrl[u]), url: u });
  }
  return out;
}

// <!-- @breadcrumbs --> renders the trail as a visible nav
function breadcrumbsHtml(url) {
  const t = trail(url);
  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${t
    .map((c, i) => (i === t.length - 1 ? `<li><span aria-current="page">${c.name}</span></li>` : `<li><a href="${c.url}">${c.name}</a></li>`))
    .join('')}</ol></nav>`;
}

for (const { file, slug, url, meta, body } of pages) {
  const canonical = base + url;

  const content = fill(include(body.replace(/<!--\s*@breadcrumbs\s*-->/g, breadcrumbsHtml(url))), vars);

  // Structured data: business on every page, breadcrumbs on inner pages, FAQPage where asked.
  const schemas = [business];
  if (url !== '/' && meta.robots !== 'noindex') {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: trail(url).map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: base + c.url })),
    });
  }
  if (meta.schema === 'faq') {
    const qa = [...content.matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)];
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: qa.map(([, q, a]) => ({
        '@type': 'Question',
        name: decode(q),
        acceptedAnswer: { '@type': 'Answer', text: decode(a) },
      })),
    });
  }

  // Mark the current nav link
  const header = partials.header.replace(
    new RegExp(`href="${url.replace(/\//g, '\\/')}"`, 'g'),
    `href="${url}" aria-current="page"`
  );

  let html = partials.layout
    .replace('{{> header}}', header)
    .replace('{{> footer}}', partials.footer)
    .replace('{{> schema}}', schemas.map(jsonLd).join('\n  '))
    .replace('{{> robots}}', meta.robots ? `<meta name="robots" content="${meta.robots}">` : '')
    .replace('{{> content}}', content);

  html = fill(html, {
    ...vars,
    pageTitle: fill(meta.title || config.name, vars),
    pageDescription: fill(meta.description || config.tagline, vars),
    canonical,
  });

  const left = html.match(/\{\{[^}]*\}\}/g);
  if (left) unresolved.push(`${file}: ${[...new Set(left)].join(', ')}`);

  const outDir = slug ? path.join(DIST, slug) : DIST;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  pageCount++;
  if (meta.robots !== 'noindex') urls.push(url);
}

if (unresolved.length) {
  console.error(`Unresolved {{tokens}} — add them to site.config.json:\n  ${unresolved.join('\n  ')}`);
  process.exit(1);
}

// sitemap + robots
fs.writeFileSync(
  path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${base}${u}</loc></url>`)
    .join('\n')}\n</urlset>\n`
);
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);

console.log(`Built ${pageCount} pages (${urls.length} in sitemap) → dist/`);
