// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { encartKpiJarvis, memoireParDimension, type StatRow } from '@tiktrends/core';

/**
 * Vague 3 · les gestes de l'ancien Jarvis portés dans Spatial. Chaque garde
 * vérifie un RÉSULTAT (le DOM rendu, l'appel réellement parti avec ses
 * arguments), jamais la simple présence d'une fonction.
 */

const h = vi.hoisted(() => ({
  chatThread: vi.fn(),
  onboardingThread: vi.fn(),
  clearOnboarding: vi.fn(async () => ({ ok: true })),
  creer: vi.fn(async () => ({ id: 'c-new' })),
  renommer: vi.fn(async () => ({ ok: true })),
  draft: vi.fn(),
  preparer: vi.fn(async () => ({ ok: true, produits: [{ id: 'p1', nom: 'Produit réel' }] })),
  studio: vi.fn(),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/jarvis', useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock('../app/actions/jarvis-chat', () => ({ chatThreadAction: h.chatThread, clearChatAction: vi.fn(), onboardingThreadAction: h.onboardingThread, clearOnboardingAction: h.clearOnboarding }));
vi.mock('../app/actions/jarvis-conversations', () => ({ creerConversationAction: h.creer, renommerConversationAction: h.renommer }));
vi.mock('../app/actions/adsmap-draft', () => ({ draftConceptAction: h.draft }));
vi.mock('../app/actions/studios/sources', () => ({ preparerCreation: h.preparer }));
vi.mock('../app/actions/jarvis-veille-studio', () => ({ creerStudioDepuisJarvis: h.studio }));
vi.mock('../app/actions/adsmap-analyze', () => ({ analysisCoverageAction: vi.fn(async () => ({})), analyzeAssetsAction: vi.fn() }));
vi.mock('../app/actions/jarvis', () => ({ trainJarvisAction: vi.fn(), saveJarvisLearningsAction: vi.fn(), proposeJarvisRulesAction: vi.fn(), saveJarvisRulesAction: vi.fn() }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Jarvis } from '../spatial/vues/jarvis/Jarvis';
import { SourcesJarvis, type PropsSources } from '../spatial/vues/jarvis/Sources';
import { JarvisVeille } from '../spatial/vues/jarvis/JarvisVeille';

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin Guilbaux', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 10, dotation: 20, illimite: false },
  nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const T0 = '2026-10-20T10:00:00.000Z';
const propsJarvis = () => ({
  marque: { id: 'b1', nom: 'Marque réelle' },
  conversations: [{ id: 'c1', titre: 'Plan de novembre', extrait: 'Semaine 1', majLe: T0 }, { id: null, titre: 'Fil principal', extrait: 'Ancien', majLe: T0 }],
  iterations: null, measuredAds: 0, kpi: encartKpiJarvis(null), cout: 'Coût annoncé avant l’envoi.', maintenant: T0,
});
const fil = (turns: Array<{ role: 'user' | 'assistant'; content: string }>, extra: Record<string, unknown> = {}) => ({
  thread: { turns: turns.map((t, i) => ({ id: `t${i}`, at: T0, ...t })), starters: [], measuredAds: 0, brandName: 'Marque réelle', contexte: {}, sources: {}, conversationId: 'c1', conversations: [{ id: 'c1', titre: 'Plan de novembre', majLe: T0 }], ...extra },
});

let el: HTMLDivElement; let root: Root;
async function monter(n: React.ReactNode) {
  el = document.createElement('div'); document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => { root.render(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>); });
}
const saisir = async (champ: HTMLInputElement | HTMLTextAreaElement, v: string) => act(async () => {
  const proto = champ instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(champ, v);
  champ.dispatchEvent(new Event('input', { bubbles: true }));
});
const flux = (texte: string) => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(texte)); c.close(); } }), { status: 200 });
afterEach(() => { root?.unmount(); el?.remove(); vi.restoreAllMocks(); for (const f of Object.values(h)) f.mockClear(); });

