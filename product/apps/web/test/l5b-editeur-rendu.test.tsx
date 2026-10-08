// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * L5-B · l'écran de l'éditeur de calques, monté dans un DOM (jsdom) et piloté
 * comme un humain : clic, saisie, Entrée, raccourcis, Échap. On lit le HTML
 * rendu (texte affiché, position en %, statut en mots), les arguments RÉELS
 * reçus par l'action d'enregistrement, le focus et le stockage local.
 *
 * jsdom ne fait aucune mise en page · `offsetParent` est rétabli sur les nœuds
 * attachés (comme `piege-focus.test.tsx`) pour que le piège à focus voie les
 * boutons.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => ({ enregistrer: vi.fn(), relire: vi.fn() }));
vi.mock('../app/actions/studios/projets', () => ({ enregistrerDocument: m.enregistrer }));
vi.mock('../lib/studios/editeur/actions', () => ({ relireDocumentEditeur: m.relire }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: unknown }) => <a href={href} {...(r as object)}>{children as never}</a> }));

import { erreurStudio } from '@tiktrends/core';
import { EditeurCalques, type PropsEditeur } from '../components/studios/editeur/EditeurCalques';
import { cleSauvegarde } from '../components/studios/editeur/sauvegarde-locale';
import { contenuVideo, documentStudio, copie } from '../../../packages/core/test/studios-fixtures';

