/**
 * L8-A · mesures exécutées DANS la page (Playwright `page.evaluate`) · JS pur,
 * sans transformation, pour être sérialisable tel quel. Partagé par la garde
 * navigateur locale (`l8a-navigateur.test.ts`) et le script d'inventaire.
 *
 * Ce que chaque mesure constate (un RÉSULTAT à l'écran, jamais un appel) :
 *  · `mesurerPage` · débordement horizontal (`scrollWidth` vs `clientWidth`)
 *    et ses fautifs, cibles interactives sous 44 px, champs sous 16 px,
 *    contraste texte / fond effectif sous AA, contrôles qui se chevauchent ;
 *  · `decrireFocus` · l'élément qui a le focus, son cadre, s'il est VISIBLE
 *    (anneau ou ombre calculés) et s'il n'est pas recouvert.
 */

export function mesurerPage(selecteur = 'main') {
  const racine = document.querySelector(selecteur) ?? document.body;
  // Un dialogue compte s'il est OUVERT à l'écran (un tiroir hors champ, replié, ne compte pas).
  const ouvert = (d) => { const r = d.getBoundingClientRect(); return r.width > 0 && r.right > 0 && r.left < innerWidth && !d.closest('#nav-rail'); };
  const dialogues = [...document.querySelectorAll('[role="dialog"]')].filter(ouvert);
  const dansPortail = (el) => dialogues.some((d) => d.contains(el));
  const cw = document.documentElement.clientWidth;
  const sw = document.documentElement.scrollWidth;
  const nom = (el) => {
    const t = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.getAttribute('name') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const attrs = ['data-action', 'data-bouton', 'data-zone', 'data-panneau', 'data-champ', 'id'].map((a) => (el.getAttribute(a) ? `[${a}=${el.getAttribute(a)}]` : '')).join('');
    return `${el.tagName.toLowerCase()}${attrs} « ${t} »`;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) return false; // <details> fermé, etc.
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none';
  };
  const masqueAccessible = (el) => {
    const s = getComputedStyle(el);
    return s.position === 'absolute' && (s.clip === 'rect(0px, 0px, 0px, 0px)' || (el.getBoundingClientRect().width <= 1 && s.overflow === 'hidden'));
  };

  // 1 · débordement horizontal et fautifs (bord droit au-delà de la fenêtre).
  const fautifs = [];
  for (const el of [...racine.querySelectorAll('*'), ...dialogues.flatMap((d) => [...d.querySelectorAll('*')])]) {
    if (!visible(el) || masqueAccessible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > cw + 1 || r.left < -1) {
      // Un ancêtre qui coupe (overflow hidden/auto) neutralise le débordement.
      let coupe = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.overflowX !== 'visible') { const ra = a.getBoundingClientRect(); if (ra.right <= cw + 1 && ra.left >= -1) { coupe = true; break; } }
      }
      if (!coupe) fautifs.push({ el: nom(el), gauche: Math.round(r.left), droite: Math.round(r.right) });
    }
  }

  // 2 · cibles interactives.
  const interactifs = [...racine.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=radio], [role=tab], [role=checkbox], [tabindex]:not([tabindex="-1"])')]
    .filter((el) => visible(el) && !masqueAccessible(el))
    .concat(dialogues.flatMap((d) => [...d.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea')]).filter((el) => visible(el) && !racine.contains(el)));
  const cibles = [];
  for (const el of interactifs) {
    const r = el.getBoundingClientRect();
    const type = el.getAttribute('type');
    // Case ou radio : la cible est le LIBELLÉ qui l'entoure (WCAG 2.5.8).
    let cadre = r;
    if ((type === 'checkbox' || type === 'radio') && el.closest('label')) cadre = el.closest('label').getBoundingClientRect();
    if (cadre.height < 44 - 0.5 || cadre.width < 44 - 0.5) {
      const enLigne = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
      cibles.push({ el: nom(el), largeur: Math.round(cadre.width), hauteur: Math.round(cadre.height), enLigne });
    }
  }

  // 3 · champs sous 16 px (zoom forcé sur téléphone).
  const champs = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=color]), select, textarea')]
    .filter((el) => visible(el) && (racine.contains(el) || dansPortail(el)))
    .map((el) => ({ el: nom(el), taille: parseFloat(getComputedStyle(el).fontSize) }))
    .filter((c) => c.taille < 16);

  // 4 · contraste du texte sur son fond EFFECTIF (ancêtres composés).
  const rgba = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const sur = (haut, bas) => { const a = haut[3]; return [haut[0] * a + bas[0] * (1 - a), haut[1] * a + bas[1] * (1 - a), haut[2] * a + bas[2] * (1 - a), 1]; };
  const fondsDe = (el) => {
    // Pile des fonds de l'élément vers la racine · un dégradé donne ses arrêts (le pire compte).
    const pile = [];
    for (let a = el; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      const img = s.backgroundImage;
      if (img && img.includes('gradient')) {
        const arrets = [...img.matchAll(/rgba?\([^)]+\)/g)].map((m) => rgba(m[0]));
        if (arrets.length) { pile.push({ arrets }); break; }
      }
      const c = rgba(s.backgroundColor);
      if (c && c[3] > 0) { pile.push({ arrets: [c] }); if (c[3] >= 1) break; }
    }
    let fonds = [[18, 8, 16, 1]];
    for (const couche of pile.reverse()) fonds = couche.arrets.flatMap((c) => fonds.map((f) => sur(c, f)));
    return fonds;
  };
  const contrastes = [];
  const vus = new Set();
  const marche = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const garde = (el) => racine.contains(el) || dansPortail(el);
  for (let n = marche.nextNode(); n; n = marche.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || vus.has(el) || !garde(el) || !visible(el) || masqueAccessible(el)) continue;
    vus.add(el);
    if (el.closest('[data-surface="document"]')) continue; // le CONTENU du visuel édité, pas l'interface
    if (el.closest('[disabled], [aria-disabled="true"]')) continue; // contrôle inactif : exempté (WCAG 1.4.3)
    const s = getComputedStyle(el);
    const c = rgba(s.color);
    if (!c) continue;
    let opacite = 1;
    for (let a = el; a; a = a.parentElement) opacite *= Number(getComputedStyle(a).opacity);
    const fonds = fondsDe(el);
    const pire = Math.min(...fonds.map((f) => ratio(sur([c[0], c[1], c[2], c[3] * opacite], f), f)));
    const taille = parseFloat(s.fontSize);
    const gras = Number(s.fontWeight) >= 700;
    const seuil = taille >= 24 || (gras && taille >= 18.66) ? 3 : 4.5;
    if (pire < seuil) contrastes.push({ el: nom(el), ratio: Math.round(pire * 100) / 100, seuil, couleur: s.color, taille });
  }

  // 5 · contrôles qui se chevauchent (collision).
  const collisions = [];
  // Une fenêtre modale ouverte masque le fond : seules ses commandes comptent.
  const modale = dialogues.find((d) => d.getAttribute('aria-modal') === 'true');
  // Cadre VISIBLE · coupé par les ancêtres qui défilent ou masquent (une liste à défilement interne ne déborde pas).
  const cadreVisible = (el) => {
    const r = el.getBoundingClientRect();
    let g = r.left; let h = r.top; let d = r.right; let b = r.bottom;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const st = getComputedStyle(a);
      if (st.overflowX !== 'visible' || st.overflowY !== 'visible') {
        const ra = a.getBoundingClientRect();
        g = Math.max(g, ra.left); h = Math.max(h, ra.top); d = Math.min(d, ra.right); b = Math.min(b, ra.bottom);
      }
    }
    return { left: g, top: h, right: d, bottom: b };
  };
  const boites = interactifs.filter((el) => !modale || modale.contains(el)).map((el) => ({ el, r: cadreVisible(el) })).filter((x) => x.r.right > x.r.left && x.r.bottom > x.r.top);
  for (let i = 0; i < boites.length; i++) {
    for (let j = i + 1; j < boites.length; j++) {
      const a = boites[i]; const b = boites[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (a.el.closest('label') && a.el.closest('label') === b.el.closest('label')) continue;
      const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (x > 2 && y > 2) collisions.push(`${nom(a.el)} × ${nom(b.el)}`);
    }
  }
  return { largeur: cw, sw, cw, deborde: sw > cw, fautifs: fautifs.slice(0, 12), cibles, champs, contrastes, collisions: collisions.slice(0, 12) };
}