describe('Spatial · Jarvis · renommer une conversation', () => {
  it('le bouton de la maquette (`.jx`) renomme la conversation NOMMÉE · le fil principal n’en a pas', async () => {
    await monter(<Jarvis {...propsJarvis()} />);
    expect(el.querySelectorAll('#jarchlist button.jx')).toHaveLength(1);
    vi.spyOn(window, 'prompt').mockReturnValue('  Plan créa de décembre ');
    await act(async () => { (el.querySelector('#jarchlist button.jx') as HTMLButtonElement).click(); });
    expect(h.renommer).toHaveBeenCalledWith('b1', 'c1', 'Plan créa de décembre');
    expect(el.querySelector('#jarchlist .jit-t strong')?.textContent).toBe('Plan créa de décembre');
  });
  it('un refus du serveur ne renomme rien à l’écran', async () => {
    h.renommer.mockResolvedValueOnce({ ok: false } as never);
    await monter(<Jarvis {...propsJarvis()} />);
    vi.spyOn(window, 'prompt').mockReturnValue('Autre titre');
    await act(async () => { (el.querySelector('#jarchlist button.jx') as HTMLButtonElement).click(); });
    expect(el.querySelector('#jarchlist .jit-t strong')?.textContent).toBe('Plan de novembre');
    expect(el.querySelector('[role="alert"]')?.textContent).toMatch(/pas pu être renommée/);
  });
});

describe('Spatial · Jarvis · « Écrire ce concept » depuis une réponse', () => {
  it('le coût est sur le bouton AVANT le clic · le clic appelle l’action existante avec l’intention, le brouillon s’affiche', async () => {
    h.chatThread.mockResolvedValue(fil([{ role: 'user', content: 'Une idée ?' }, { role: 'assistant', content: 'Essaie la preuve sociale. [[ACTION:draft|preuve sociale rentrée]]' }]));
    h.draft.mockResolvedValue({ view: { draft: { headline: 'Ils ont tous plongé', beats: ['Ouverture', 'Preuve'], hypothesis: 'La preuve sociale bat la promesse' }, warning: null, rewritten: true, recommendation: '' } });
    await monter(<Jarvis {...propsJarvis()} />);
    await act(async () => { (el.querySelector('#jarchlist .jit-b') as HTMLButtonElement).click(); });
    const bouton = [...el.querySelectorAll('.jm-c button.jact')].find((b) => /Écrire ce concept/.test(b.textContent ?? '')) as HTMLButtonElement;
    expect(bouton.textContent).toBe('Écrire ce concept · un appel au modèle');
    expect(h.draft).not.toHaveBeenCalled();
    await act(async () => { bouton.click(); });
    expect(h.draft).toHaveBeenCalledWith({ origin: 'blank', intent: 'preuve sociale rentrée' });
    expect(el.textContent).toContain('« Ils ont tous plongé »');
    expect(el.textContent).toContain('Jarvis a réécrit son accroche');
  });
});

describe('Spatial · Jarvis · colonne de contexte et puce « Fiche marque »', () => {
  it('projets réels, fiche réelle, sources · la puce exclut réellement la fiche du contexte envoyé', async () => {
    h.chatThread.mockResolvedValue(fil([]));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(flux('Réponse.'));
    await monter(<Jarvis {...propsJarvis()} annexes={{ projets: [{ id: 'p1', titre: 'Projet rentrée', href: '/studio/projets/p1' }], completude: { score: 42, faits: 5, total: 12, ficheHref: '/brands/b1?tab=overview#profil' } }} />);
    const liens = [...el.querySelectorAll('aside a')].map((a) => a.getAttribute('href'));
    expect(liens).toEqual(expect.arrayContaining(['/studio/projets/p1', '/brands/b1?tab=overview#profil', '/jarvis/sources', '/brands', '/onboarding?redo=1']));
    expect(el.textContent).toContain('Fiche marque · 42 %');
    const puce = [...el.querySelectorAll('.jch button.chip')].find((b) => b.textContent === 'Fiche marque') as HTMLButtonElement;
    expect(puce.getAttribute('aria-pressed')).toBe('true');
    await act(async () => { puce.click(); });
    expect(puce.getAttribute('aria-pressed')).toBe('false');
    await saisir(el.querySelector('#jin') as HTMLInputElement, 'Une question');
    await act(async () => { (el.querySelector('#jform') as HTMLFormElement).requestSubmit(); });
    const corps = JSON.parse(String((fetchSpy.mock.calls[0]![1] as RequestInit).body));
    expect(corps).toEqual(expect.objectContaining({ message: 'Une question', brandId: 'b1', conversationId: 'c-new', sources: [] }));
  });
  it('sans annexes (jeu de la maquette), la colonne reste celle de la maquette', () => {
    const html = renderToStaticMarkup(<FournisseurSpatial value={CTX}><Jarvis {...propsJarvis()} /></FournisseurSpatial>);
    expect(html).not.toContain('/jarvis/sources');
    expect(html).not.toContain('class="chip" aria-pressed="true">Fiche marque');
  });
});

