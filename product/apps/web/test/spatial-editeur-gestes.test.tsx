// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { erreurStudio, type ContenuVersion, type DocumentStudio } from '@tiktrends/core';
import { cleSauvegarde } from '../lib/studios/editeur/sauvegarde-locale';
import { contenuVideo, documentStudio, copie } from '../../../packages/core/test/studios-fixtures';

/**
 * Spatial · Éditeur d'image (`/studio/projets/[id]/image`) monté dans un DOM
 * et piloté comme un humain (clic, saisie, raccourcis, glisser). Gardes PORTÉES
 * de l'éditeur V5 retiré (ex-`l5b-editeur-rendu`, `l2b-editeur-zoom-versions-rendu`,
 * `l8a-ecrans-rendu` · éditeur) : on lit le HTML rendu (texte affiché, position
 * en %, statut en mots), les arguments RÉELS reçus par les actions, le focus et
 * le stockage local. Aucune génération, aucune dépense.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => ({ enregistrer: vi.fn(), relire: vi.fn(), lister: vi.fn(), apercu: vi.fn(), restaurer: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/p1/image', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../app/actions/studios/projets', () => ({ enregistrerDocument: m.enregistrer }));
vi.mock('../lib/studios/editeur/actions', () => ({ relireDocumentEditeur: m.relire, listerVersionsDocument: m.lister, apercuVersionDocument: m.apercu, restaurerVersionDocument: m.restaurer }));

const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const { Editeur } = await import('../spatial/vues/projet/Editeur');
type PropsEditeur = import('../spatial/vues/projet/Editeur').PropsEditeur;
type CtxSpatial = import('../spatial/coquille/contexte').CtxSpatial;
const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};

const ZONE = { largeur: 497, hauteur: 516 };
const restaurerProto: Array<() => void> = [];
beforeAll(() => {
  const proto = window.HTMLElement.prototype;
  for (const k of ['clientWidth', 'clientHeight', 'getBoundingClientRect']) {
    const d = Object.getOwnPropertyDescriptor(proto, k) ?? Object.getOwnPropertyDescriptor(window.Element.prototype, k);
    restaurerProto.push(() => { if (d) Object.defineProperty(proto, k, d); else delete (proto as unknown as Record<string, unknown>)[k]; });
  }
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get(this: HTMLElement) { return this.hasAttribute('data-zone-travail') ? ZONE.largeur : 0; } });
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get(this: HTMLElement) { return this.hasAttribute('data-zone-travail') ? ZONE.hauteur : 0; } });
  Object.defineProperty(proto, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement) {
      // Le cadre du document a la largeur que le zoom a posée sur son conteneur (aucune mise en page dans jsdom).
      const w = this.matches('#art .ad[role="group"]') ? parseFloat(this.parentElement?.style.width ?? '') || 0 : 0;
      return { x: 0, y: 0, left: 0, top: 0, right: w, bottom: 0, width: w, height: 0, toJSON() { return this; } };
    },
  });
});
afterAll(() => { for (const r of restaurerProto) r(); });

const PROPS = (o: Partial<PropsEditeur> = {}): PropsEditeur => ({
  projet: { id: 'p1', titre: 'Sérum · visuel', marque: 'Marque A1' }, version: { id: 'v1', n: 1 }, contenu: contenuVideo(),
  document: documentStudio(), formatPropose: { format: '4:5', depuisBrief: false, texte: null }, produit: null, medias: [], apercus: {},
  peutEnregistrer: true, couleursMarque: [], exporterHref: null, variantesHref: '/studio/projets/p1#variantes', ...o,
});

let hote: HTMLDivElement;
let racine: Root | null = null;
beforeEach(() => { for (const f of Object.values(m)) f.mockReset(); window.localStorage.clear(); hote = document.createElement('div'); document.body.appendChild(hote); });
afterEach(() => { if (racine) act(() => racine!.unmount()); racine = null; document.body.innerHTML = ''; vi.useRealTimers(); });
const monter = (p: PropsEditeur) => act(() => { racine = createRoot(hote); racine.render(<FournisseurSpatial value={CTX}><Editeur {...p} /></FournisseurSpatial>); });
const demonter = () => { act(() => racine!.unmount()); racine = null; hote.innerHTML = ''; };
const q = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const texte = (sel: string) => q(sel)?.textContent ?? null;
const bouton = (libelle: string | RegExp) => [...document.querySelectorAll('button')].find((b) => (typeof libelle === 'string' ? b.textContent?.trim() === libelle : libelle.test(b.textContent ?? ''))) as HTMLButtonElement;
const cliquer = async (b: Element | null) => { expect(b, 'élément introuvable').toBeTruthy(); await act(async () => { (b as HTMLElement).focus(); (b as HTMLElement).click(); }); };
const saisir = (el: HTMLInputElement | HTMLTextAreaElement, valeur: string) => act(() => {
  el.focus();
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, valeur);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const quitter = (el: HTMLElement) => act(() => { el.blur(); });
const raccourci = (key: string, o: KeyboardEventInit = {}, cible: EventTarget = document.body) => act(() => { cible.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...o })); });
const champ = (debut: string) => [...document.querySelectorAll('label.field')].find((l) => l.textContent?.startsWith(debut))!.querySelector('input, textarea') as HTMLInputElement;
const statut = () => texte('.wshead .pill[role="status"]');
const titre = () => q('[data-calque="l_titre"]');
const choisirTitre = () => cliquer(q('[data-layer="l_titre"]'));
const deplacerX = async (x: string) => { const c = champ('Position X'); saisir(c, x); quitter(c); };
const versionOk = (id: string, n: number) => ({ ok: true, inchange: false, version: { id, n } });
const pct = (v: number, t: number) => `${(v / t) * 100}%`;

describe('éditer · le texte reste du texte, chaque geste se voit, annuler et rétablir par bouton ET raccourci', () => {
  it('rendu initial · texte HTML, média sans aperçu nommé, statut « Enregistré », rien à enregistrer', () => {
    monter(PROPS());
    expect(texte('[data-calque="l_titre"]')).toBe('Peau nette en 7 jours');
    expect(q('#art .ad').querySelectorAll('img')).toHaveLength(0);
    expect(texte('[data-calque="l_fond"]')).toBe('Fond · aperçu indisponible');
    expect(statut()).toBe('Enregistré');
    for (const l of ['Enregistrer', 'Annuler', 'Rétablir']) expect(bouton(l).disabled, l).toBe(true);
  });

  it('changer le texte et déplacer le titre · l’aperçu suit, le calque reste un texte, aucune génération', async () => {
    monter(PROPS());
    await choisirTitre();
    const zone = q<HTMLTextAreaElement>('#stext');
    saisir(zone, 'Corrige seulement le CTA');
    quitter(zone);
    expect(texte('[data-calque="l_titre"]')).toBe('Corrige seulement le CTA');
    await deplacerX('300');
    expect(titre().style.left).toBe(pct(300, 1080));
    expect(statut()).toBe('Modifications non enregistrées');
    expect(document.body.textContent).toContain('rien n’est généré ni facturé');
  });

  it('annuler et rétablir · bouton, Ctrl+Z, Ctrl+Maj+Z, Ctrl+Y · le statut revient à « Enregistré »', async () => {
    monter(PROPS());
    await choisirTitre();
    const zone = q<HTMLTextAreaElement>('#stext');
    saisir(zone, 'Nouveau CTA'); quitter(zone);
    await deplacerX('300');
    await cliquer(bouton('Annuler'));
    expect(titre().style.left).toBe(pct(60, 1080));
    expect(texte('[data-calque="l_titre"]')).toBe('Nouveau CTA');
    raccourci('z');
    expect(texte('[data-calque="l_titre"]')).toBe('Peau nette en 7 jours');
    expect(statut()).toBe('Enregistré');
    raccourci('z', { shiftKey: true });
    expect(texte('[data-calque="l_titre"]')).toBe('Nouveau CTA');
    raccourci('y');
    expect(titre().style.left).toBe(pct(300, 1080));
  });

  it('un raccourci tapé DANS un champ reste l’annuler natif du champ (le document ne bouge pas)', async () => {
    monter(PROPS());
    await choisirTitre();
    const zone = q<HTMLTextAreaElement>('#stext');
    saisir(zone, 'abc'); quitter(zone);
    act(() => { zone.focus(); });
    raccourci('z', {}, zone);
    expect(texte('[data-calque="l_titre"]')).toBe('abc');
  });

  it('calque verrouillé · champs figés, suppression impossible ; déverrouiller rend la main', async () => {
    monter(PROPS());
    await cliquer(q('[data-layer="l_logo"]'));
    expect(document.body.textContent).toContain('Calque verrouillé');
    expect(champ('Position X').disabled).toBe(true);
    expect(bouton('Supprimer').disabled).toBe(true);
    await cliquer(bouton('Déverrouiller'));
    expect(champ('Position X').disabled).toBe(false);
  });

  it('glisser 100 px d’écran à 50 % · le calque avance de 200 px du document ; à 100 %, de 100 px', async () => {
    monter(PROPS());
    await cliquer(q('[data-zoom-action="reelle"]'));
    await cliquer(q('[data-zoom-action="moins"]')); // 75 %
    await cliquer(q('[data-zoom-action="moins"]')); // 67 %
    await cliquer(q('[data-zoom-action="moins"]')); // 50 %
    expect(parseFloat(q('[data-zone-travail]').getAttribute('data-zoom')!)).toBe(0.5);
    const glisser = (dx: number) => {
      act(() => { titre().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100 })); });
      act(() => { q('#art .ad').dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 100 + dx, clientY: 100 })); });
      act(() => { q('#art .ad').dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 100 + dx, clientY: 100 })); });
    };
    glisser(100);
    expect(titre().style.left).toBe(pct(60 + 200, 1080));
    await cliquer(q('[data-zoom-action="reelle"]'));
    glisser(100);
    expect(titre().style.left).toBe(pct(60 + 200 + 100, 1080));
  });
});

describe('enregistrer · patch base → présent, version suivante, 409 sans écrasement', () => {
  it('« Enregistrer » envoie le patch sur identifiants stables et la version de base ; la suivante part de la nouvelle', async () => {
    m.enregistrer.mockResolvedValueOnce(versionOk('v2', 2)).mockResolvedValueOnce(versionOk('v3', 3));
    monter(PROPS());
    await choisirTitre();
    await deplacerX('300');
    await cliquer(bouton('Enregistrer'));
    expect(m.enregistrer).toHaveBeenCalledTimes(1);
    const arg = m.enregistrer.mock.calls[0]![0];
    expect(arg).toMatchObject({ projectId: 'p1', baseVersionId: 'v1' });
    expect(arg.changes.map((c: { op: string; path: string; newValue: unknown }) => [c.op, c.path, c.newValue])).toEqual([['replace', '/document/layers/l_titre/x', 300]]);
    expect(statut()).toBe('Enregistré');
    expect(document.body.textContent).toContain('version 2');
    const y = champ('Position Y'); saisir(y, '500'); quitter(y);
    raccourci('s');
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(m.enregistrer.mock.calls[1]![0]).toMatchObject({ baseVersionId: 'v2' });
    expect(m.enregistrer.mock.calls[1]![0].changes.map((c: { path: string }) => c.path)).toEqual(['/document/layers/l_titre/y']);
  });

  it('409 · une autre session a enregistré : rien n’est écrasé ; « Réappliquer mes modifications » rejoue sur la courante et rend le focus à « Enregistrer »', async () => {
    const courant = copie(documentStudio());
    (courant.layers.l_titre as { color: string }).color = '#ff0000';
    m.enregistrer.mockResolvedValueOnce(erreurStudio('VERSION_CONFLICT', { traceId: 't1', conflit: { versionCouranteId: 'v3', differences: [] } })).mockResolvedValueOnce(versionOk('v4', 4));
    m.relire.mockResolvedValue({ ok: true, version: { id: 'v3', n: 3 }, document: courant });
    monter(PROPS());
    await choisirTitre();
    await deplacerX('300');
    await cliquer(bouton('Enregistrer'));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(document.body.textContent).toContain('Une autre session a enregistré la version 3');
    expect(statut()).toBe('Conflit · une autre session a enregistré');
    await cliquer(bouton('Réappliquer mes modifications'));
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(statut()).toBe('Modifications non enregistrées');
    expect(q<HTMLElement>('[data-calque="l_titre"] > div').style.color).toBe('rgb(255, 0, 0)');
    expect(titre().style.left).toBe(pct(300, 1080));
    expect(document.activeElement).toBe(q('[data-action="enregistrer"]'));
    await cliquer(bouton('Enregistrer'));
    expect(m.enregistrer.mock.calls[1]![0]).toMatchObject({ baseVersionId: 'v3' });
    expect(m.enregistrer.mock.calls[1]![0].changes.map((c: { path: string }) => c.path)).toEqual(['/document/layers/l_titre/x']);
  });

  it('409 sur le même champ · réappliquer impossible ; « Recharger » montre la courante, la copie de secours garde mes modifications', async () => {
    const courant = copie(documentStudio());
    (courant.layers.l_titre as { x: number }).x = 10;
    m.enregistrer.mockResolvedValueOnce(erreurStudio('VERSION_CONFLICT', { traceId: 't2', conflit: { versionCouranteId: 'v3', differences: [] } }));
    m.relire.mockResolvedValue({ ok: true, version: { id: 'v3', n: 3 }, document: courant });
    monter(PROPS());
    await choisirTitre();
    await deplacerX('300');
    await cliquer(bouton('Enregistrer'));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(bouton('Réappliquer mes modifications')).toBeUndefined();
    await cliquer(bouton('Recharger la version 3'));
    expect(titre().style.left).toBe(pct(10, 1080));
    expect(statut()).toBe('Enregistré');
    expect(document.body.textContent).toContain('version 3');
    const s = JSON.parse(window.localStorage.getItem(cleSauvegarde('p1'))!);
    expect(s.document.layers.l_titre.x).toBe(300);
  });

  it('échec réseau · message utile, valeurs conservées, « Réessayer »', async () => {
    m.enregistrer.mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce(versionOk('v2', 2));
    monter(PROPS());
    await choisirTitre();
    await deplacerX('300');
    await cliquer(bouton('Enregistrer'));
    expect(document.body.textContent).toContain('Le serveur ne répond pas');
    expect(statut()).toBe('Échec de l’enregistrement · modifications conservées');
    expect(titre().style.left).toBe(pct(300, 1080));
    await cliquer(bouton('Réessayer'));
    expect(statut()).toBe('Enregistré');
  });
});

describe('états · vide, lecture seule, copie de secours, focus', () => {
  it('aucun document · créer au format du brief = un seul replace /document, puis l’éditeur s’ouvre', async () => {
    m.enregistrer.mockResolvedValueOnce(versionOk('v2', 2));
    monter(PROPS({ document: null, formatPropose: { format: '9:16', depuisBrief: true, texte: 'Story 9:16' } }));
    expect(q('[data-etat="document-vide"]')!.textContent).toContain('Format lu dans le brief : « Story 9:16 ».');
    await cliquer(bouton(/^Créer le document/));
    const arg = m.enregistrer.mock.calls[0]![0];
    expect(arg.baseVersionId).toBe('v1');
    expect(arg.changes.map((c: { op: string; path: string }) => [c.op, c.path])).toEqual([['replace', '/document']]);
    expect(arg.changes[0].newValue).toMatchObject({ width: 1080, height: 1920, layers: {} });
    expect(q('#art .ad').getAttribute('aria-label')).toContain('1080 × 1920');
  });

  it('lecture seule · ni ajout, ni enregistrement, champs figés', async () => {
    monter(PROPS({ peutEnregistrer: false }));
    expect(texte('.wshead .pill')).toContain('Lecture seule');
    expect(q('[data-action="enregistrer"]')).toBeNull();
    expect(q('[data-ajouter="texte"]')).toBeNull();
    await choisirTitre();
    expect(q<HTMLTextAreaElement>('#stext').disabled).toBe(true);
  });

  it('copie de secours · écrite sur l’appareil après une édition, proposée au retour, restaurée sans enregistrer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    monter(PROPS());
    await choisirTitre();
    const zone = q<HTMLTextAreaElement>('#stext');
    saisir(zone, 'Brouillon local'); quitter(zone);
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    const s = JSON.parse(window.localStorage.getItem(cleSauvegarde('p1'))!);
    expect(s).toMatchObject({ v: 1, baseVersionId: 'v1', baseN: 1 });
    expect(s.document.layers.l_titre.text).toBe('Brouillon local');
    demonter();
    monter(PROPS());
    expect(document.body.textContent).toContain('elle vit dans ce navigateur seulement');
    expect(texte('[data-calque="l_titre"]')).toBe('Peau nette en 7 jours');
    await cliquer(bouton('Restaurer la copie'));
    expect(texte('[data-calque="l_titre"]')).toBe('Brouillon local');
    expect(statut()).toBe('Modifications non enregistrées');
    expect(m.enregistrer).not.toHaveBeenCalled();
  });

  it('« Supprimer » · le focus passe au calque qui prend la place ; dernier calque supprimé · le focus va sur « Ajouter un texte »', async () => {
    const doc: DocumentStudio = { ...documentStudio(), layers: { l_titre: documentStudio().layers.l_titre!, l_fond: documentStudio().layers.l_fond! } };
    monter(PROPS({ document: doc, contenu: { ...contenuVideo(), document: doc } as ContenuVersion }));
    await choisirTitre();
    await cliquer(bouton('Supprimer'));
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(document.activeElement).toBe(q('[data-layer="l_fond"]'));
    await cliquer(bouton('Supprimer'));
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(document.activeElement).toBe(q('[data-ajouter="texte"]'));
  });
});

describe('versions · auteur, date, aperçu, comparaison, restauration NON destructive', () => {
  const LISTE = [
    { id: 'v4', n: 4, creeLe: '2026-10-20T10:00:00Z', auteur: 'Kevin', raison: 'Éditeur de calques · Déplacer', courante: true },
    { id: 'v2', n: 2, creeLe: '2026-10-18T10:00:00Z', auteur: 'Léa', raison: 'Éditeur de calques · Création du document', courante: false },
  ];
  const APERCU_V2 = { version: { id: 'v2', n: 2 }, courante: { id: 'v4', n: 4 }, document: documentStudio(), documentIllisible: false, apercus: {}, comparaison: { phrases: ['Calque « Titre » · position horizontale : 300 px → 60 px'], tronquee: false } };
  const ouvrirV2 = async () => {
    await cliquer(q('[data-action="versions"]'));
    await act(async () => { await Promise.resolve(); });
    await cliquer(q('[data-comparer="2"]'));
    await act(async () => { await Promise.resolve(); });
  };

  it('liste et détail · aperçu, comparaison et ce qui va se passer, écrits AVANT le clic', async () => {
    m.lister.mockResolvedValue({ ok: true, versions: LISTE });
    m.apercu.mockResolvedValue({ ok: true, apercu: APERCU_V2 });
    monter(PROPS({ version: { id: 'v4', n: 4 } }));
    await ouvrirV2();
    expect(m.lister).toHaveBeenCalledWith('p1');
    expect(m.apercu).toHaveBeenCalledWith({ projectId: 'p1', versionId: 'v2' });
    expect(q('[data-version-n="2"]').textContent).toContain('Léa');
    expect(q('[data-version-n="2"]').textContent).toContain('Création du document');
    expect(texte('[data-version-n="4"] [data-courante]')).toBe('Courante');
    expect(q('[data-detail-version="2"] [data-apercu-version] .ad')).not.toBeNull();
    expect(texte('[data-comparaison]')).toContain('Calque « Titre » · position horizontale : 300 px → 60 px');
    const annonce = q('[data-annonce-restauration]');
    expect(annonce.textContent).toMatch(/^Restaurer crée la version 5, copie exacte de la version 2/);
    const restaurer = q<HTMLButtonElement>('[data-action="restaurer"]');
    expect(restaurer.disabled).toBe(false);
    expect(annonce.compareDocumentPosition(restaurer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(m.restaurer).not.toHaveBeenCalled();
  });

  it('« Restaurer » · l’action reçoit des IDENTIFIANTS (jamais un contenu) et la base ; l’éditeur passe à la nouvelle version', async () => {
    const doc2 = copie(documentStudio());
    (doc2.layers.l_titre as { text: string }).text = 'Texte de la version 2';
    m.lister.mockResolvedValue({ ok: true, versions: LISTE });
    m.apercu.mockResolvedValue({ ok: true, apercu: { ...APERCU_V2, document: doc2 } });
    m.restaurer.mockResolvedValue({ ok: true, version: { id: 'v5', n: 5 }, restauree: { id: 'v2', n: 2 }, contenu: { ...contenuVideo(), document: doc2 }, document: doc2 });
    monter(PROPS({ version: { id: 'v4', n: 4 } }));
    await ouvrirV2();
    await cliquer(q('[data-action="restaurer"]'));
    await act(async () => { await Promise.resolve(); });
    expect(m.restaurer).toHaveBeenCalledTimes(1);
    expect(m.restaurer.mock.calls[0]![0]).toEqual({ projectId: 'p1', versionId: 'v2', baseVersionId: 'v4' });
    expect(document.body.textContent).toContain('version 5');
    expect(texte('[data-calque="l_titre"]')).toBe('Texte de la version 2');
    expect(statut()).toBe('Enregistré');
    expect(bouton('Annuler').disabled).toBe(true);
    expect(m.enregistrer).not.toHaveBeenCalled();
  });

  it('modifications non enregistrées · restauration refusée avec la raison, aucun appel', async () => {
    m.lister.mockResolvedValue({ ok: true, versions: LISTE });
    m.apercu.mockResolvedValue({ ok: true, apercu: APERCU_V2 });
    monter(PROPS({ version: { id: 'v4', n: 4 } }));
    await choisirTitre();
    act(() => { q('#art .ad').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    expect(statut()).toBe('Modifications non enregistrées');
    await ouvrirV2();
    expect(q<HTMLButtonElement>('[data-action="restaurer"]').disabled).toBe(true);
    expect(texte('[data-refus-restauration]')).toBe('Tu as des modifications non enregistrées · enregistre-les ou annule-les avant de restaurer.');
    await cliquer(q('[data-action="restaurer"]'));
    expect(m.restaurer).not.toHaveBeenCalled();
  });

  it('409 · une autre session a enregistré entre-temps : rien n’est restauré, l’éditeur reste sur sa version', async () => {
    m.lister.mockResolvedValue({ ok: true, versions: LISTE });
    m.apercu.mockResolvedValue({ ok: true, apercu: APERCU_V2 });
    m.restaurer.mockResolvedValue(erreurStudio('VERSION_CONFLICT', { traceId: 't1', conflit: { versionCouranteId: 'v9', differences: [] } }));
    monter(PROPS({ version: { id: 'v4', n: 4 } }));
    await ouvrirV2();
    await cliquer(q('[data-action="restaurer"]'));
    await act(async () => { await Promise.resolve(); });
    expect(texte('[data-detail-version="2"] [role="alert"]')).toBe('Une autre session a enregistré une version entre-temps · rien n’a été restauré. Recharge la page pour partir de la version courante, puis recommence.');
    expect(document.body.textContent).toContain('version 4');
  });

  it('lecture seule · la liste et l’aperçu restent, la restauration est refusée', async () => {
    m.lister.mockResolvedValue({ ok: true, versions: LISTE });
    m.apercu.mockResolvedValue({ ok: true, apercu: APERCU_V2 });
    monter(PROPS({ version: { id: 'v4', n: 4 }, peutEnregistrer: false }));
    await ouvrirV2();
    expect(q('[data-apercu-version]')).not.toBeNull();
    expect(texte('[data-refus-restauration]')).toBe('Ton rôle permet de consulter les versions, pas de les restaurer.');
    expect(q<HTMLButtonElement>('[data-action="restaurer"]').disabled).toBe(true);
  });
});
