/**
 * L8-B · recette navigateur LOCALE (UX-01, UX-02) · versionnée, jamais lancée par
 * la CI (pas de navigateur ni de serveur là-bas · la garde CI est faite des
 * tests `l8b-*.test.tsx`, qui lisent le HTML et le focus rendus en jsdom).
 *
 * Pour chaque écran et chaque largeur (1280, 1440, 390 × 720) : capture,
 * débordement horizontal, cibles < 44 px, champs < 16 px, contrastes sous AA
 * (dégradés compris, pire couleur retenue), puis Tab au clavier depuis le
 * début de <main> (focus visible, ordre).
 *
 *   RECETTE_URL=http://127.0.0.1:3482 RECETTE_SECRET=<AUTH_SECRET local> RECETTE_UID=<uid> \
 *   RECETTE_BRAND=<brand> RECETTE_CAPTURES=<dossier hors dépôt> CHROMIUM=<chemin> \
 *   node apps/web/test/l8b-recette-navigateur.mjs <etiquette> <ecrans.json> [largeurs…]
 *
 * Base de recette SYNTHÉTIQUE locale seulement · jamais la production.
 */
// Outils de recette L8-B · Playwright local, session forgée sur la base de recette synthétique.
import crypto from 'node:crypto';
import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');

const BASE = process.env.RECETTE_URL ?? 'http://127.0.0.1:3482';
const SECRET = process.env.RECETTE_SECRET ?? '';
const UID = process.env.RECETTE_UID ?? '';
const BRAND = process.env.RECETTE_BRAND ?? '';
const CAPTURES = process.env.RECETTE_CAPTURES ?? '.';

function jeton(uid = UID) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ uid, ep: 0, iat: now, exp: now + 3600 });
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
}

async function navigateur() {
  return chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
}

async function contexte(b, { largeur = 1280, uid = UID, brand = BRAND, reduit = false } = {}) {
  const c = await b.newContext({ viewport: { width: largeur, height: 720 }, isMobile: largeur < 500, hasTouch: largeur < 500, reducedMotion: reduit ? 'reduce' : 'no-preference' });
  await c.addCookies([
    { name: 'tt_session', value: jeton(uid), domain: '127.0.0.1', path: '/' },
    ...(brand ? [{ name: 'tt_brand', value: brand, domain: '127.0.0.1', path: '/' }] : []),
  ]);
  return c;
}

/**
 * Mesures d'une page, dans le navigateur · débordement horizontal, cibles
 * < 44 px, champs < 16 px, contrastes sous AA, et statut porté par la couleur
 * seule (repéré par l'absence de texte dans un élément coloré marqué d'état).
 * `racine` borne la mesure (ex. `main`), le rail et l'en-tête de l'appli sont
 * hors périmètre de ce lot.
 */
