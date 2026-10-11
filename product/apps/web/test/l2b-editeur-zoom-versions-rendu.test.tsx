// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Lot 2b · l'éditeur monté dans un DOM (jsdom) · zoom de la zone de travail et
 * restauration d'une version, pilotés comme un humain (clic, glisser,
 * raccourcis). On lit ce qui SORT : la largeur affichée du document, la
 * position du calque après un glisser (en % du document), le statut, les
 * arguments RÉELS reçus par les actions serveur.
 *
 * jsdom ne fait aucune mise en page : la zone reçoit une taille (497 × 516, la
 * zone mesurée à 1440 px sur le banc) et le cadre du document rend la largeur
 * que l'écran lui a DONNÉE (style de son conteneur) · si le zoom affiché et la
 * conversion écran → document se contredisaient, le glisser tomberait faux.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => ({ enregistrer: vi.fn(), relire: vi.fn(), lister: vi.fn(), apercu: vi.fn(), restaurer: vi.fn() }));
vi.mock('../app/actions/studios/projets', () => ({ enregistrerDocument: m.enregistrer }));
vi.mock('../lib/studios/editeur/actions', () => ({
  relireDocumentEditeur: m.relire, listerVersionsDocument: m.lister, apercuVersionDocument: m.apercu, restaurerVersionDocument: m.restaurer,
}));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: unknown }) => <a href={href} {...(r as object)}>{children as never}</a> }));

import { erreurStudio, type ContenuVersion } from '@tiktrends/core';
import { EditeurCalques, type PropsEditeur } from '../components/studios/editeur/EditeurCalques';
import { contenuVideo, documentStudio, copie } from '../../../packages/core/test/studios-fixtures';

const ZONE = { largeur: 497, hauteur: 516 };
const restaurerProto: Array<() => void> = [];
beforeAll(() => {
  const proto = window.HTMLElement.prototype;
  const garder = (k: string) => { const d = Object.getOwnPropertyDescriptor(proto, k) ?? Object.getOwnPropertyDescriptor(window.Element.prototype, k); restaurerProto.push(() => { if (d) Object.defineProperty(proto, k, d); else delete (proto as unknown as Record<string, unknown>)[k]; }); };
  for (const k of ['offsetParent', 'clientWidth', 'clientHeight', 'getBoundingClientRect']) garder(k);
  Object.defineProperty(proto, 'offsetParent', { configurable: true, get(this: HTMLElement) { return this.parentNode as Element | null; } });
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get(this: HTMLElement) { return this.hasAttribute('data-zone-travail') ? ZONE.largeur : 0; } });
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get(this: HTMLElement) { return this.hasAttribute('data-zone-travail') ? ZONE.hauteur : 0; } });
  Object.defineProperty(proto, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement) {
      // Le cadre du document a la largeur que l'écran a posée sur son conteneur (aucune mise en page dans jsdom).
      const w = this.getAttribute('data-surface') === 'document' ? parseFloat(this.parentElement?.style.width ?? '') || 0 : 0;
      return { x: 0, y: 0, left: 0, top: 0, right: w, bottom: 0, width: w, height: 0, toJSON() { return this; } };
    },
  });
});
afterAll(() => { for (const r of restaurerProto) r(); });

let conteneur: HTMLDivElement;
let racine: Root | null = null;
beforeEach(() => { for (const f of Object.values(m)) f.mockReset(); window.localStorage.clear(); });
afterEach(() => {
  if (racine) act(() => racine!.unmount());
  racine = null;
  conteneur?.remove();
});

const PROPS = (o: Partial<PropsEditeur> = {}): PropsEditeur => ({
  projet: { id: 'p1', titre: 'Sérum · visuel', marque: 'Marque A1' },
  version: { id: 'v4', n: 4 },
  contenu: contenuVideo(),
  document: documentStudio(),
  formatPropose: { format: '4:5', depuisBrief: false, texte: null },
  produit: null,
  medias: [],
  apercus: {},
  peutEnregistrer: true,
  ...o,
});