describe('Spatial · Jarvis · sans marque, la conversation d’accueil', () => {
  it('le champ est ouvert, une amorce PRÉPARE, l’envoi part sans marque, puis le fil d’accueil est relu', async () => {
    h.onboardingThread.mockResolvedValue({ thread: { turns: [{ id: 'o1', role: 'assistant', content: 'Bienvenue, créons ta marque.', at: T0 }], starters: [] } });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(flux('Bienvenue'));
    await monter(<Jarvis {...propsJarvis()} marque={null} conversations={[]} accueil={{ tours: [], amorces: ['Par où commencer ?'] }} />);
    const champ = el.querySelector('#jin') as HTMLInputElement;
    expect(champ.disabled).toBe(false);
    expect(el.querySelector('.jempty a[href="/brands/new"]')).not.toBeNull();
    // Porté de l'ancien écran d'accueil · jamais le mur « Sélectionne une marque active ».
    expect(el.textContent).not.toContain('Sélectionne une marque active');
    await act(async () => { ([...el.querySelectorAll('.jempty button.chip')].find((b) => b.textContent === 'Par où commencer ?') as HTMLButtonElement).click(); });
    expect(champ.value).toBe('Par où commencer ?');
    expect(fetchSpy).not.toHaveBeenCalled();
    await act(async () => { (el.querySelector('#jform') as HTMLFormElement).requestSubmit(); });
    expect(JSON.parse(String((fetchSpy.mock.calls[0]![1] as RequestInit).body))).toEqual({ message: 'Par où commencer ?' });
    expect(h.creer).not.toHaveBeenCalled();
    expect(h.onboardingThread).toHaveBeenCalled();
    expect(el.querySelector('.jmsgs')?.textContent).toContain('Bienvenue, créons ta marque.');
  });
  it('sans fil d’accueil lisible, le champ reste fermé (aucun envoi promis)', () => {
    const html = renderToStaticMarkup(<FournisseurSpatial value={CTX}><Jarvis {...propsJarvis()} marque={null} conversations={[]} /></FournisseurSpatial>);
    expect(html).toMatch(/<input id="jin"[^>]*disabled=""/);
  });
});

/* ───────────────────────── Sources de Jarvis ───────────────────────── */

const stats: StatRow[] = [{ dimension: 'mechanism', key: 'preuve sociale', nAds: 4, nConclusive: 4, nWinners: 3, nBaby: 0, hitRate: 0.75, hookRateMedian: null, holdRateMedian: null, ctrMedian: null, cpaMedian: null }];
const propsSources = (extra: Partial<PropsSources> = {}): PropsSources => ({
  marque: { id: 'b1', nom: 'Marque réelle' },
  couches: [{ cle: 'fiche', titre: 'Fiche marque', quoi: 'Identité injectée', etat: 'off', libelleEtat: 'éteint', detail: '', geste: { libelle: 'Compléter la fiche', href: '/brands/b1' } }],
  memoire: { taux: 'n.c.', tauxDetail: '0 / 0 test(s)', ads: 4, signaux: 1, groupes: memoireParDimension(stats, 0.4), brut: '', vide: 'Rien.' },
  contexte: { identite: null, regles: 'Jamais : miracle.', accroches: null, connaissances: { inclus: [], horsPlace: 0 } },
  testsMesures: 0, fondateur: null, ...extra,
});
const sources = (p: PropsSources) => renderToStaticMarkup(<FournisseurSpatial value={CTX}><SourcesJarvis {...p} /></FournisseurSpatial>);