async function mesurer(page, racine = 'main') {
  return page.evaluate((sel) => {
    const zone = document.querySelector(sel) || document.body;
    const out = { debordPage: document.documentElement.scrollWidth - document.documentElement.clientWidth, debordants: [], cibles: [], champs: [], contraste: [] };
    const vw = document.documentElement.clientWidth;
    const desc = (e) => {
      const t = (e.getAttribute('aria-label') || e.innerText || e.value || e.getAttribute('name') || e.id || '').toString().replace(/\s+/g, ' ').trim().slice(0, 60);
      return `${e.tagName.toLowerCase()}${e.getAttribute('data-bouton') ? `[data-bouton=${e.getAttribute('data-bouton')}]` : ''} « ${t} »`;
    };
    const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    // Débordement · éléments dont le bord droit sort du viewport (hors conteneurs à défilement horizontal voulu).
    for (const e of zone.querySelectorAll('*')) {
      if (!visible(e)) continue;
      const r = e.getBoundingClientRect();
      if (r.right > vw + 1) {
        let p = e.parentElement; let clip = false;
        while (p && p !== document.body) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { const pr = p.getBoundingClientRect(); if (pr.right <= vw + 1) { clip = true; break; } } p = p.parentElement; }
        if (!clip) out.debordants.push(`${desc(e)} → ${Math.round(r.right - vw)} px`);
      }
    }
    out.debordants = [...new Set(out.debordants)].slice(0, 15);
    // Cibles.
    const interactifs = zone.querySelectorAll('a[href], button, input, select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])');
    for (const e of interactifs) {
      if (!visible(e)) continue;
      let r = e.getBoundingClientRect();
      const type = (e.getAttribute('type') || '').toLowerCase();
      if ((type === 'radio' || type === 'checkbox') && e.closest('label')) r = e.closest('label').getBoundingClientRect();
      if (type === 'hidden') continue;
      const s = getComputedStyle(e);
      const enLigne = e.tagName === 'A' && s.display === 'inline' && /^(P|LI|SPAN|DD|TD)$/.test(e.parentElement?.tagName || '');
      if (r.height < 44 - 0.5 || r.width < 44 - 0.5) out.cibles.push({ el: desc(e), h: Math.round(r.height), w: Math.round(r.width), enLigne });
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && type !== 'radio' && type !== 'checkbox' && parseFloat(s.fontSize) < 16) out.champs.push({ el: desc(e), px: parseFloat(s.fontSize) });
    }
    // Contraste.
    const rgba = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const fond = (e) => {
      const couches = [];
      for (let x = e; x; x = x.parentElement) {
        const s = getComputedStyle(x);
        if (s.backgroundImage && s.backgroundImage !== 'none') {
          // Dégradé · on rend chacune de ses couleurs, le pire cas sera retenu.
          const cs = [...s.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((m) => rgba(m[0])).filter(Boolean);
          if (!cs.length) return null;
          return cs.map((c) => ({ r: c.r, g: c.g, b: c.b }));
        }
        const c = rgba(s.backgroundColor); if (c && c.a > 0) { couches.push(c); if (c.a >= 1) break; }
      }
      let res = { r: 0, g: 0, b: 0 };
      const html = rgba(getComputedStyle(document.body).backgroundColor);
      if (html && html.a >= 1) res = html;
      for (let i = couches.length - 1; i >= 0; i--) { const c = couches[i]; res = { r: c.r * c.a + res.r * (1 - c.a), g: c.g * c.a + res.g * (1 - c.a), b: c.b * c.a + res.b * (1 - c.a) }; }
      return res;
    };
    const vus = new Set();
    const tw = document.createTreeWalker(zone, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) {
      const n = tw.currentNode; if (!n.textContent.trim()) continue;
      const e = n.parentElement; if (!e || vus.has(e) || !visible(e)) continue; vus.add(e);
      const s = getComputedStyle(e);
      let fg = rgba(s.color); if (!fg) continue;
      const bgs = fond(e); if (!bgs) continue;
      const liste = Array.isArray(bgs) ? bgs : [bgs];
      let pire = Infinity; let bg = liste[0];
      for (const x of liste) { const L = lum(x); const f0 = lum(fg); const rr = (Math.max(L, f0) + 0.05) / (Math.min(L, f0) + 0.05); if (rr < pire) { pire = rr; bg = x; } }
      const op = parseFloat(s.opacity);
      let o = 1; for (let x = e; x; x = x.parentElement) o *= parseFloat(getComputedStyle(x).opacity);
      if (o < 1 || fg.a < 1) { const a = fg.a * o; fg = { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) }; }
      void op;
      const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const px = parseFloat(s.fontSize); const gras = parseInt(s.fontWeight, 10) >= 700;
      const grand = px >= 24 || (gras && px >= 18.66);
      const seuil = grand ? 3 : 4.5;
      const desactive = !!e.closest('button[disabled], [aria-disabled="true"], select[disabled], input[disabled]');
      out.mesures = (out.mesures || 0) + 1; out.ratioMin = Math.min(out.ratioMin ?? 99, desactive ? 99 : Math.round(ratio * 100) / 100);
      if (ratio < seuil && !desactive) out.contraste.push({ texte: n.textContent.trim().slice(0, 50), ratio: Math.round(ratio * 100) / 100, seuil, px });
    }
    out.contraste = out.contraste.slice(0, 40);
    return out;
  }, racine);
}