function monter(p: PropsEditeur) {
  conteneur = document.createElement('div');
  document.body.appendChild(conteneur);
  racine = createRoot(conteneur);
  act(() => racine!.render(<EditeurCalques {...p} />));
}
const q = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const texte = (sel: string) => q(sel)?.textContent ?? null;
const bouton = (libelle: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === libelle || b.getAttribute('aria-label') === libelle) as HTMLButtonElement;
const cliquer = async (b: HTMLElement) => { await act(async () => { b.focus(); b.click(); }); };
const zoomAffiche = () => texte('[data-zoom-valeur]');
const largeurCadre = () => parseFloat(q('[data-surface="document"]').parentElement!.style.width);
const touche = (key: string, o: KeyboardEventInit = {}, cible: EventTarget = document.body) => {
  const e = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...o });
  act(() => { cible.dispatchEvent(e); });
  return e;
};
const pointeur = (el: Element, type: string, clientX: number, clientY: number) => act(() => {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY }));
});
const titre = () => q('[data-calque="l_titre"]');

describe('zoom · état d’affichage, juste à tout niveau', () => {
  it('ouverture « Ajuster » · le document entier dans la zone mesurée (36 %), sans rien à enregistrer', () => {
    monter(PROPS());
    expect(q('[data-zone-travail]').getAttribute('data-mode-zoom')).toBe('ajuste');
    expect(zoomAffiche()).toBe('36 %');
    expect(largeurCadre()).toBeCloseTo(1080 * ((ZONE.hauteur - 32) / 1350), 6);
    expect(bouton('Ajuster').getAttribute('aria-pressed')).toBe('true');
    expect(texte('[data-statut]')).toBe('Enregistré');
  });

  it('+, −, 100 %, Ajuster · la largeur affichée suit les paliers ; document, historique et versions ne bougent pas', async () => {
    monter(PROPS());
    await cliquer(bouton('Zoom avant'));
    expect(zoomAffiche()).toBe('50 %');
    expect(largeurCadre()).toBe(540);
    await cliquer(bouton('Zoom avant'));
    expect(zoomAffiche()).toBe('67 %');
    await cliquer(q('[data-zoom-action="reelle"]'));
    expect(zoomAffiche()).toBe('100 %');
    expect(largeurCadre()).toBe(1080);
    await cliquer(bouton('Zoom arrière'));
    expect(zoomAffiche()).toBe('75 %');
    expect(bouton('Ajuster').getAttribute('aria-pressed')).toBe('false');
    await cliquer(bouton('Ajuster'));
    expect(zoomAffiche()).toBe('36 %');
    // Le zoom n'est ni une modification, ni une étape d'historique, ni une version.
    expect(texte('[data-statut]')).toBe('Enregistré');
    expect(bouton('Annuler').getAttribute('aria-disabled')).toBe('true');
    expect(titre().style.left).toBe(`${(60 / 1080) * 100}%`);
    expect(m.enregistrer).not.toHaveBeenCalled();
  });

  it('glisser 100 px d’écran à 50 % · le calque avance de 200 px du document ; à 100 %, de 100 px', async () => {
    monter(PROPS());
    await cliquer(bouton('Zoom avant'));
    expect(zoomAffiche()).toBe('50 %');
    pointeur(titre(), 'pointerdown', 100, 100);
    pointeur(q('[data-surface="document"]'), 'pointermove', 200, 130);
    pointeur(q('[data-surface="document"]'), 'pointerup', 200, 130);
    expect(titre().style.left).toBe(`${((60 + 200) / 1080) * 100}%`);
    expect(titre().style.top).toBe(`${((80 + 60) / 1350) * 100}%`);
    expect(texte('[data-statut]')).toBe('Modifications non enregistrées');
    await cliquer(bouton('Annuler'));
    expect(titre().style.left).toBe(`${(60 / 1080) * 100}%`);

    await cliquer(q('[data-zoom-action="reelle"]'));
    pointeur(titre(), 'pointerdown', 100, 100);
    pointeur(q('[data-surface="document"]'), 'pointermove', 200, 100);
    pointeur(q('[data-surface="document"]'), 'pointerup', 200, 100);
    expect(titre().style.left).toBe(`${((60 + 100) / 1080) * 100}%`);
  });

  it('raccourcis · Ctrl+= et Ctrl+− par paliers, Ctrl+0 ajuste ; DANS un champ, l’éditeur ne prend pas la touche', async () => {
    monter(PROPS());
    expect(touche('=').defaultPrevented).toBe(true);
    expect(zoomAffiche()).toBe('50 %');
    touche('-', { metaKey: true, ctrlKey: false });
    expect(zoomAffiche()).toBe('33 %');
    touche('à', { code: 'Digit0' });
    expect(q('[data-zone-travail]').getAttribute('data-mode-zoom')).toBe('ajuste');
    // Saisie · on choisit le titre et on tape dans son texte.
    await cliquer([...document.querySelectorAll('button[aria-pressed]')].find((b) => b.getAttribute('aria-label')?.startsWith('Texte · Titre')) as HTMLElement);
    const zone = q<HTMLTextAreaElement>('[data-champ="texte"]');
    act(() => zone.focus());
    const e = touche('-', {}, zone);
    expect(e.defaultPrevented).toBe(false);
    expect(zoomAffiche()).toBe('36 %');
  });
});