describe('Spatial · Sources de Jarvis', () => {
  it('couches, mémoire mesurée et contexte · rien du fondateur pour un membre', () => {
    const html = sources(propsSources());
    expect(html).toContain('data-couche="fiche"');
    expect(html).toContain('href="/brands/b1"');
    expect(html).toContain('preuve sociale');
    expect(html).toContain('width:75%');
    expect(html).toContain('Jamais : miracle.');
    expect(html).toContain('Décrire les créas');
    for (const x of ['Réglages maison', 'Ce que Jarvis coûte', 'Ce serveur', 'Entraîner Jarvis']) expect(html, x).not.toContain(x);
  });
  it('sans l’offre, la mémoire est fermée et le dit · sans marque, un état vide honnête', () => {
    expect(sources(propsSources({ memoire: null }))).toContain('La mémoire mesurée demande l’offre Plus');
    expect(sources(propsSources({ memoire: null }))).not.toContain('Décrire les créas');
    expect(sources(propsSources({ marque: null }))).toContain('Sélectionne une marque active');
  });
  it('le fondateur voit serveur, dépense, réconciliation et réglages · coûts sur les boutons', () => {
    const html = sources(propsSources({ fondateur: { serveur: { ok: true, resume: 'À jour.', detail: 'v3' }, depense: { bloquee: false, resume: '2 $ sur 10 $.', aReconcilier: '1 dépense' }, apprentissages: '', entraineLe: null, regles: '' } }));
    expect(html).toContain('Réglages maison');
    expect(html).toContain('data-rappel-reconciliation');
    expect(html).toMatch(/Entraîner Jarvis · \d+ crédits/);
    expect(html).toMatch(/Proposer par IA · \d+ crédits/);
    expect(html).toContain('Force du règlement · 0');
  });
});

/* ───────────────────────── Jarvis depuis la Veille ───────────────────────── */

describe('Spatial · Jarvis depuis la Veille', () => {
  const propsVeille = () => ({
    marque: { id: 'b1', nom: 'Marque réelle' }, action: 'cloner', libelleAction: 'Cloner pour ma marque',
    source: { annonceur: 'Ploufy', extrait: 'Une annonce' }, params: { action: 'cloner', ref: 'src1' }, retour: '/veille',
    brouillon: 'Crée une version visuellement similaire.\n\nSuite cachée', cout: 'Coût annoncé.',
  });
  it('rien ne part à l’ouverture · l’envoi transmet la source à la route, puis « Créer ce visuel » ouvre le passage vers les Studios', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(flux('Je garde la composition.'));
    h.chatThread.mockResolvedValue(fil([{ role: 'user', content: 'Crée une version visuellement similaire.' }, { role: 'assistant', content: 'Je garde la composition, je remplace le produit.' }]));
    await monter(<JarvisVeille {...propsVeille()} />);
    const champ = el.querySelector('textarea[aria-label="Ta demande à Jarvis"]') as HTMLTextAreaElement;
    expect(champ.value).toBe('Crée une version visuellement similaire.');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(el.textContent).not.toContain('Créer ce visuel');
    await act(async () => { (el.querySelector('form.jcomp') as HTMLFormElement).requestSubmit(); });
    expect(h.creer).toHaveBeenCalledWith('b1');
    expect(JSON.parse(String((fetchSpy.mock.calls[0]![1] as RequestInit).body))).toEqual({ message: 'Crée une version visuellement similaire.', conversationId: 'c-new', veille: { action: 'cloner', ref: 'src1' }, brandId: 'b1', sources: ['fiche'] });
    const ouvrir = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Créer ce visuel') as HTMLButtonElement;
    await act(async () => { ouvrir.click(); });
    expect(h.preparer).toHaveBeenCalledWith({ sources: [{ type: 'sauvegarde', id: 'src1' }], brandId: 'b1' });
    expect((el.querySelector('textarea[aria-label="Composition à transmettre au Studio"]') as HTMLTextAreaElement).value).toBe('Je garde la composition, je remplace le produit.');
    expect([...el.querySelectorAll('select[aria-label="Produit de ta marque"] option')].map((o) => o.textContent)).toEqual(['Choisir dans le Studio', 'Produit réel']);
  });
});
