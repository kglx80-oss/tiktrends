// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { CIBLE_TACTILE_PX, PRIMITIVES_TACTILES, ZOOM_VUE_SECTION, debordTactile, entreesRail, entreesRailEspace } from '@tiktrends/core';

/**
 * Spatial · les cibles tactiles au téléphone (planche finale · 918 éléments
 * interactifs sous 44 px à 390, l'essentiel issu de `.btn.sm`, des puces, des
 * onglets de sous-navigation, de la cloche et de l'avatar de l'en-tête).
 *
 * La feuille de la maquette est figée · la COQUILLE pose un style en ligne aux
 * primitives, au téléphone seulement. Chaque garde lit d'abord la taille que la
 * feuille donne à la primitive (si la maquette change, la garde le dit), puis
 * le DOM de la vraie coquille montée, téléphone simulé (`matchMedia`).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@tiktrends/db', () => ({ db: undefined, schema: {} }));
let chemin = '/settings';
vi.mock('next/navigation', () => ({ usePathname: () => chemin, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../app/actions/brands', () => ({ setActiveBrand: vi.fn() }));
vi.mock('../app/actions/notifications', () => ({ fetchNotifications: vi.fn(), markAllNotificationsRead: vi.fn(), markNotificationRead: vi.fn() }));
vi.mock('../app/actions/studios/projets', () => ({ listerProjets: vi.fn() }));
vi.mock('../app/actions/jarvis-chat', () => ({ chatThreadAction: vi.fn() }));

const { Coquille } = await import('../spatial/coquille/Coquille');
const { EnTete } = await import('../spatial/communs');
type Donnees = Parameters<typeof Coquille>[0]['donnees'];

const CSS = readFileSync(join(__dirname, '..', 'spatial', 'spatial.css'), 'utf8');
/** Les déclarations d'une règle de la feuille (sélecteur exact, première occurrence). */
const regle = (selecteur: string) => CSS.match(new RegExp(`(?:^|[}\\s])${selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`, 'm'))?.[1] ?? '';
const px = (decl: string, prop: string) => Number(decl.match(new RegExp(`(?:^|;)${prop}:(\\d+(?:\\.\\d+)?)px`))?.[1] ?? NaN);

const ouverts = new Set(['/studio/projets', '/veille', '/adsmap', '/assets', '/jarvis', '/brands', '/settings']);
const marque = { id: 'b1', nom: 'Neva' };
const DONNEES: Donnees = {
  entrees: entreesRail({ ouverts, marque }), espace: entreesRailEspace({ ouverts, marque }),
  marque: { ...marque, logoUrl: null, imageUrl: null }, marques: [{ id: 'b1', nom: 'Neva' }], peutGererMarques: true, admin: true,
  passer: null, railOuvert: false, espaceNom: 'GLX', nonLues: 2, deconnexion: async () => {},
  utilisateur: { nom: 'Kevin', initiales: 'K', email: 'k@x.fr', role: 'Fondateur' }, credits: { solde: 0, dotation: 0, illimite: true },
};

/** Un écran fait des primitives telles que les vues les écrivent. */
function Ecran() {
  return (
    <div className="view">
      <EnTete titre="Accueil" />
      <nav className="seg subnav" aria-label="Sous-sections"><a href="/dashboard" aria-current="page">Accueil</a><a href="/dashboard?vue=analytics">Analytics</a></nav>
      <div className="seg"><button type="button" aria-pressed="true">7 j</button><button type="button">14 j</button></div>
      <a className="btn sm" href="/brands" data-t="btn-lien">Fiche marque</a>
      <button className="btn sm pri" type="button" data-t="btn">Préparer</button>
      <button className="btn sm" type="button" style={{ minHeight: 30 }} data-t="btn-propre">Garde sa valeur</button>
      <button className="chip" type="button" aria-pressed="false" data-t="chip">Stratégie</button>
      <a className="chip" href="/veille/formats" data-t="chip-lien">Classer</a>
      <button className="sw2" type="button" role="switch" aria-checked="true" aria-label="Alertes" data-t="sw2" />
      <button className="tg" type="button" role="switch" aria-checked="false" aria-label="Vendable" data-t="tg"><i /></button>
      <span className="me" data-t="avatar-affiche">K</span>
      <div className="msg me" data-t="bulle"><div className="bub">Bonjour</div></div>
      <span className="btn sm" data-t="btn-inerte">Pas un contrôle</span>
    </div>
  );
}

let telephone = true;
const ecouteurs = new Set<() => void>();
window.matchMedia = ((q: string) => ({
  get matches() { return q === '(max-width: 760px)' && telephone; }, media: q,
  addEventListener: (_: string, f: () => void) => ecouteurs.add(f), removeEventListener: (_: string, f: () => void) => ecouteurs.delete(f),
})) as unknown as typeof window.matchMedia;
const basculer = (t: boolean) => act(() => { telephone = t; ecouteurs.forEach((f) => f()); });