/* ───────────────────────────── Versions ───────────────────────────────── */

const LISTE = [
  { id: 'v4', n: 4, creeLe: '2026-10-11T09:28:00.000Z', auteur: 'Toi', raison: 'Éditeur de calques · Déplacer « Titre »', courante: true },
  { id: 'v2', n: 2, creeLe: '2026-10-11T09:20:00.000Z', auteur: 'Léa', raison: 'Éditeur de calques · Création du document', courante: false },
];
const APERCU_V2 = {
  version: { id: 'v2', n: 2 }, courante: { id: 'v4', n: 4 }, document: documentStudio(), documentIllisible: false, apercus: {},
  comparaison: { phrases: ['Calque « Titre » · position horizontale : 300 px → 60 px'], tronquee: false },
};
const ouvrirV2 = async () => {
  await cliquer(q('[data-barre="zoom"] [data-action="versions"]'));
  await act(async () => { await Promise.resolve(); });
  await cliquer(q('[data-comparer="2"]'));
  await act(async () => { await Promise.resolve(); });
};

describe('versions · auteur, date, aperçu, comparaison, restauration NON destructive', () => {
  it('liste et détail · ce qui va se passer est écrit AVANT le clic', async () => {
    m.lister.mockResolvedValue({ ok: true, versions: LISTE });
    m.apercu.mockResolvedValue({ ok: true, apercu: APERCU_V2 });
    monter(PROPS());
    await ouvrirV2();
    expect(m.lister).toHaveBeenCalledWith('p1');
    expect(m.apercu).toHaveBeenCalledWith({ projectId: 'p1', versionId: 'v2' });
    const ligne = q('[data-version-n="2"]');
    expect(ligne.textContent).toContain('Léa');
    expect(ligne.textContent).toContain('Création du document');
    expect(q('[data-version-n="4"] [data-courante]')?.textContent).toBe('Courante');
    expect(q('[data-detail-version="2"] [data-apercu-version] [data-surface="document"]')).not.toBeNull();
    expect(texte('[data-comparaison]')).toContain('Calque « Titre » · position horizontale : 300 px → 60 px');
    expect(texte('[data-annonce-restauration]')).toBe('Restaurer crée la version 5, copie exacte de la version 2 (document, brief et références). Les versions 1 à 4 restent dans l’historique, rien n’est effacé · pour revenir en arrière, restaure la version 4.');
    expect(q('[data-action="restaurer"]').getAttribute('aria-disabled')).toBe('false');
  });

  it('« Restaurer » · l’action reçoit des IDENTIFIANTS (jamais un contenu) et la base ; l’éditeur passe à la nouvelle version', async () => {
    const doc2 = copie(documentStudio());
    (doc2.layers.l_titre as { text: string }).text = 'Texte de la version 2';
    const contenu: ContenuVersion = { ...contenuVideo(), document: doc2 };
    m.lister.mockResolvedValue({ ok: true, versions: LISTE });
    m.apercu.mockResolvedValue({ ok: true, apercu: { ...APERCU_V2, document: doc2 } });
    m.restaurer.mockResolvedValue({ ok: true, version: { id: 'v5', n: 5 }, restauree: { id: 'v2', n: 2 }, contenu, document: doc2 });
    monter(PROPS());
    await ouvrirV2();
    await cliquer(q('[data-action="restaurer"]'));
    await act(async () => { await Promise.resolve(); });
    expect(m.restaurer).toHaveBeenCalledTimes(1);
    expect(m.restaurer.mock.calls[0]![0]).toEqual({ projectId: 'p1', versionId: 'v2', baseVersionId: 'v4' });
    expect(texte('[data-etat="restauree"]')).toBe('Version 2 restaurée · c’est maintenant la version 5. La version 4 reste dans l’historique.');
    expect(document.body.textContent).toContain('version 5');
    expect(texte('[data-surface="document"] [data-calque="l_titre"] [data-texte="editable"]')).toBe('Texte de la version 2');
    expect(texte('[data-statut]')).toBe('Enregistré');
    expect(bouton('Annuler').getAttribute('aria-disabled')).toBe('true');
    expect(m.enregistrer).not.toHaveBeenCalled();
  });

  it('modifications non enregistrées · restauration refusée avec la raison, aucun appel', async () => {
    m.lister.mockResolvedValue({ ok: true, versions: LISTE });
    m.apercu.mockResolvedValue({ ok: true, apercu: APERCU_V2 });
    monter(PROPS());
    await cliquer([...document.querySelectorAll('button[aria-pressed]')].find((b) => b.getAttribute('aria-label')?.startsWith('Texte · Titre')) as HTMLElement);
    touche('ArrowRight', { ctrlKey: false }, q('[data-surface="document"]'));
    expect(texte('[data-statut]')).toBe('Modifications non enregistrées');
    await ouvrirV2();
    expect(q('[data-action="restaurer"]').getAttribute('aria-disabled')).toBe('true');
    expect(texte('[data-refus-restauration]')).toBe('Tu as des modifications non enregistrées · enregistre-les ou annule-les avant de restaurer.');
    await cliquer(q('[data-action="restaurer"]'));
    expect(m.restaurer).not.toHaveBeenCalled();
  });

  it('409 · une autre session a enregistré entre-temps : rien n’est restauré, l’éditeur reste sur sa version', async () => {
    m.lister.mockResolvedValue({ ok: true, versions: LISTE });
    m.apercu.mockResolvedValue({ ok: true, apercu: APERCU_V2 });
    m.restaurer.mockResolvedValue(erreurStudio('VERSION_CONFLICT', { traceId: 't1', conflit: { versionCouranteId: 'v9', differences: [] } }));
    monter(PROPS());
    await ouvrirV2();
    await cliquer(q('[data-action="restaurer"]'));
    await act(async () => { await Promise.resolve(); });
    expect(document.querySelector('[data-detail-version="2"] [role="alert"]')?.textContent).toBe('Une autre session a enregistré une version entre-temps · rien n’a été restauré. Recharge la page pour partir de la version courante, puis recommence.');
    expect(document.body.textContent).toContain('version 4');
    expect(q('[data-etat="restauree"]')).toBeNull();
  });

  it('lecture seule · la liste et l’aperçu restent, la restauration est refusée', async () => {
    m.lister.mockResolvedValue({ ok: true, versions: LISTE });
    m.apercu.mockResolvedValue({ ok: true, apercu: APERCU_V2 });
    monter(PROPS({ peutEnregistrer: false }));
    await ouvrirV2();
    expect(texte('[data-refus-restauration]')).toBe('Ton rôle permet de consulter les versions, pas de les restaurer.');
    expect(q('[data-action="restaurer"]').getAttribute('aria-disabled')).toBe('true');
  });
});
