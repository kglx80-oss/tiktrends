// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_VERDICT_CONFIG, outilsResultats, reperesTests, sousNavResultats, titreDecision } from '@tiktrends/core';

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/adsmap', useRouter: () => nav }));
// Les vues appellent les actions serveur EXISTANTES · remplacées par des espions (on vérifie ce qui part).
const a = vi.hoisted(() => ({
  valider: vi.fn(async (_: unknown) => ({ ok: true } as { ok?: true; error?: string })),
  iterer: vi.fn(async (_: unknown) => ({ ok: true, adId: '0b7c6f1e-1d2a-4c3b-9e8f-112233445566' } as { ok?: true; adId?: string; error?: string })),
  exporter: vi.fn(async (..._: unknown[]) => ({ csv: 'a;b', filename: 'x.csv' })),
  brief: vi.fn(async (_: string) => ({ angle: 'Angle' })),
  resoudre: vi.fn(async (..._: unknown[]) => ({ ok: true } as { ok?: true; error?: string })),
  recalculer: vi.fn(async () => ({})),
  creerLien: vi.fn(async (_: number) => ({ link: { id: 'l', token: 't', expiresAt: null, createdAt: '', expired: false } })),
  revoquer: vi.fn(async (_: string) => ({ ok: true })),
  suite: vi.fn(async (_: unknown) => ({ adId: 'n1', asIteration: true })),
  brouillon: vi.fn(async (_: unknown) => ({ view: { draft: { headline: 'Trois erreurs', beats: ['a'], hypothesis: 'Une accroche chiffrée retient mieux.' }, warning: null, rewritten: true, recommendation: '' } })),
  armer: vi.fn(async (_: unknown) => ({ state: {} })),
  passer: vi.fn(async () => ({ digest: 'ok' })),
  apercu: vi.fn(async (cap: number) => ({ nightly: cap * 0.02, monthly: cap * 0.6 })),
  proposer: vi.fn(async (..._: unknown[]) => ({ summary: '3 désirs proposés' })),
  suggerer: vi.fn(async () => ({ suggestion: { verdict: { ...DEFAULT_VERDICT_CONFIG, targetCpa: 31 }, protocol: { dailyBudgetPerAd: 42 }, notes: ['CPA médian 31 €'], fromRealData: true } })),
  enregistrer: vi.fn(async (_: unknown) => ({ ok: true })),
  apercuImport: vi.fn(async (_: string) => ({
    report: { rowsRead: 3, ads: 3, concepts: 2, angles: 1, desires: 1, batches: 1, verdicts: 1, learnings: 0, conceptsMerged: 1, demotedToDraft: 1, warnings: ['Ligne 3 · date illisible, laissée vide'] },
    sample: [{ concept: 'Trois erreurs', angle: 'Preuve', desire: 'Temps', variant: 'v1', status: 'draft', verdict: 'winner', date: null }],
  })),
  importer: vi.fn(async (_: string) => ({ report: { ads: 3 } })),
}));
vi.mock('../app/actions/adsmap-import', () => ({ previewImportAction: a.apercuImport, applyImportAction: a.importer }));
vi.mock('../app/actions/adsmap-verdict', () => ({ validateVerdictAction: a.valider, createIterationAction: a.iterer }));
vi.mock('../app/actions/adsmap', () => ({ exportAdsCsvAction: a.exporter, syncAdsMapAction: async () => ({}) }));
vi.mock('../app/actions/adsmap-bridge', () => ({ conceptBriefAction: a.brief }));
vi.mock('../app/actions/adsmap-decisions', () => ({ resolveDecisionAction: a.resoudre, refreshDecisionsAction: a.recalculer }));
vi.mock('../app/actions/adsmap-share', () => ({ createShareLinkAction: a.creerLien, revokeShareLinkAction: a.revoquer }));
vi.mock('../app/actions/adsmap-iterate', () => ({ createIterationAction: a.suite }));
vi.mock('../app/actions/adsmap-draft', () => ({ draftConceptAction: a.brouillon }));
vi.mock('../app/actions/adsmap-radar', () => ({ setRadarAction: a.armer, runRadarNowAction: a.passer, radarCostPreviewAction: a.apercu, conceptFromFindingAction: async () => ({}) }));
vi.mock('../app/actions/adsmap-propose', () => ({ proposePersonasAction: a.proposer, proposeDesiresAction: a.proposer, proposeAnglesAction: a.proposer, proposeConceptsAction: a.proposer }));
vi.mock('../app/actions/adsmap-curation', () => ({ validateNodeAction: async () => ({}), rejectNodeAction: async () => ({}), validateManyAction: async () => ({}), mergeCandidatesAction: async () => ({ personas: [] }), mergePlanAction: async () => ({}), mergePersonasAction: async () => ({}) }));
vi.mock('../app/actions/adsmap-protocol', () => ({ saveSettingsAction: a.enregistrer, suggestSettingsAction: a.suggerer }));
vi.mock('../app/actions/adsmap-batch', () => ({ setBatchAdAction: async () => ({}), prepareBatchAction: async () => ({}), launchBatchAction: async () => ({}) }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Tests } from '../spatial/vues/resultats/Tests';
import { FicheTest } from '../spatial/vues/resultats/FicheTest';
import { ActionsFiche } from '../spatial/vues/resultats/ActionsFiche';
import { Decisions } from '../spatial/vues/resultats/Decisions';
import { Carte } from '../spatial/vues/resultats/Carte';
import { Partage } from '../spatial/vues/resultats/Partage';
import { Suites } from '../spatial/vues/resultats/Suites';
import { Tri } from '../spatial/vues/resultats/Tri';
import { RadarAdsmap } from '../spatial/vues/resultats/RadarAdsmap';
import { Essais } from '../spatial/vues/resultats/Essais';
import { ReglagesProtocole } from '../spatial/vues/resultats/ReglagesProtocole';
import { VueEnsemble } from '../spatial/vues/resultats/VueEnsemble';
import { Lot } from '../spatial/vues/resultats/Lot';
import { Importer } from '../spatial/vues/resultats/Importer';
import { ActionsLot } from '../spatial/vues/resultats/ActionsLot';
import type { AdRow } from '../app/actions/adsmap';
import type { IterationRow } from '../app/actions/adsmap-iterate';

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin Guilbaux', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 10, dotation: 10, illimite: false },
  nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const NAV = sousNavResultats({ admin: true });
const rendre = (n: React.ReactNode) => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function monter(n: React.ReactNode) {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const root = createRoot(hote);
  act(() => root.render(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>));
  return { hote, fin: () => { act(() => root.unmount()); hote.remove(); } };
}
function saisir(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
function choisir(el: HTMLSelectElement, v: string) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }
const bouton = (h: Element, texte: RegExp) => [...h.querySelectorAll('button')].find((b) => texte.test(b.textContent ?? ''));
const liens = (h: Element) => [...h.querySelectorAll('a')].map((x) => x.getAttribute('href'));

const ID = '0b7c6f1e-1d2a-4c3b-9e8f-112233445566';
const ligne = (o: Partial<AdRow>): AdRow => ({
  id: ID, status: 'live', batchNumber: 2, author: null, concept: 'Trois erreurs', conceptId: 'c1', desire: 'Gagner du temps', angle: 'Preuve',
  iterationReason: null, hypothesis: 'Si on chiffre, alors on retient.', format: 'video', adType: 'video', briefUrl: null, assetUrl: null,
  variantCode: 'v1', testedVariable: 'hook', platform: 'meta', launchedAt: '2026-10-01T00:00:00Z', verdict: 'winner', verdictStatus: 'computed',
  comparable: true, failedStage: null, killFlag: null, cpa: 21.5, cpaHi: 30, spend: 120, purchases: 5, learnings: [], legacyFlags: [], ...o,
});

describe('Spatial · Résultats · Tous les tests', () => {
  const props = (lignes: AdRow[] | null, o: Partial<Parameters<typeof Tests>[0]> = {}) => ({
    sousNav: NAV, sous: 's', lots: [{ id: ID, number: 2, ads: 3 }], filtres: {}, lignes, erreur: null, reperes: reperesTests(lignes ?? []), admin: true, ...o,
  });
  it('chaque test mène à SA fiche · le verdict effectif et le taux honnête sont rendus', () => {
    const html = rendre(<Tests {...props([ligne({}), ligne({ id: 'b', verdict: 'winner', comparable: false, verdictStatus: 'validated' })])} />);
    expect(html).toContain(`href="/adsmap/tests/${ID}"`);
    expect(html).toContain('Prometteuse · relatif *');
    expect(html).toMatch(/Taux de réussite<\/div><div class="v">100 %/);
    expect(html).toContain('Exporter en CSV');
  });
  it('trois états vides distincts · erreur, filtres, marque sans test', () => {
    expect(rendre(<Tests {...props(null, { erreur: 'Lecture impossible' })} />)).toContain('Lecture impossible');
    expect(rendre(<Tests {...props([], { filtres: { status: 'live' } })} />)).toContain('Aucun test ne correspond à ces filtres');
    const vide = rendre(<Tests {...props([])} />);
    expect(vide).toContain('Aucun test pour l’instant');
    expect(vide).toMatch(/href="\/adsmap\/import"[^>]*>Importer ton tableau/);
    expect(rendre(<Tests {...props([], { admin: false })} />)).not.toContain('Importer ton tableau');
  });
  it('un filtre change l’adresse · l’export part avec les filtres courants', async () => {
    nav.push.mockClear(); a.exporter.mockClear();
    const url = { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() };
    Object.assign(URL, url);
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { hote, fin } = monter(<Tests {...props([ligne({})], { filtres: { verdict: 'winner' } })} />);
    act(() => choisir(hote.querySelectorAll('select')[1] as HTMLSelectElement, 'live'));
    expect(nav.push).toHaveBeenCalledWith('/adsmap/tests?statut=live&verdict=winner');
    await act(async () => bouton(hote, /Exporter en CSV/)!.click());
    expect(a.exporter).toHaveBeenCalledWith({ verdict: 'winner' }, true);
    expect(clic).toHaveBeenCalled();
    clic.mockRestore();
    fin();
  });
});

describe('Spatial · Résultats · fiche d’un test', () => {
  const base = {
    titre: 'Trois erreurs', sous: 'v1 · lot 2', provenance: null, retour: null, hypothese: 'Si on chiffre, alors on retient.', arbitre: null,
    apprentissages: [], filiation: { parent: null, enfants: [] },
  };
  it('mesuré · verdict, chiffres et protocole · à lancer · la prochaine étape réelle', () => {
    const m = rendre(<FicheTest {...base} resultat={{ type: 'mesure', verdict: { libelle: 'Gagnante', classe: 'g' }, relatif: true, etape: 'Clic', raison: 'CPA sous la cible', chiffres: [{ l: 'Coût par achat', v: '21,5 €' }], protocole: 'Protocole respecté' }} />);
    expect(m).toContain('Comparaison relative');
    expect(m).toContain('Bloque sur Clic');
    expect(m).toContain('21,5 €');
    const v = rendre(<FicheTest {...base} resultat={{ type: 'vide', texte: 'Pas encore lancée', prochaine: { texte: 'La placer dans un lot', lien: { href: '/adsmap/lots', libelle: 'Préparer un test' } } }} />);
    expect(v).toContain('Pas encore lancée');
    expect(v).toContain('href="/adsmap/lots"');
  });
  it('s’écarter du verdict calculé exige le motif · rien ne part sans lui, puis il part avec', async () => {
    a.valider.mockClear();
    const { hote, fin } = monter(<ActionsFiche adId={ID} arbitrage={{ calcule: 'winner' }} suite={{ type: 'attente', texte: 't' }} partage={false} />);
    const form = hote.querySelector('form')!;
    act(() => choisir(form.querySelector('select')!, 'loser'));
    const zones = () => form.querySelectorAll('textarea');
    expect(zones()).toHaveLength(2);
    act(() => saisir(zones()[1]!, 'Une accroche chiffrée retient mieux que la question.'));
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(a.valider).not.toHaveBeenCalled();
    expect(hote.querySelector('[role=alert]')!.textContent).toMatch(/écartes du verdict calculé/);
    act(() => saisir(zones()[0]!, 'Coupée par la modération au deuxième jour.'));
    act(() => bouton(form, /La page/)!.click());
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(a.valider).toHaveBeenCalledWith({ adId: ID, value: 'loser', overrideReason: 'Coupée par la modération au deuxième jour.', learning: { statement: 'Une accroche chiffrée retient mieux que la question.', scope: 'landing', confidence: 3 } });
    expect(hote.querySelector('[role=status]')!.textContent).toMatch(/Verdict validé/);
    fin();
  });
  it('une gagnante s’itère (une variable, une hypothèse) · l’invite de partage n’apparaît qu’à qui peut partager', async () => {
    a.iterer.mockClear();
    const { hote, fin } = monter(<ActionsFiche adId={ID} arbitrage={null} suite={{ type: 'gagnante', studio: '/studio/projets/nouveau?iter=x', etapeCiblee: 'click' }} partage />);
    expect(liens(hote)).toEqual(expect.arrayContaining(['/studio/projets/nouveau?iter=x', '/adsmap/partage']));
    act(() => bouton(hote, /Créer l’itération/)!.click());
    const form = hote.querySelector('form')!;
    act(() => choisir(form.querySelector('select')!, 'cta'));
    act(() => saisir(form.querySelector('input')!, 'Commander maintenant'));
    act(() => saisir(form.querySelector('textarea')!, 'Un appel direct fera monter le clic.'));
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(a.iterer).toHaveBeenCalledWith({ parentAdId: ID, mode: 'better', changedVariable: 'cta', variableValue: 'Commander maintenant', hypothesis: 'Un appel direct fera monter le clic.', stageTargeted: 'click' });
    expect(liens(hote)).toContain(`/adsmap/tests/${ID}`);
    fin();
    expect(rendre(<ActionsFiche adId={ID} arbitrage={null} suite={{ type: 'gagnante', studio: null, etapeCiblee: null }} partage={false} />)).not.toContain('/adsmap/partage');
  });
  it('une perdante ne s’itère pas · elle repart d’un projet neuf', () => {
    const html = rendre(<ActionsFiche adId={ID} arbitrage={null} suite={{ type: 'perdante', texte: 'On n’itère que sur une gagnante.', lien: '/studio/projets/nouveau?type=ads' }} partage />);
    expect(html).toContain('Reprendre l’angle dans un projet');
    expect(html).not.toContain('Créer l’itération');
    expect(html).not.toContain('/adsmap/partage');
  });
});

describe('Spatial · Résultats · file de décisions', () => {
  it('« Fait » ferme la décision par l’action · la ligne disparaît, la fiche reste à un clic', async () => {
    a.resoudre.mockClear();
    const { hote, fin } = monter(<Decisions sousNav={NAV} sous="s" resume="2 décisions" ecartees={0} erreur={null} decisions={[
      { id: 'd1', type: 'kill_suggested', titre: 'v1 brûle', action: 'Couper', priorite: 1, enJeu: 80, adId: ID },
      { id: 'd2', type: 'coverage_gap', titre: 'Désir jamais attaqué', action: '', priorite: 4, enJeu: null, adId: null },
    ]} />);
    expect(hote.textContent).toContain('80 € en jeu');
    expect(liens(hote)).toContain(`/adsmap/tests/${ID}`);
    await act(async () => bouton(hote, /^Fait$/)!.click());
    expect(a.resoudre).toHaveBeenCalledWith('d1', 'done');
    expect(hote.textContent).not.toContain('v1 brûle');
    expect(hote.textContent).toContain('Désir jamais attaqué');
    fin();
  });
});

describe('Spatial · Résultats · carte', () => {
  const noeuds = [
    { id: 'p1', kind: 'persona' as const, label: 'Parent pressé', parentId: null, status: 'validated', childCount: 1 },
    { id: 'd1', kind: 'desire' as const, label: 'Gagner du temps', parentId: 'p1', status: 'proposed', childCount: 0 },
  ];
  it('une branche morte se voit · construire n’est proposé qu’aux admins, prix annoncé', () => {
    const html = rendre(<Carte sousNav={NAV} sous="s" noeuds={noeuds} aretes={[]} tronquee={false} erreur={null} construire />);
    expect(html).toContain('Désir jamais attaqué');
    expect(html).toContain('Proposé');
    expect(html).toMatch(/Proposer des angles · \d+ crédits/);
    expect(rendre(<Carte sousNav={NAV} sous="s" noeuds={noeuds} aretes={[]} tronquee={false} erreur={null} construire={false} />)).not.toContain('Proposer');
  });
});

describe('Spatial · Résultats · partage client', () => {
  it('créer un lien part avec la durée choisie · un lien expiré ne se copie pas', async () => {
    a.creerLien.mockClear();
    const { hote, fin } = monter(<Partage sousNav={NAV} sous="s" erreur={null} liens={[
      { id: 'a', token: 'tok-actif', expiresAt: null, createdAt: '', expired: false },
      { id: 'b', token: 'tok-mort', expiresAt: '2026-01-01T00:00:00Z', createdAt: '', expired: true },
    ]} />);
    act(() => bouton(hote, /6 mois/)!.click());
    await act(async () => bouton(hote, /Créer un lien/)!.click());
    expect(a.creerLien).toHaveBeenCalledWith(180);
    expect(hote.querySelectorAll('.mrow:not(.h)')).toHaveLength(2);
    expect([...hote.querySelectorAll('.mrow:not(.h)')].map((r) => !!bouton(r, /Copier/))).toEqual([true, false]);
    fin();
  });
});

describe('Spatial · Résultats · suites', () => {
  const r: IterationRow = {
    adId: 'p1', label: 'v1 · Trois erreurs', spend: 120, mode: 'better', changedVariable: 'cta', stageTargeted: 'click', freeze: ['hook'],
    rationale: 'Elle a été vue et cliquée.', priority: 1, edgeLegal: false, modeLabel: 'Corriger', modeHint: 'Elle a buté.', variableLabel: 'l’appel à l’action',
    stageLabel: 'le clic', freezeLabels: ['l’accroche'], conceptTitle: 'Trois erreurs', parentVerdict: 'winner', parentComparable: false, parentEtapeLachee: 'le clic',
  };
  it('le prix de Jarvis est dit avant le clic · « Créer » attend une vraie hypothèse · la réserve non prouvée reste visible', async () => {
    a.suite.mockClear();
    const { hote, fin } = monter(<Suites sousNav={NAV} sous="s" erreur={null} plan={{ rows: [r], examined: 1, summary: '1 suite' }} />);
    expect(bouton(hote, /Demander le concept à Jarvis/)!.textContent).toMatch(/\$/);
    expect(hote.textContent).toContain('pas comme itération');
    expect(hote.textContent).toContain('l’accroche');
    act(() => bouton(hote, /^Créer la suite$/)!.click());
    const champ = hote.querySelector('textarea')!;
    act(() => saisir(champ, 'court'));
    expect(bouton(hote, /^Créer$/)!.disabled).toBe(true);
    act(() => saisir(champ, 'Un appel direct fera monter le clic.'));
    await act(async () => { hote.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(a.suite).toHaveBeenCalledWith({ parentAdId: 'p1', mode: 'better', changedVariable: 'cta', stageTargeted: 'click', hypothesis: 'Un appel direct fera monter le clic.' });
    expect(liens(hote)).toContain('/adsmap/tests/n1');
    fin();
  });
});

describe('Spatial · Résultats · tri, radar, essais', () => {
  const vue = { nodes: [], counts: { persona: 0, desire: 0, angle: 0, concept: 0 }, matched: { persona: 0, desire: 0, angle: 0, concept: 0 }, q: '', limit: 20 };
  it('la fusion de personas n’est proposée qu’à qui peut fusionner · le vide se dit', () => {
    expect(rendre(<Tri sousNav={NAV} sous="s" vue={vue} erreur={null} fusion />)).toContain('Fusionner deux personas');
    const membre = rendre(<Tri sousNav={NAV} sous="s" vue={vue} erreur={null} fusion={false} />);
    expect(membre).not.toContain('Fusionner deux personas');
    expect(membre).toContain('Rien n’attend d’être trié');
  });
  it('le radar annonce son coût avant l’interrupteur · rien à surveiller, rien à armer', () => {
    const v = { state: { armed: false, cap: 3, lastRunAt: null, nightlyCostUsd: 0.06, monthlyCostUsd: 1.8, followed: 0 }, findings: [], spend: { spentUsd: 2, capUsd: 10, summary: '2 $ sur 10 $.' } };
    const { hote, fin } = monter(<RadarAdsmap sousNav={NAV} sous="s" erreur={null} vue={v} />);
    const armer = bouton(hote, /Armer le radar/)!;
    expect(armer.textContent).toMatch(/au plus 0,\d\d \$ par nuit/);
    expect(armer.disabled).toBe(true);
    expect(hote.textContent).toContain('Il reste 8,00 $');
    fin();
  });
  it('les essais sans donnée le disent · aucun compteur inventé', () => {
    const html = rendre(<Essais sousNav={NAV} sous="s" essais={{}} notes={{}} calibration={{}} copies={{}} conseil={null} />);
    expect(html).toContain('Aucun lot d’essai poussé dans la carte');
    expect(html).toContain('Aucune créa notée pour l’instant');
    expect(html).toContain('Aucune publicité relue pour l’instant');
  });
});

describe('Spatial · Résultats · réglages détaillés du protocole', () => {
  it('proposer ne touche qu’à ce qui est mesuré · enregistrer envoie le formulaire complet', async () => {
    a.enregistrer.mockClear();
    const initial = { protocol: { structure: 'abo_one_adset_per_ad' as const, dailyBudgetPerAd: 20, durationDays: 7, audienceRule: 'broad', campaignNamePattern: 'CAMP', budgetVarianceTolerance: 0.2 }, verdict: { ...DEFAULT_VERDICT_CONFIG }, namingPattern: 'NOM', isDefault: false };
    const { hote, fin } = monter(<ReglagesProtocole initial={initial} peutModifier />);
    await act(async () => bouton(hote, /Proposer des seuils/)!.click());
    expect(hote.textContent).toContain('CPA médian 31 €');
    act(() => saisir(hote.querySelector('input[value="CAMP"]') as HTMLInputElement, 'CAMP-B'));
    await act(async () => bouton(hote, /Enregistrer les réglages/)!.click());
    const envoye = a.enregistrer.mock.calls[0]![0] as typeof initial;
    expect(envoye.verdict.targetCpa).toBe(31);
    expect(envoye.protocol).toMatchObject({ dailyBudgetPerAd: 42, durationDays: 7, campaignNamePattern: 'CAMP-B', structure: 'abo_one_adset_per_ad' });
    fin();
  });
  it('un membre lit, n’enregistre pas', () => {
    const initial = { protocol: { structure: 'abo_one_adset_per_ad' as const, dailyBudgetPerAd: 20, durationDays: 7, audienceRule: 'broad', campaignNamePattern: 'CAMP', budgetVarianceTolerance: 0.2 }, verdict: { ...DEFAULT_VERDICT_CONFIG }, namingPattern: 'NOM', isDefault: false };
    const html = rendre(<ReglagesProtocole initial={initial} peutModifier={false} />);
    expect(html).not.toContain('Proposer des seuils');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Enregistrer les réglages/);
  });
});

describe('Spatial · Résultats · les portes vers les gestes portés', () => {
  it('la vue d’ensemble mène aux écrans hors maquette (selon le rôle) · la fiche d’un lot mène à chaque variante', () => {
    const v = rendre(<VueEnsemble sousNav={NAV} sous="s" accroche={{ avant: '', fort: '', apres: '' }} kpis={[]} vedette={null} autres={[]} commencer={{ libelle: 'x', href: '/adsmap/lots' }} outils={outilsResultats({ admin: false })} />);
    expect(v).toContain('href="/adsmap/tests"');
    expect(v).toContain('href="/adsmap/decisions"');
    expect(v).not.toContain('href="/adsmap/partage"');
    const l = rendre(<Lot sous="s" titre="t" verdict={{ gagnant: false, titre: 't', phrase: 'p', niveau: 1 }} variantes={[]} controles={[]} coach={{ avant: '', fort: '', apres: '' }}
      reserves={['Lot repris d’un outil tiers']} fiches={[{ href: `/adsmap/tests/${ID}`, libelle: 'v1 · c', detail: 'En test · pas de verdict' }]} />);
    expect(l).toContain(`href="/adsmap/tests/${ID}"`);
    expect(l).toContain('Lot repris d’un outil tiers');
  });
});

describe('Spatial · Résultats · importer · chaque écart est listé avant que rien ne soit écrit', () => {
  it('l’aperçu montre les écarts et les premières lignes · après l’import, le tri et les tests sont à un clic', async () => {
    a.importer.mockClear();
    const { hote, fin } = monter(<Importer sousNav={NAV} meta={{ connecte: false, mesure: null }} remontees={[]} />);
    const fichier = new File(['concept;angle\nTrois erreurs;Preuve'], 'historique.csv', { type: 'text/csv' });
    await act(async () => {
      const ev = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer: { files: File[] } };
      Object.defineProperty(ev, 'dataTransfer', { value: { files: [fichier] } });
      hote.querySelector('.drop')!.dispatchEvent(ev);
    });
    expect(a.apercuImport).toHaveBeenCalledWith('concept;angle\nTrois erreurs;Preuve');
    expect(a.importer).not.toHaveBeenCalled();
    expect(hote.textContent).toContain('Ligne 3 · date illisible, laissée vide');
    expect(hote.textContent).toContain('Brouillon');
    expect(hote.textContent).toContain('Gagnante');
    await act(async () => bouton(hote, /Importer 3 variantes/)!.click());
    expect(a.importer).toHaveBeenCalledTimes(1);
    expect(liens(hote)).toEqual(expect.arrayContaining(['/adsmap/tri', '/adsmap/tests']));
    expect(hote.textContent).toContain('1 ad(s) attendent leur hypothèse');
    fin();
  });
});

describe('Spatial · Résultats · comportements repris de l’ancienne Adsmap', () => {
  const initial = () => ({ protocol: { structure: 'abo_one_adset_per_ad' as const, dailyBudgetPerAd: 20, durationDays: 7, audienceRule: 'broad', campaignNamePattern: 'CAMP', budgetVarianceTolerance: 0.2 }, verdict: { ...DEFAULT_VERDICT_CONFIG, targetCpa: 25 }, namingPattern: 'NOM', isDefault: false });

  it('protocole · un seul geste à la fois · deux clics du même instant n’enregistrent qu’une fois', async () => {
    a.enregistrer.mockClear();
    const { hote, fin } = monter(<ReglagesProtocole initial={initial()} peutModifier />);
    const b = bouton(hote, /Enregistrer les réglages/)!;
    await act(async () => { b.click(); b.click(); });
    expect(a.enregistrer).toHaveBeenCalledTimes(1);
    fin();
  });

  it('protocole · tolérance, confiance et écart de budget se saisissent en %, partent en fraction', async () => {
    a.enregistrer.mockClear();
    const { hote, fin } = monter(<ReglagesProtocole initial={initial()} peutModifier />);
    const champ = (libelle: RegExp) => [...hote.querySelectorAll('label.field')].find((l) => libelle.test(l.textContent ?? ''))!.querySelector('input')!;
    act(() => saisir(champ(/Tolérance/), '35'));
    act(() => saisir(champ(/Niveau de confiance/), '90'));
    act(() => saisir(champ(/Écart de budget toléré \(%\)/), '15'));
    await act(async () => bouton(hote, /Enregistrer les réglages/)!.click());
    const envoye = a.enregistrer.mock.calls[0]![0] as ReturnType<typeof initial>;
    expect(envoye.verdict.babyTolerance).toBeCloseTo(0.35);
    expect(envoye.verdict.ciLevelOneSided).toBeCloseTo(0.9);
    expect(envoye.protocol.budgetVarianceTolerance).toBeCloseTo(0.15);
    fin();
  });

  it('protocole · sans donnée Meta, « Proposer » ne change rien et le dit · CPA et nom de campagne saisis survivent', async () => {
    a.suggerer.mockResolvedValueOnce({ suggestion: { verdict: { ...DEFAULT_VERDICT_CONFIG }, protocol: { dailyBudgetPerAd: 20 }, notes: ['Pas assez de données'], fromRealData: false } });
    a.enregistrer.mockClear();
    const { hote, fin } = monter(<ReglagesProtocole initial={initial()} peutModifier />);
    await act(async () => bouton(hote, /Proposer des seuils/)!.click());
    expect(hote.textContent).toContain('Sans données Meta · rien n’a été modifié');
    await act(async () => bouton(hote, /Enregistrer les réglages/)!.click());
    const envoye = a.enregistrer.mock.calls[0]![0] as ReturnType<typeof initial>;
    expect(envoye.verdict.targetCpa).toBe(25);
    expect(envoye.protocol.campaignNamePattern).toBe('CAMP');
    fin();
  });

  it('lot · ce qui manque se lit à l’écran, chaque variante mène à sa fiche, un vivier vide mène aux Studios, un lot vide explique son 0 €', () => {
    const html = rendre(<ActionsLot mode="composition" lotId="l1" pret={false}
      variantes={[]}
      vivier={[{ id: 'v9', variante: 'v9', concept: 'Trois erreurs', manques: ['l’hypothèse', 'l’offre'], nom: null }]}
      brief={{ campagne: 'C', structure: 'ABO', budgetJour: 20, jours: 7, audience: 'broad', total: 0, conclusivite: 'ok' }} />);
    expect(html).toContain('Il manque l’hypothèse, l’offre');
    expect(html).toContain('0 € prévus · le total suit le nombre de variantes');
    const plein = rendre(<ActionsLot mode="composition" lotId="l1" pret={false}
      variantes={[{ id: ID, variante: 'v1', concept: 'c', manques: [], nom: 'NOM-1', blocage: 'Offre absente', avis: 'Accroche déjà perdue ici', adset: 'AS-1' }]}
      vivier={[]} brief={null} />);
    expect(plein).toContain(`href="/adsmap/tests/${ID}"`);
    expect(plein).toContain('Offre absente');
    expect(plein).toContain('Accroche déjà perdue ici');
    expect(plein).toContain('href="/studio/projets/nouveau"');
  });

  it('fiche ouverte depuis les Studios · le chemin du retour est rendu', () => {
    const html = rendre(<FicheTest titre="t" sous="s" provenance={null} retour={{ href: '/studio/projets', libelle: 'Retour aux Studios' }} hypothese={null} arbitre={null} apprentissages={[]} filiation={{ parent: null, enfants: [] }}
      resultat={{ type: 'vide', texte: 'Pas encore lancée', prochaine: null }} />);
    expect(html).toMatch(/href="\/studio\/projets"[^>]*>.*Retour aux Studios/);
    expect(rendre(<FicheTest titre="t" sous="s" provenance={null} retour={null} hypothese={null} arbitre={null} apprentissages={[]} filiation={{ parent: null, enfants: [] }}
      resultat={{ type: 'vide', texte: 'x', prochaine: null }} />)).not.toContain('Retour aux Studios');
  });

  it('table · un test sans verdict s’ouvre, il ne s’« arbitre » pas', () => {
    const html = rendre(<Tests sousNav={NAV} sous="s" lots={[]} filtres={{}} lignes={[ligne({ verdict: null, verdictStatus: null })]} erreur={null} reperes={reperesTests([])} admin />);
    expect(html).toMatch(/>Ouvrir<\/a>/);
    expect(html).not.toMatch(/>Arbitrer<\/a>/);
  });

  it('suites · le filtre de mode vit dans l’adresse sans empiler · le mode se lit en texte', () => {
    const r = { adId: 'p1', label: 'v1', spend: null, mode: 'better' as const, changedVariable: 'cta' as const, stageTargeted: null, freeze: [], rationale: 'r', priority: 1, edgeLegal: true, modeLabel: 'Corriger', modeHint: 'h', variableLabel: 'l’appel à l’action', stageLabel: null, freezeLabels: [], conceptTitle: 'c', parentVerdict: 'winner' as const, parentComparable: true, parentEtapeLachee: null };
    const longueur = window.history.length;
    const { hote, fin } = monter(<Suites sousNav={NAV} sous="s" erreur={null} plan={{ rows: [r], examined: 1, summary: '1' }} />);
    expect(hote.querySelector('.pill')!.textContent).toBe('Corriger');
    act(() => bouton(hote, /^Corriger · 1$/)!.click());
    expect(window.location.search).toBe('?mode=better');
    expect(window.history.length).toBe(longueur);
    fin();
    window.history.replaceState(null, '', window.location.pathname);
  });

  it('essais · le conseil du prochain essai est hors des replis · chaque lecture garde son ancre', () => {
    const html = rendre(<Essais sousNav={NAV} sous="s" essais={{}} notes={{}} calibration={{}} copies={{}} conseil={{ question: 'Tester l’accroche ?', pourquoi: 'p', avantTout: null, variable: 'hook' }} />);
    const conseil = html.indexOf('Tester l’accroche ?');
    expect(conseil, 'le conseil du prochain essai a disparu').toBeGreaterThan(-1);
    expect(conseil, 'le conseil est enfermé dans un repli').toBeLessThan(html.indexOf('<details'));
    for (const id of ['essais', 'bilan-notes', 'bilan-copie']) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('href="/studio/projets"');
  });

  it('radar · sans concurrent suivi, « Armer » se lit désactivé (pas en bouton principal) et mène à la Veille', () => {
    const v = { state: { armed: false, cap: 3, lastRunAt: null, nightlyCostUsd: 0.06, monthlyCostUsd: 1.8, followed: 0 }, findings: [], spend: { spentUsd: 0, capUsd: 10, summary: '' } };
    const html = rendre(<RadarAdsmap sousNav={NAV} sous="s" erreur={null} vue={v} />);
    expect(html).toMatch(/<button type="button" class="btn sm " disabled="">Armer le radar/);
    expect(html).toContain('href="/veille"');
    expect(html).toMatch(/au plus <b>trois<\/b> créas décrites/);
  });
});

describe('Spatial · Résultats · À décider se lit sans clé technique ni « n.c. » (banc)', () => {
  it('le type est en français, le titre nomme le test ou dit honnêtement qu’il est perdu', () => {
    const html = rendre(<Decisions sousNav={NAV} sous="s" resume="r" ecartees={0} erreur={null} decisions={[
      { id: 'd1', type: 'review_learning', titre: titreDecision({ type: 'review_learning', titre: 'n.c.', cible: { kind: 'ad', nom: 'v2 · Listicle' } }), action: 'Relire', priorite: 3, enJeu: null, adId: ID },
      { id: 'd2', type: 'coverage_gap', titre: titreDecision({ type: 'coverage_gap', titre: 'n.c.', cible: { kind: 'angle', nom: null } }), action: '', priorite: 4, enJeu: null, adId: null },
    ]} />);
    expect(html).toContain('Apprentissage à relire');
    expect(html).toContain('Piste inexplorée');
    expect(html).toContain('<strong>Test v2 · Listicle</strong>');
    expect(html).toContain('n’est plus identifiable');
    expect(html).not.toMatch(/review_learning|coverage_gap|>n\.c\.</);
  });
});
