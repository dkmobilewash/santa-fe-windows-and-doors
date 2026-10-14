// Vercel serverless function: receives the free-estimate / contact form and emails the lead.
//
// Required environment variables (Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY   API key from https://resend.com
//   LEAD_TO_EMAIL    where leads are sent (comma-separate multiple addresses)
//   LEAD_FROM_EMAIL  verified sender, e.g. "Website <leads@yourdomain.com>"

const FIELDS = [
  ['first_name', 'First name'],
  ['last_name', 'Last name'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['zip', 'ZIP'],
  ['project_type', 'Project type'],
  ['openings', 'Approx. number of openings'],
  ['timeframe', 'Timeframe'],
  ['historic_district', 'In a historic district?'],
  ['message', 'Message'],
];

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function parseBody(req) {
  const body = req.body;
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return Object.fromEntries(new URLSearchParams(body)); }
  }
  return body;
}

module.exports = async (req, res) => {
  // Setup check: GET /api/lead?check shows which settings are present (never their values).
  // GET /api/lead?check&send=<your LEAD_TO_EMAIL address> also sends a test email and returns
  // Resend's reply. Requiring the destination address keeps strangers from triggering it.
  if (req.method === 'GET' && req.query && 'check' in req.query) {
    const from = process.env.LEAD_FROM_EMAIL || '';
    const fromDomain = (from.match(/@([^>\s]+)/) || [])[1] || null;
    const to = (process.env.LEAD_TO_EMAIL || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const send = String(req.query.send || '').trim().toLowerCase();

    let testEmail;
    if (send) {
      if (!to.includes(send)) {
        testEmail = { sent: false, reason: 'send= must match the address in LEAD_TO_EMAIL.' };
      } else {
        try {
          const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from, to: [send], subject: 'Test from your website form', text: 'If you can read this, website leads will reach you.' }),
          });
          testEmail = { sent: r.ok, resendStatus: r.status, resendReply: await r.json().catch(() => null) };
        } catch (err) {
          testEmail = { sent: false, reason: `Could not reach Resend: ${err.message}` };
        }
      }
    }

    return res.status(200).json({
      ...(testEmail && { testEmail }),
      RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY),
      LEAD_TO_EMAIL: Boolean(process.env.LEAD_TO_EMAIL),
      LEAD_FROM_EMAIL: Boolean(from),
      senderDomain: fromDomain,
      note: fromDomain === 'resend.dev'
        ? 'Test sender: Resend only delivers to the email address your Resend account was created with.'
        : fromDomain
          ? `The domain ${fromDomain} must show "Verified" in Resend → Domains.`
          : 'LEAD_FROM_EMAIL is missing or has no @domain.',
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const wantsJson = (req.headers.accept || '').includes('application/json');
  const data = parseBody(req);
  const clean = (k) => String(data[k] ?? '').trim().slice(0, 2000);

  const done = () => (wantsJson ? res.status(200).json({ ok: true }) : res.redirect(303, '/thank-you/'));
  const fail = (status, error) =>
    wantsJson ? res.status(status).json({ ok: false, error }) : res.status(status).send(error);

  // Honeypot: bots fill the hidden "company" field. Pretend success.
  if (clean('company')) return done();

  if (!clean('first_name') || !clean('phone')) return fail(400, 'Name and phone are required.');

  const { RESEND_API_KEY, LEAD_TO_EMAIL, LEAD_FROM_EMAIL } = process.env;
  if (!RESEND_API_KEY || !LEAD_TO_EMAIL || !LEAD_FROM_EMAIL) {
    console.error('Lead form: missing RESEND_API_KEY, LEAD_TO_EMAIL or LEAD_FROM_EMAIL');
    return fail(500, 'Form is not configured yet.');
  }

  const formName = clean('form_name') || 'Website lead';
  const name = `${clean('first_name')} ${clean('last_name')}`.trim();
  const page = clean('page') || req.headers.referer || '';

  const rows = FIELDS.filter(([k]) => clean(k))
    .map(([k, label]) => `<tr><th align="left" style="padding:6px 12px 6px 0">${label}</th><td style="padding:6px 0">${escapeHtml(clean(k)).replace(/\n/g, '<br>')}</td></tr>`)
    .join('');
  const text = FIELDS.filter(([k]) => clean(k)).map(([k, label]) => `${label}: ${clean(k)}`).join('\n');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: LEAD_FROM_EMAIL,
        to: LEAD_TO_EMAIL.split(',').map((s) => s.trim()).filter(Boolean),
        reply_to: clean('email') || undefined,
        subject: `New lead: ${formName} — ${name}${clean('project_type') ? ` (${clean('project_type')})` : ''}`,
        html: `<h2>${escapeHtml(formName)}</h2><table>${rows}</table>${page ? `<p style="color:#888">Submitted from ${escapeHtml(page)}</p>` : ''}`,
        text: `${formName}\n\n${text}${page ? `\n\nSubmitted from ${page}` : ''}`,
      }),
    });
    if (!r.ok) {
      // Visible in Vercel → Logs. Common causes: sender domain not verified in Resend (403),
      // or a test sender (onboarding@resend.dev) sending to an address other than the account owner.
      console.error('Resend error', r.status, await r.text());
      return fail(502, 'Could not send your request.');
    }
  } catch (err) {
    console.error('Lead form send failed', err);
    return fail(502, 'Could not send your request.');
  }

  return done();
};