export function decrireFocus(selecteur = 'main') {
  const el = document.activeElement;
  const racine = document.querySelector(selecteur);
  if (!el || el === document.body || el === document.documentElement) return { perdu: true };
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  const anneau = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 1;
  const ombre = s.boxShadow && s.boxShadow !== 'none';
  // Recouvert = ENTIÈREMENT caché (WCAG 2.4.11 AA) : cinq points du cadre, tous sous un autre élément.
  const points = [[0.5, 0.5], [0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]].map(([px, py]) => [r.left + r.width * px, r.top + r.height * py])
    .filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight);
  const couvert = ([x, y]) => {
    const d = document.elementFromPoint(x, y);
    return !!d && d !== el && !el.contains(d) && !d.contains(el) && !(el.labels && [...el.labels].some((l) => l.contains(d)));
  };
  const recouvert = points.length > 0 && points.every(couvert);
  const t = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.id || '').replace(/\s+/g, ' ').trim().slice(0, 50);
  const dansDialogue = !!el.closest('[role="dialog"]');
  return {
    perdu: false, horsZone: !!racine && !racine.contains(el) && !dansDialogue, tag: el.tagName.toLowerCase(), texte: t, dansDialogue,
    haut: Math.round(r.top + scrollY), gauche: Math.round(r.left), hauteur: Math.round(r.height),
    visible: anneau || ombre, recouvert, dansFenetre: r.bottom > 0 && r.top < innerHeight,
  };
}
