/* labs-article.js — 360labs · article premium : sommaire actif, progression, FAQ schema, partage, retour-haut */
(function () {
  function initArticle() {
    var root = document.querySelector('[data-article]');
    if (!root || root.getAttribute('data-art-init')) return;
    root.setAttribute('data-art-init', '1');

    var body = root.querySelector('#artBody');
    var tocNav = root.querySelector('#artToc');
    var aside = root.querySelector('.art-aside');
    if (!body) return;
    var heads = body.querySelectorAll('h2, h3');
    var links = [];

    // Sommaire auto + ancres + scroll fluide
    if (tocNav && heads.length > 1) {
      var ul = document.createElement('ul'), i = 0;
      heads.forEach(function (h) {
        if (!h.id) {
          i++;
          var slug = (h.textContent || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 42);
          h.id = 'sec-' + i + (slug ? '-' + slug : '');
        }
        var li = document.createElement('li');
        if (h.tagName === 'H3') li.className = 'toc-sub';
        var a = document.createElement('a');
        a.href = '#' + h.id;
        a.textContent = h.textContent;
        a.addEventListener('click', function (e) {
          e.preventDefault();
          var t = document.getElementById(h.id);
          if (t) { window.scrollTo({ top: t.getBoundingClientRect().top + window.pageYOffset - 90, behavior: 'smooth' }); history.replaceState(null, '', '#' + h.id); }
        });
        li.appendChild(a);
        ul.appendChild(li);
        links.push({ id: h.id, link: a });
      });
      tocNav.appendChild(ul);
    } else if (aside) {
      var t = aside.querySelector('.art-toc');
      if (t) t.style.display = 'none';
    }

    // FAQPage schema auto
    var faq = [];
    body.querySelectorAll('h2').forEach(function (h2) {
      if (!/question|faq/i.test(h2.textContent || '')) return;
      var el = h2.nextElementSibling;
      while (el && el.tagName !== 'H2') {
        if (el.tagName === 'H3') {
          var q = (el.textContent || '').trim(), ans = '', p = el.nextElementSibling;
          while (p && p.tagName !== 'H3' && p.tagName !== 'H2') { if (p.textContent) ans += (ans ? ' ' : '') + p.textContent.trim(); p = p.nextElementSibling; }
          if (q && ans) faq.push({ q: q, a: ans });
          el = p; continue;
        }
        el = el.nextElementSibling;
      }
    });
    if (faq.length) {
      var data = { "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": faq.map(function (f) { return { "@type": "Question", "name": f.q, "acceptedAnswer": { "@type": "Answer", "text": f.a } }; }) };
      var s = document.createElement('script');
      s.type = 'application/ld+json';
      s.textContent = JSON.stringify(data);
      document.head.appendChild(s);
    }

    // Barre de progression + scrollspy + retour-haut
    var bar = document.getElementById('artProgress');
    var totop = root.querySelector('.art-totop');
    function onScroll() {
      var b = body.getBoundingClientRect();
      var total = b.height - window.innerHeight + 120;
      var done = Math.min(1, Math.max(0, (-b.top + 120) / (total > 0 ? total : 1)));
      if (bar) bar.style.transform = 'scaleX(' + done + ')';
      if (totop) totop.classList.toggle('show', window.pageYOffset > 700);
      if (links.length) {
        var active = links[0].id, mid = window.innerHeight * 0.3;
        links.forEach(function (l) { var el = document.getElementById(l.id); if (el && el.getBoundingClientRect().top <= mid) active = l.id; });
        links.forEach(function (l) { l.link.classList.toggle('is-active', l.id === active); });
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
    if (totop) totop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

    // Copier le lien
    var copyBtn = root.querySelector('.art-copy');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var url = copyBtn.getAttribute('data-copy');
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () {
        copyBtn.classList.add('ok'); setTimeout(function () { copyBtn.classList.remove('ok'); }, 1600);
      });
    });
  }

  if (document.readyState !== 'loading') initArticle();
  else document.addEventListener('DOMContentLoaded', initArticle);
  document.addEventListener('shopify:section:load', function () {
    var r = document.querySelector('[data-article]');
    if (r) r.removeAttribute('data-art-init');
    initArticle();
  });
})();
