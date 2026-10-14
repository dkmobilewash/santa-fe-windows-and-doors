// Mobile navigation toggle
(function () {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('main-nav');
  if (!toggle || !nav) return;

  function setOpen(open) {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.classList.toggle('nav-open', open);
  }

  toggle.addEventListener('click', function () {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setOpen(false);
  });
  nav.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') setOpen(false);
  });
})();

// Lead forms: submit to /api/lead without a page reload, then go to the thank-you page.
// Without JS the form still posts normally and the API redirects.
(function () {
  document.querySelectorAll('form.lead-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (!window.fetch) return;
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var err = form.querySelector('.lead-form__error');
      var label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Sending…';
      if (err) err.hidden = true;

      var data = Object.fromEntries(new FormData(form));
      data.page = window.location.pathname;

      fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data)
      })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.ok) throw new Error(j.error); }); })
        .then(function () { window.location.href = '/thank-you/'; })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = label;
          if (err) err.hidden = false;
        });
    });
  });
})();