/** Parcours au clavier · Tab N fois, chaque arrêt : élément, focus visible, dans le viewport. */
async function parcoursClavier(page, n = 60, racine = 'main') {
  const arrets = [];
  await page.evaluate((sel) => { window.scrollTo(0, 0); const m = document.querySelector(sel); if (m) { const a = document.createElement('span'); a.tabIndex = -1; a.id = '__depart'; m.prepend(a); a.focus(); a.addEventListener('blur', () => a.remove(), { once: true }); } }, racine);
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    const a = await page.evaluate((sel) => {
      const e = document.activeElement; if (!e || e === document.body) return null;
      const s = getComputedStyle(e); const r = e.getBoundingClientRect();
      const visibleFocus = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none');
      const t = (e.getAttribute('aria-label') || e.innerText || e.value || e.id || '').toString().replace(/\s+/g, ' ').trim().slice(0, 50);
      return { el: `${e.tagName.toLowerCase()} « ${t} »`, visibleFocus, dansVue: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth, dansZone: !!e.closest(sel), dialogue: !!e.closest('[role="dialog"]') };
    }, racine);
    arrets.push(a);
  }
  return arrets;
}



const [, , etiquette = 'avant', fichier = 'ecrans.json', ...largeursBrutes] = process.argv;
const ecrans = JSON.parse(fs.readFileSync(fichier, 'utf8'));
const largeurs = largeursBrutes.length ? largeursBrutes.map(Number) : [1280, 1440, 390];

await (async () => {
  const b = await navigateur();
  const rapport = [];
  for (const e of ecrans) {
    for (const w of largeurs) {
      const c = await contexte(b, { largeur: w, ...(e.uid ? { uid: e.uid } : {}), ...(e.brand !== undefined ? { brand: e.brand } : {}) });
      const p = await c.newPage();
      const erreurs = [];
      p.on('pageerror', (x) => erreurs.push(String(x.message).slice(0, 160)));
      await p.goto(BASE + e.url, { waitUntil: 'networkidle' });
      if (e.attente) await p.waitForSelector(e.attente, { timeout: 8000 }).catch(() => erreurs.push(`attente ${e.attente} absente`));
      await p.waitForTimeout(400);
      await p.screenshot({ path: `${CAPTURES}/${etiquette}-${e.nom}-${w}.png`, fullPage: !!e.pleine });
      const m = await mesurer(p, e.racine || 'main');
      let clavier = null;
      if (e.clavier !== false && w !== 1440) {
        const arrets = await parcoursClavier(p, e.tabs || 60, e.racine || 'main');
        const zone = arrets.filter((a) => a && a.dansZone);
        clavier = { arretsZone: zone.length, sansFocusVisible: zone.filter((a) => !a.visibleFocus).map((a) => a.el), horsVue: zone.filter((a) => !a.dansVue).map((a) => a.el).slice(0, 5), ordre: zone.slice(0, 25).map((a) => a.el) };
      }
      rapport.push({ ecran: e.nom, largeur: w, url: p.url().replace(BASE, ''), debordPage: m.debordPage, debordants: m.debordants, cibles: m.cibles, champs: m.champs, contraste: m.contraste, ratioMin: m.ratioMin, mesures: m.mesures, clavier, erreurs });
      await c.close();
    }
  }
  fs.writeFileSync(`${CAPTURES}/${etiquette}-inventaire.json`, JSON.stringify(rapport, null, 1));
  for (const r of rapport) {
    const cibles = r.cibles.filter((x) => !x.enLigne);
    console.log(`${r.ecran} @${r.largeur} → ${r.url} · débord ${r.debordPage}px${r.debordants.length ? ` (${r.debordants.slice(0, 3).join(' | ')})` : ''} · cibles<44 : ${cibles.length}${cibles.length ? ` [${cibles.slice(0, 6).map((x) => `${x.el} ${x.w}×${x.h}`).join(' ; ')}]` : ''} · liens en ligne<44 : ${r.cibles.length - cibles.length} · champs<16 : ${r.champs.length}${r.champs.length ? ` [${r.champs.slice(0, 3).map((x) => `${x.el} ${x.px}`).join(' ; ')}]` : ''} · contraste<AA : ${r.contraste.length} (min ${r.ratioMin} sur ${r.mesures})${r.contraste.length ? ` [${r.contraste.slice(0, 5).map((x) => `« ${x.texte} » ${x.ratio}/${x.seuil}`).join(' ; ')}]` : ''}${r.clavier ? ` · clavier ${r.clavier.arretsZone} arrêts, sans focus visible ${r.clavier.sansFocusVisible.length}${r.clavier.sansFocusVisible.length ? ` [${r.clavier.sansFocusVisible.slice(0, 3).join(' ; ')}]` : ''}` : ''}${r.erreurs.length ? ` · ERREURS ${r.erreurs.join(' | ')}` : ''}`);
  }
  await b.close();
})().catch((x) => { console.error(x); process.exit(1); });