let offsetOrigine: PropertyDescriptor | undefined;
beforeAll(() => {
  offsetOrigine = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', { configurable: true, get(this: HTMLElement) { return this.parentNode as Element | null; } });
});
afterAll(() => { if (offsetOrigine) Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', offsetOrigine); });

let conteneur: HTMLDivElement;
let racine: Root | null = null;
beforeEach(() => {
  m.enregistrer.mockReset();
  m.relire.mockReset();
  window.localStorage.clear();
});
afterEach(() => {
  if (racine) act(() => racine!.unmount());
  racine = null;
  conteneur?.remove();
  vi.useRealTimers();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

const PROPS = (o: Partial<PropsEditeur> = {}): PropsEditeur => ({
  projet: { id: 'p1', titre: 'Sérum · visuel', marque: 'Marque A1' },
  version: { id: 'v1', n: 1 },
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
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T & Element>(sel) as unknown as T;
const texte = (sel: string) => q(sel)?.textContent ?? null;
const bouton = (libelle: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === libelle || b.getAttribute('aria-label') === libelle) as HTMLButtonElement;
const cliquer = async (b: HTMLElement) => { await act(async () => { b.focus(); b.click(); }); };
const saisir = (el: HTMLInputElement | HTMLTextAreaElement, valeur: string) => act(() => {
  el.focus();
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, valeur);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const quitter = (el: HTMLElement) => act(() => { el.blur(); });
const entree = (el: HTMLElement) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
const raccourci = (key: string, o: KeyboardEventInit = {}) => act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, ...o })); });
const champ = (label: string) => {
  const l = [...document.querySelectorAll('label')].find((x) => x.textContent === label)!;
  return document.getElementById(l.htmlFor) as HTMLInputElement;
};
const titre = () => q('[data-calque="l_titre"]');
const choisirTitre = () => cliquer([...document.querySelectorAll('button[aria-pressed]')].find((b) => b.getAttribute('aria-label')?.startsWith('Texte · Titre')) as HTMLElement);
const versionOk = (id: string, n: number) => ({ ok: true, inchange: false, version: { id, n } });

describe('éditer · le texte reste du texte, chaque geste se voit, annuler/rétablir par bouton ET raccourci', () => {
  it('rendu initial · texte HTML, média sans aperçu en cadre nommé, statut « Enregistré », rien à enregistrer', () => {
    monter(PROPS());
    expect(texte('[data-calque="l_titre"] [data-texte="editable"]')).toBe('Peau nette en 7 jours');
    expect(q('[data-surface="document"]').querySelectorAll('img').length).toBe(0);
    expect(texte('[data-calque="l_fond"] [data-apercu="absent"]')).toBe('FondImage · aperçu indisponible');
    expect(texte('[data-statut]')).toBe('Enregistré');
    // Inactifs mais FOCALISABLES · `disabled` ferait perdre le focus (vu dans Chromium, pas dans jsdom).
    for (const l of ['Enregistrer', 'Annuler', 'Rétablir']) {
      expect(bouton(l).getAttribute('aria-disabled'), l).toBe('true');
      expect(bouton(l).hasAttribute('disabled'), `${l} porte disabled · il perdrait le focus`).toBe(false);
    }
  });

  it('IMG-07 · changer le texte et déplacer le CTA · l’aperçu suit, le calque reste un texte, aucune génération annoncée', async () => {
    monter(PROPS());
    await choisirTitre();
    expect(texte('#titre-proprietes')).toBe('Texte · Titre');
    const zone = q<HTMLTextAreaElement>('[data-champ="texte"]');
    saisir(zone, 'Corrige seulement le CTA');
    quitter(zone);
    expect(texte('[data-calque="l_titre"] [data-texte="editable"]')).toBe('Corrige seulement le CTA');
    expect(titre().getAttribute('data-type')).toBe('text');
    const x = champ('X');
    saisir(x, '300');
    entree(x);
    expect(titre().style.left).toBe(`${(300 / 1080) * 100}%`);
    expect(texte('[data-statut]')).toBe('Modifications non enregistrées');
    expect(texte('[data-impact]')).toBe('Aucune génération d’image · ces modifications ne demandent qu’une recomposition du visuel.');
    const police = [...document.querySelectorAll('select')][0] as HTMLSelectElement;
    act(() => { police.value = 'sans-gras'; police.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(q<HTMLElement>('[data-calque="l_titre"] [data-texte="editable"]').style.fontWeight).toBe('700');
  });

  it('IMG-08 · annuler et rétablir · bouton, Ctrl+Z, Ctrl+Maj+Z, Ctrl+Y · le statut revient à « Enregistré »', async () => {
    monter(PROPS());
    await choisirTitre();
    const zone = q<HTMLTextAreaElement>('[data-champ="texte"]');
    saisir(zone, 'Nouveau CTA');
    quitter(zone);
    const x = champ('X');
    saisir(x, '300');
    entree(x);
    await cliquer(bouton('Annuler'));
    expect(titre().style.left).toBe(`${(60 / 1080) * 100}%`);
    expect(texte('[data-calque="l_titre"] [data-texte="editable"]')).toBe('Nouveau CTA');
    raccourci('z');
    expect(texte('[data-calque="l_titre"] [data-texte="editable"]')).toBe('Peau nette en 7 jours');
    expect(texte('[data-statut]')).toBe('Enregistré');
    raccourci('z', { shiftKey: true });
    expect(texte('[data-calque="l_titre"] [data-texte="editable"]')).toBe('Nouveau CTA');
    raccourci('y');
    expect(titre().style.left).toBe(`${(300 / 1080) * 100}%`);
    expect(bouton('Annuler').getAttribute('aria-keyshortcuts')).toBe('Control+Z Meta+Z');
  });

  it('un raccourci tapé DANS un champ reste l’annuler natif du champ (le document ne bouge pas)', async () => {
    monter(PROPS());
    await choisirTitre();
    const zone = q<HTMLTextAreaElement>('[data-champ="texte"]');
    saisir(zone, 'abc');
    quitter(zone);
    act(() => { zone.focus(); zone.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); });
    expect(texte('[data-calque="l_titre"] [data-texte="editable"]')).toBe('abc');
  });

  it('calque verrouillé · champs figés, message, suppression impossible ; déverrouiller rend la main', async () => {
    monter(PROPS());
    await cliquer([...document.querySelectorAll('button[aria-pressed]')].find((b) => b.getAttribute('aria-label')?.startsWith('Logo · Logo')) as HTMLElement);
    expect(document.body.textContent).toContain('Calque verrouillé · il ne bouge pas et son contenu ne change pas.');
    expect(champ('X').disabled).toBe(true);
    expect(bouton('Supprimer').disabled).toBe(true);
    await cliquer(bouton('Déverrouiller'));
    expect(champ('X').disabled).toBe(false);
  });
});

describe('enregistrer · patch base → présent, version suivante, 409 sans écrasement', () => {
  it('« Enregistrer » envoie le patch sur identifiants stables et la version de base ; la suivante part de la nouvelle', async () => {
    m.enregistrer.mockResolvedValueOnce(versionOk('v2', 2)).mockResolvedValueOnce(versionOk('v3', 3));
    monter(PROPS());
    await choisirTitre();
    const x = champ('X');
    saisir(x, '300');
    entree(x);
    await cliquer(bouton('Enregistrer'));
    expect(m.enregistrer).toHaveBeenCalledTimes(1);
    const arg = m.enregistrer.mock.calls[0]![0];
    expect(arg).toMatchObject({ projectId: 'p1', baseVersionId: 'v1' });
    expect(arg.changes.map((c: { op: string; path: string; newValue: unknown }) => [c.op, c.path, c.newValue])).toEqual([['replace', '/document/layers/l_titre/x', 300]]);
    expect(texte('[data-statut]')).toBe('Enregistré');
    expect(document.body.textContent).toContain('version 2');
    saisir(champ('Y'), '500');
    entree(champ('Y'));
    raccourci('s');
    await act(async () => { await Promise.resolve(); });
    expect(m.enregistrer.mock.calls[1]![0]).toMatchObject({ baseVersionId: 'v2' });
    expect(m.enregistrer.mock.calls[1]![0].changes.map((c: { path: string }) => c.path)).toEqual(['/document/layers/l_titre/y']);
  });

  it('FLOW-06 · 409 · dialogue avec les différences en mots, focus piégé ; « Recharger et réappliquer » rejoue sur la courante et rend le focus', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const courant = copie(documentStudio());
    (courant.layers.l_titre as { color: string }).color = '#ff0000';
    m.enregistrer
      .mockResolvedValueOnce(erreurStudio('VERSION_CONFLICT', { traceId: 't1', conflit: { versionCouranteId: 'v3', differences: [{ chemin: '/document/layers/l_titre/color', base: '#111111', courant: '#ff0000' }] } }))
      .mockResolvedValueOnce(versionOk('v4', 4));
    m.relire.mockResolvedValue({ ok: true, version: { id: 'v3', n: 3 }, document: courant });
    monter(PROPS());
    await choisirTitre();
    saisir(champ('X'), '300');
    entree(champ('X'));
    const enregistrer = bouton('Enregistrer');
    await cliquer(enregistrer);
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    const dialogue = q('[data-dialogue="conflit"]');
    expect(dialogue).not.toBeNull();
    expect(texte('[data-differences]')).toBe('Calque « Titre » · couleur du texte : « #111111 » → « #ff0000 »');
    expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull();
    expect(texte('[data-statut]')).toBe('Conflit · une autre session a enregistré');
    expect(enregistrer.hasAttribute('disabled'), 'Enregistrer porte disabled pendant le conflit · le focus rendu tomberait sur <body>').toBe(false);
    const reapp = bouton('Recharger et réappliquer mes modifications');
    expect(reapp.disabled).toBe(false);
    await cliquer(reapp);
    expect(q('[data-dialogue="conflit"]')).toBeNull();
    expect(document.activeElement).toBe(enregistrer);
    expect(texte('[data-statut]')).toBe('Modifications non enregistrées');
    expect(q<HTMLElement>('[data-calque="l_titre"] [data-texte="editable"]').style.color).toBe('rgb(255, 0, 0)');
    expect(titre().style.left).toBe(`${(300 / 1080) * 100}%`);
    await cliquer(bouton('Enregistrer'));
    expect(m.enregistrer.mock.calls[1]![0]).toMatchObject({ baseVersionId: 'v3' });
    expect(m.enregistrer.mock.calls[1]![0].changes.map((c: { path: string }) => c.path)).toEqual(['/document/layers/l_titre/x']);
  });

  it('FLOW-06 · même champ des deux côtés · réappliquer impossible ; « Recharger » montre la courante, la copie de secours garde mes modifications', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const courant = copie(documentStudio());
    (courant.layers.l_titre as { x: number }).x = 10;
    m.enregistrer.mockResolvedValueOnce(erreurStudio('VERSION_CONFLICT', { traceId: 't2', conflit: { versionCouranteId: 'v3', differences: [{ chemin: '/document/layers/l_titre/x', base: 60, courant: 10 }] } }));
    m.relire.mockResolvedValue({ ok: true, version: { id: 'v3', n: 3 }, document: courant });
    monter(PROPS());
    await choisirTitre();
    saisir(champ('X'), '300');
    entree(champ('X'));
    await cliquer(bouton('Enregistrer'));
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(bouton('Recharger et réappliquer mes modifications').disabled).toBe(true);
    expect(texte('[data-dialogue="conflit"]')).toContain('Tes modifications touchent les mêmes éléments');
    await cliquer(bouton('Recharger la version courante'));
    expect(titre().style.left).toBe(`${(10 / 1080) * 100}%`);
    expect(texte('[data-statut]')).toBe('Enregistré');
    expect(document.body.textContent).toContain('version 3');
    const s = JSON.parse(window.localStorage.getItem(cleSauvegarde('p1'))!);
    expect(s.document.layers.l_titre.x).toBe(300);
    expect(q('[data-etat="copie-secours"]')?.textContent).toContain('faites sur la version 1');
  });

  it('échec réseau · message utile, valeurs conservées, « Réessayer »', async () => {
    m.enregistrer.mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce(versionOk('v2', 2));
    monter(PROPS());
    await choisirTitre();
    saisir(champ('X'), '300');
    entree(champ('X'));
    await cliquer(bouton('Enregistrer'));
    expect(texte('[data-etat="erreur"]')).toContain('Le serveur ne répond pas');
    expect(texte('[data-statut]')).toBe('Échec de l’enregistrement · modifications conservées');
    expect(titre().style.left).toBe(`${(300 / 1080) * 100}%`);
    await cliquer(bouton('Réessayer'));
    expect(texte('[data-statut]')).toBe('Enregistré');
  });
});

describe('états · vide, lecture seule, copie de secours, téléphone', () => {
  it('aucun document · créer au format du brief = un seul replace /document, puis l’éditeur s’ouvre', async () => {
    m.enregistrer.mockResolvedValueOnce(versionOk('v2', 2));
    monter(PROPS({ document: null, formatPropose: { format: '9:16', depuisBrief: true, texte: 'Story 9:16' } }));
    expect(texte('[data-format-source]')).toBe('Format lu dans le brief : « Story 9:16 ».');
    await cliquer(bouton('Créer le document'));
    const arg = m.enregistrer.mock.calls[0]![0];
    expect(arg.baseVersionId).toBe('v1');
    expect(arg.changes.map((c: { op: string; path: string }) => [c.op, c.path])).toEqual([['replace', '/document']]);
    expect(arg.changes[0].newValue).toMatchObject({ width: 1080, height: 1920, layers: {} });
    expect(q('[data-surface="document"]')?.getAttribute('data-hauteur')).toBe('1920');
  });

  it('lecture seule · ni ajout, ni enregistrement, champs figés', async () => {
    monter(PROPS({ peutEnregistrer: false }));
    expect(texte('[data-etat="lecture-seule"]') ?? '', 'bandeau « Lecture seule » absent sans droit d’enregistrer').toContain('Lecture seule');
    expect(document.querySelector('[data-action="enregistrer"]')).toBeNull();
    expect(document.querySelector('[aria-label="Ajouter un calque"]')).toBeNull();
    await choisirTitre();
    expect(champ('X').disabled).toBe(true);
  });

  it('copie de secours · écrite sur l’appareil après une édition, proposée au retour, restaurée sans enregistrer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    monter(PROPS());
    await choisirTitre();
    const zone = q<HTMLTextAreaElement>('[data-champ="texte"]');
    saisir(zone, 'Brouillon local');
    quitter(zone);
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    const s = JSON.parse(window.localStorage.getItem(cleSauvegarde('p1'))!);
    expect(s).toMatchObject({ v: 1, baseVersionId: 'v1', baseN: 1 });
    expect(s.document.layers.l_titre.text).toBe('Brouillon local');
    act(() => racine!.unmount());
    racine = null;
    conteneur.remove();
    monter(PROPS());
    expect(texte('[data-etat="copie-secours"]')).toContain('Cette copie vit dans ce navigateur seulement');
    expect(texte('[data-calque="l_titre"] [data-texte="editable"]')).toBe('Peau nette en 7 jours');
    await cliquer(bouton('Restaurer la copie'));
    expect(texte('[data-calque="l_titre"] [data-texte="editable"]')).toBe('Brouillon local');
    expect(texte('[data-statut]')).toBe('Modifications non enregistrées');
    expect(m.enregistrer).not.toHaveBeenCalled();
  });

  it('390 px · liste des calques par défaut ; les propriétés s’ouvrent en plein écran, piègent le focus, Échap les ferme et rend le focus', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (query: string) => ({
      matches: true, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }) as MediaQueryList;
    monter(PROPS());
    expect(q('[data-editeur="calques"]').getAttribute('data-mobile')).toBe('oui');
    expect(q('[role="tab"][aria-selected="true"]')?.textContent).toBe('Calques');
    expect(q('[data-panneau="calques"]')).not.toBeNull();
    expect(q('[data-surface="document"]')).toBeNull();
    const ligne = [...document.querySelectorAll('button[aria-pressed]')].find((b) => b.getAttribute('aria-label')?.startsWith('Texte · Titre')) as HTMLButtonElement;
    await cliquer(ligne);
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    const panneau = q('[data-panneau-mobile="proprietes"]');
    expect(panneau?.getAttribute('role')).toBe('dialog');
    expect(panneau?.getAttribute('aria-modal')).toBe('true');
    expect(panneau?.contains(document.activeElement)).toBe(true);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(q('[data-panneau-mobile="proprietes"]')).toBeNull();
    expect(document.activeElement).toBe(ligne);
    await cliquer(bouton('Aperçu'));
    expect(q('[data-surface="document"]')).not.toBeNull();
  });
});