let racine: Root | null = null;
let hote: HTMLElement;
const monter = () => {
  hote = document.createElement('div'); document.body.appendChild(hote);
  act(() => { racine = createRoot(hote); racine.render(<Coquille donnees={DONNEES}><Ecran /></Coquille>); });
  return hote;
};
const el = (t: string) => hote.querySelector(`[data-t="${t}"]`) as HTMLElement;
afterEach(() => { act(() => racine?.unmount()); racine = null; hote?.remove(); telephone = true; chemin = '/settings'; delete document.body.dataset.sec; });

describe('Spatial · cibles tactiles · ce que la maquette dessine (la cause)', () => {
  it('la feuille donne aux primitives une taille sous 44 px · `.btn.sm` 34, cloche 40, avatar 38, interrupteurs 26 et 28', () => {
    expect(px(regle('.btn.sm'), 'min-height'), '`.btn.sm{min-height:34px}` a changé · relire la table des primitives').toBe(34);
    expect(px(regle('.btn'), 'min-height')).toBe(42);
    expect(px(regle('.bell'), 'height')).toBe(40);
    expect(px(regle('.me'), 'height')).toBe(38);
    for (const p of PRIMITIVES_TACTILES) {
      expect(CSS.includes(`${p.selecteur}{`) || CSS.includes(`${p.selecteur},`), `primitive ${p.selecteur} absente de la feuille`).toBe(true);
    }
  });

  it('un interrupteur `deborder` reprend la largeur, la hauteur et le rayon EXACTS de la feuille · sa zone (piste + 2 bordures) atteint 44 px', () => {
    // La feuille compte les bordures dans la taille · la largeur et la hauteur posées doivent les ajouter (sinon la piste s'écrase).
    expect(regle('*'), '`*{box-sizing:border-box}` a changé · relire le mode `deborder`').toBe('box-sizing:border-box');
    for (const p of PRIMITIVES_TACTILES.filter((x) => x.mode === 'deborder')) {
      const d = regle(p.selecteur);
      expect(p.largeur, `${p.selecteur} · largeur de la table ≠ feuille`).toBe(px(d, 'width'));
      expect(p.hauteur, `${p.selecteur} · hauteur de la table ≠ feuille`).toBe(px(d, 'height'));
      expect(p.rayon, `${p.selecteur} · rayon de la table ≠ feuille`).toBe(px(d, 'border-radius'));
      expect(p.hauteur! + 2 * debordTactile(p.hauteur!)).toBeGreaterThanOrEqual(CIBLE_TACTILE_PX);
    }
  });
});

describe('Spatial · cibles tactiles · le zoom de la vue (la maquette réduit trois sections)', () => {
  it('la table des zooms est celle de la feuille · `body[data-sec=…] #win>.view{zoom:…}`', () => {
    const lus: Record<string, number> = {};
    for (const m of CSS.matchAll(/([^{}]*#win>\.view[^{}]*)\{zoom:([\d.]+)\}/g)) {
      for (const s of m[1]!.matchAll(/body\[data-sec=(\w+)\]/g)) lus[s[1]!] = Number(m[2]);
    }
    expect(lus, 'zoom de section de la feuille ≠ ZOOM_VUE_SECTION').toEqual(ZOOM_VUE_SECTION);
  });

  it('dans la Veille (zoom 0,9), une primitive de la vue reçoit 49 px · 44 à l’écran ; la surcouche, hors vue, garde 44', async () => {
    chemin = '/veille';
    monter();
    await act(async () => { await Promise.resolve(); });
    expect(document.body.dataset.sec).toBe('veille');
    expect(el('btn').style.minHeight, 'la Veille zoome la vue à 0,9 · 44 px n’en font que 39,6 à l’écran').toBe('49px');
    expect(el('sw2').style.borderWidth, '26 + 2 × 12 ≥ 49').toBe('12px');
    // Une surcouche (feuille, menu, panneau) vit hors de `#win > .view` · elle n'est pas zoomée.
    const surcouche = document.createElement('button');
    surcouche.className = 'btn sm'; surcouche.textContent = 'Dans une surcouche';
    await act(async () => { document.body.appendChild(surcouche); await Promise.resolve(); });
    try { expect(surcouche.style.minHeight, 'une surcouche n’est pas zoomée · 49 px y feraient 49 à l’écran').toBe('44px'); } finally { surcouche.remove(); }
  });

  it('changer de section repose tout sous le nouveau zoom', async () => {
    monter();
    expect(ZOOM_VUE_SECTION[document.body.dataset.sec ?? ''], 'Réglages · aucune réduction').toBeUndefined();
    expect(el('btn').style.minHeight).toBe('44px');
    await act(async () => { document.body.dataset.sec = 'resultats'; await Promise.resolve(); });
    expect(el('btn').style.minHeight, 'Résultats zoome à 0,95 · 44 / 0,95 → 47').toBe('47px');
  });
});

describe('Spatial · cibles tactiles · la coquille montée au téléphone', () => {
  it('boutons, puces, onglets, segments · 44 px de haut et de large au minimum', () => {
    const h = monter();
    for (const t of ['btn-lien', 'btn', 'chip', 'chip-lien']) {
      expect(el(t).style.minHeight, `${t} sous 44 px au téléphone`).toBe('44px');
      expect(el(t).style.minWidth).toBe('44px');
    }
    const onglets = [...h.querySelectorAll<HTMLElement>('nav.seg.subnav a, div.seg button')];
    expect(onglets).toHaveLength(4);
    for (const o of onglets) expect(o.style.minHeight, `onglet « ${o.textContent} » sous 44 px`).toBe('44px');
    // Un lien n'est pas centré par nature · l'onglet agrandi garde son libellé au milieu.
    expect(h.querySelector<HTMLElement>('nav.seg a')!.style.alignItems).toBe('center');
    // `.chip` est déjà une boîte flexible centrée dans la feuille · rien à ajouter.
    expect(el('chip-lien').style.display).toBe('');
  });

  it('l’en-tête · cloche, avatar et pastille de crédits à 44 px', () => {
    monter();
    for (const id of ['bell', 'me', 'credit']) {
      const e = hote.querySelector<HTMLElement>(`#${id}`)!;
      expect(e, `#${id} absent de l’en-tête`).not.toBeNull();
      expect(e.style.minHeight, `#${id} sous 44 px`).toBe('44px');
      expect(e.style.minWidth).toBe('44px');
    }
  });

  it('les interrupteurs · la zone s’étend par une bordure transparente, le dessin ne bouge pas (fond rogné, marge négative)', () => {
    monter();
    for (const [t, b, r, w, h] of [['sw2', 9, 29, 62, 44], ['tg', 8, 38, 62, 44]] as const) {
      const s = el(t).style;
      expect([s.width, s.height], `${t} · la piste (boîte intérieure) serait écrasée de deux bordures`).toEqual([`${w}px`, `${h}px`]);
      expect(s.borderWidth, `${t} · zone tactile`).toBe(`${b}px`);
      expect(s.borderColor).toBe('transparent');
      expect(s.backgroundClip, `${t} · le fond déborderait dans la zone`).toBe('padding-box');
      expect(s.margin, `${t} · la mise en page bougerait`).toBe(`-${b}px`);
      expect(s.borderRadius).toBe(`${r}px`);
      expect(s.minHeight, `${t} · la piste serait déformée`).toBe('');
    }
  });

  it('rien d’autre n’est touché · avatar affiché, bulle de conversation, classe sur un élément inerte, valeur en ligne de l’écran', () => {
    monter();
    for (const t of ['avatar-affiche', 'bulle', 'btn-inerte']) expect(el(t).getAttribute('style'), `${t} n’est pas un contrôle`).toBeNull();
    expect(el('btn-propre').style.minHeight, 'la valeur en ligne de l’écran prime').toBe('30px');
  });

  it('un contrôle rendu APRÈS l’ouverture (navigation client, liste chargée) reçoit aussi sa cible', async () => {
    monter();
    const b = document.createElement('button');
    b.className = 'btn sm'; b.textContent = 'Arrivé plus tard';
    await act(async () => { hote.querySelector('.view')!.appendChild(b); await Promise.resolve(); });
    expect(b.style.minHeight).toBe('44px');
  });

  it('quitter le format téléphone retire exactement ce qui a été posé', () => {
    monter();
    expect(el('btn').style.minHeight).toBe('44px');
    basculer(false);
    expect(el('btn').getAttribute('style') ?? '', 'un style posé au téléphone reste au bureau').toBe('');
    expect(el('sw2').getAttribute('style') ?? '').toBe('');
    expect(el('btn-propre').style.minHeight, 'la valeur de l’écran ne doit pas être effacée').toBe('30px');
  });
});

describe('Spatial · cibles tactiles · le bureau ne change pas', () => {
  it('au bureau, aucune primitive ne reçoit de style · la parité avec la maquette tient à 1280', () => {
    telephone = false;
    monter();
    for (const t of ['btn-lien', 'btn', 'chip', 'sw2', 'tg']) expect(el(t).getAttribute('style'), `${t} restylé au bureau`).toBeNull();
    expect(hote.querySelector('#bell')!.getAttribute('style')).toBeNull();
  });

  it('le rendu serveur (qui vaut bureau) n’en porte aucune trace', () => {
    const html = renderToStaticMarkup(<Coquille donnees={DONNEES}><Ecran /></Coquille>);
    expect(html).not.toMatch(/min-height:\s*44px|background-clip/);
  });
});

