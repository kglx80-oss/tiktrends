// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Fermer la boucle du commentaire, et les mentions · base RÉELLE (pglite,
 * migrations du dépôt), VRAIES actions (gardes relues · session, rôle, marque
 * active, portée de marque), VRAIE fiche rendue (`chargerProjet` → `<Projet>`,
 * onglet « Activité ») et montée · on lit le DOM et ce qui est écrit.
 *
 *  · résultat · commentaire → « Itérer depuis ce commentaire » (la vraie
 *    action, provenance relue) → lot conclu · confirmée, infirmée, sans
 *    conclusion, chacune avec son chiffre et le lien vers le lot · « en test »
 *    avant, rien sans itération · rien n'est écrit pour l'afficher · Résultats
 *    fermé, rien · autre marque active, le lien fermé avec sa raison ;
 *  · mentions · la liste au clavier (↓ ↑ Entrée Échap, combobox/listbox) ne
 *    propose que les membres qui voient le projet · stockée par IDENTIFIANT
 *    dans `history` · affichée sous le nom courant, « un ancien membre » sinon ·
 *    chaque mentionné prévenu UNE fois (création puis modifications) · jamais
 *    l'auteur · le propriétaire mentionné reçoit la mention seule · un membre
 *    hors de la marque, d'un autre espace, lecteur, masqué · ni proposé, ni
 *    retenu, ni prévenu (identifiants forgés) · `<script>` dans un nom ou un
 *    texte reste du texte.
 * 0 $ · fournisseur et stockage simulés, aucun appel réseau, aucune dépense.
 * Aucune date « à venir » · l'ordre est explicite (les lots sont lancés il y a
 * 30 jours, le lot « en test » il y a 2 jours, par rapport à l'horloge réelle).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios & Record<'um' | 'uk' | 'ux' | 'un', string>, session: null as SessionTest | null, marque: null as string | null }));
vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u(), um: u(), uk: u(), ux: u(), un: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/auth')>()), getSession: async () => h.session }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(), usePathname: () => '/studio/projets', useParams: () => ({}),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'tt_brand' && h.marque ? { value: h.marque } : undefined), getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ 'x-tt-chemin': '/studio/projets', host: 'localhost' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('../lib/jarvis-memory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/jarvis-memory')>()), invalidateJarvisMemory: () => {}, briefConceptBeforeLaunch: async () => ({ summary: '' }),
}));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));

import { db, schema, eq, and } from '@tiktrends/db';
import { LIBELLE_ANCIEN_MEMBRE, RAISON_LOT_AUTRE_MARQUE, lireMentions, lireProvenanceCommentaire, variablesDuPlan, type TestedVariable } from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { ctxDe } from './l3-harnais';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, KEYFRAMES, saisieTest } from './l4c-harnais';
import { avecSpatial } from './spatial/fournisseur';
import { creerVariante } from '../lib/studios/variantes/variantes';
import { rattacherVarianteAuTest } from '../lib/studios/variantes/tests';
import { commenterProjet, modifierCommentaire } from '../app/actions/studios/activite';
import { creerIterationChoisieAction } from '../app/actions/adsmap-iterer-variable';
import { iterationPlanAction } from '../app/actions/adsmap-iterate';
import { chargerProjet } from '../app/(spatial)/sp/studio/projets/[id]/donnees';
import { Projet } from '../spatial/vues/projet/Projet';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });

const ids = h.ids;
const NOM_ZOE = 'Zoé <script>window.__mention = 1</script> Martin';
const S = {
  P1: '', gagnante: '', creations: [] as Array<{ asset: string; ad: string }>,
  kC: '', kI: '', kS: '', kT: '', kRien: '',
  LC: '', LI: '', LS: '', LT: '', nC: 0, nI: 0, nS: 0, nT: 0,
  itC: '', itI: '', itS: '', itT: '',
};
const proprietaire = (o: Partial<SessionTest> = {}): SessionTest => session(ids, 'ua', { role: 'owner', plan: 'plus', ...o });
const admise: Record<string, TestedVariable> = {};

async function chaine(titre: string) {
  const [pe] = await db.insert(schema.personas).values({ brandId: ids.brandA1, name: `Persona ${titre}` }).returning();
  const [de] = await db.insert(schema.desires).values({ workspaceId: ids.wsA, personaId: pe!.id, label: 'Désir' }).returning();
  const [an] = await db.insert(schema.angles).values({ workspaceId: ids.wsA, desireId: de!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db.insert(schema.concepts).values({ workspaceId: ids.wsA, angleId: an!.id, title: titre }).returning();
  return co!.id;
}
let numero = 10;
async function lot(goal: string, joursDepuisLancement = 30) {
  numero += 1;
  const [b] = await db.insert(schema.batches).values({ workspaceId: ids.wsA, brandId: ids.brandA1, number: numero, goal, status: 'testing', launchedAt: new Date(Date.now() - joursDepuisLancement * 86_400_000) }).returning({ id: schema.batches.id });
  return { id: b!.id, n: numero };
}
async function verdict(adId: string, v: 'winner' | 'loser') {
  await db.insert(schema.verdicts).values({
    adId, workspaceId: ids.wsA, computed: v, validated: v, status: 'validated', comparable: true,
    metricsAgg: { spend: 120, impressions: 18000, purchases: v === 'winner' ? 12 : 3, cpa: v === 'winner' ? 10 : 40, roas: v === 'winner' ? 2.4 : 0.6 },
  });
}
async function remplir(concept: string, lotId: string, issues: Array<'winner' | 'loser'>, prefixe: string) {
  for (const [i, v] of issues.entries()) {
    const [a] = await db.insert(schema.ads).values({ workspaceId: ids.wsA, conceptId: concept, batchId: lotId, variantCode: `${prefixe}${i + 1}`, status: 'done', hypothesis: `Si on teste ${prefixe}${i + 1}, alors le coût par achat baisse.`, testedVariable: 'hook' }).returning({ id: schema.ads.id });
    await verdict(a!.id, v);
  }
}
async function commenter(texte: string, mentions?: unknown, cibleId = S.gagnante) {
  const r = await commenterProjet({ projectId: S.P1, cible: 'creation', cibleId, texte, ...(mentions !== undefined ? { mentions } : {}) });
  if (!r.ok) throw new Error(`commenter ${JSON.stringify(r)}`);
  return r.commentaires.find((c) => c.texte === texte)!.id;
}
async function iterer(commentaireId: string, parentAdId: string, valeur: string) {
  const r = await creerIterationChoisieAction({
    parentAdId, variable: admise[parentAdId]!, valeur, hypothese: `Si on change ${valeur}, alors le coût par achat baisse, parce que le commentaire l’a vu.`,
    commentaire: { commentaireId, projetId: S.P1 },
  });
  if (!r.ok) throw new Error(`itérer ${r.error}`);
  expect(r.provenance, 'la provenance « Commentaire » n’est pas posée').toBe('commentaire');
  return r.adId;
}

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'plus', onboardedAt: new Date() }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));
  // Les membres et leurs noms · `um` (toutes marques), `un` (toutes marques), `uk` (restreint à A2 · hors de la marque du projet),
  // `ux` (masque ses informations), `uv` (lecteur client), `ub` (autre espace), `ur` (restreint à A1).
  await db.insert(schema.users).values(([['um', NOM_ZOE], ['uk', 'Karim Hors Marque'], ['ux', 'Xavier Masqué'], ['un', 'Nina Nouvelle']] as const)
    .map(([q, nom]) => ({ id: ids[q], email: `${q}@studios.test`, name: nom, hidePersonalInfo: q === 'ux' })));
  await db.insert(schema.workspaceMembers).values((['um', 'uk', 'ux', 'un'] as const).map((q) => ({ workspaceId: ids.wsA, userId: ids[q], role: 'member' as const })));
  await db.insert(schema.studioMemberBrandScopes).values({ workspaceId: ids.wsA, userId: ids.uk, brandId: ids.brandA2 });
  for (const [q, nom] of [['ua', 'Anne Propriétaire'], ['ur', 'Rémi Restreint'], ['uv', 'Valérie Lectrice'], ['ub', 'Bob Autre Espace']] as const) {
    await db.update(schema.users).set({ name: nom }).where(eq(schema.users.id, ids[q]));
  }
  h.session = proprietaire(); h.marque = ids.brandA1;

  // ── P1 (A1) · quatre créations retenues, testées, gagnantes arbitrées (une itération par gagnante · le plan n'en propose qu'une).
  S.P1 = (await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum · boucle' })).projectId;
  const job = await lancerLot(db, ctxDe(ids, 'ua'), S.P1, KEYFRAMES(4));
  await executer(db, job);
  const sorties = await sortiesDuJob(db, job);
  for (let i = 1; i <= 4; i += 1) {
    const asset = sorties[`keyframe:s${i}`]!;
    const v = await creerVariante(ctxDe(ids, 'ua'), { assetId: asset });
    if (!v.ok) throw new Error(`variante ${v.code}`);
    const l = await rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: v.variante.id, saisie: saisieTest() });
    if (!l.ok) throw new Error(`rattacher ${l.code}`);
    await verdict(l.lien.adsmapAdId, 'winner');
    S.creations.push({ asset, ad: l.lien.adsmapAdId });
  }
  S.gagnante = S.creations[0]!.asset;

  // ── Résultats (A1) · une référence (6 sur 12), et les lots où les itérations seront mesurées.
  const c = await chaine('Crème');
  const R = await lot('Référence de la marque');
  await remplir(c, R.id, [...Array(6).fill('winner'), ...Array(6).fill('loser')], 'R');
  const plan = variablesDuPlan((await iterationPlanAction()).view!.rows);
  for (const c0 of S.creations) {
    const choix = plan[c0.ad];
    if (!choix) throw new Error('préalable · une gagnante du projet n’est pas dans le plan d’itération');
    admise[c0.ad] = choix.options.find((o) => o.admise)!.variable;
  }
}, 240_000);

/* ───────────────────────────── outils ───────────────────────────── */

let root: Root | null = null;
beforeEach(() => { h.session = proprietaire(); h.marque = ids.brandA1; });
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; });
async function monter(el: ReactElement) {
  act(() => { root?.unmount(); });
  document.body.innerHTML = '<div id="app"></div><div id="orn" hidden></div>';
  root = createRoot(document.getElementById('app')!);
  await act(async () => { root!.render(avecSpatial(el)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
}
async function ficheMontee(projectId = S.P1) {
  const r = await chargerProjet(h.session as never, projectId);
  if (!r.ok) throw new Error(JSON.stringify(r.raison));
  await monter(<Projet {...r.props} ongletInitial="activite" />);
}
async function ficheRendue(projectId = S.P1) {
  const r = await chargerProjet(h.session as never, projectId);
  if (!r.ok) throw new Error(JSON.stringify(r.raison));
  const html = renderToStaticMarkup(avecSpatial(<Projet {...r.props} ongletInitial="activite" />));
  const d = document.createElement('div'); d.innerHTML = html;
  return { d, html };
}
const attendre = async () => { await act(async () => { for (let i = 0; i < 20; i += 1) await new Promise((r) => setTimeout(r, 5)); }); };
async function saisir(el: HTMLTextAreaElement, valeur: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, valeur); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function touche(el: Element, key: string) {
  await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
}
const resultat = (d: ParentNode, k: string) => d.querySelector(`[data-commentaire="${k}"] [data-resultats-commentaire]`);
const options = () => [...document.querySelectorAll('[data-liste-mentions] [role="option"]')].map((o) => o.textContent);
async function notifs(u: string) {
  const N = schema.notifications;
  return db.select({ type: N.type, titre: N.title, corps: N.body, href: N.href }).from(N).where(eq(N.userId, u));
}
async function codeDe(adId: string) {
  const [a] = await db.select({ c: schema.ads.variantCode }).from(schema.ads).where(eq(schema.ads.id, adId));
  return a!.c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
async function ligne(k: string) {
  const [l] = await db.select().from(schema.studioComments).where(eq(schema.studioComments.id, k));
  return l!;
}

/* ───────────────────────────── 1 · le résultat sur le commentaire d’origine ───────────────────────────── */

describe('le résultat d’une itération née d’un commentaire · calculé depuis la conclusion de son lot, sur le commentaire d’origine', () => {
  it('commentaire sans itération · rien · itérations créées par la VRAIE action, hors lot · « en test », aucun statut ni chiffre', async () => {
    S.kRien = await commenter('Rien à itérer ici, la création tient.');
    const [g0, g1, g2, g3] = S.creations as [typeof S.creations[0], typeof S.creations[0], typeof S.creations[0], typeof S.creations[0]];
    S.kC = await commenter('Il faudrait essayer une autre accroche · piste C.', undefined, g0.asset);
    S.kI = await commenter('Il faudrait essayer une autre accroche · piste I.', undefined, g1.asset);
    S.kS = await commenter('Il faudrait essayer une autre accroche · piste S.', undefined, g2.asset);
    S.kT = await commenter('Il faudrait essayer une autre accroche · piste T.', undefined, g3.asset);
    const avant = await ficheRendue();
    for (const k of [S.kRien, S.kC, S.kI, S.kS, S.kT]) expect(resultat(avant.d, k), `un résultat sans itération (${k})`).toBeNull();

    S.itC = await iterer(S.kC, g0.ad, 'Une accroche douleur, piste C');
    S.itI = await iterer(S.kI, g1.ad, 'Une accroche douleur, piste I');
    S.itS = await iterer(S.kS, g2.ad, 'Une accroche douleur, piste S');
    S.itT = await iterer(S.kT, g3.ad, 'Une accroche douleur, piste T');
    const [ad] = await db.select({ s: schema.ads.sourceRef }).from(schema.ads).where(eq(schema.ads.id, S.itC));
    expect(lireProvenanceCommentaire(ad!.s)).toEqual({ commentaireId: S.kC, projetId: S.P1 });

    const { d, html } = await ficheRendue();
    expect(resultat(d, S.kRien), 'un résultat sur le commentaire sans itération').toBeNull();
    for (const [k, it] of [[S.kC, S.itC], [S.kI, S.itI], [S.kS, S.itS], [S.kT, S.itT]] as const) {
      const r = resultat(d, k)!;
      expect([...r.querySelectorAll('[data-resultat-commentaire]')].map((x) => x.getAttribute('data-resultat-commentaire')), `l’itération de ${k} n’est pas « en test »`).toEqual(['en_test']);
      expect(r.textContent).toMatch(new RegExp(`^Itération en test ${await codeDe(it)} · son résultat se lira ici quand son lot sera conclu$`));
    }
    expect(html, 'un statut avant la conclusion').not.toMatch(/Itération (confirmée|infirmée|sans conclusion)|data-chiffre-resultat|data-lien-lot/);
  });

  it('les lots se concluent · confirmée, infirmée, sans conclusion · le chiffre clé et le lien vers le lot · « en test » tant que son lot ne l’est pas · rien n’est écrit pour l’afficher', async () => {
    const c = await chaine('Crème itérée');
    const C = await lot('Itération C'); const I = await lot('Itération I'); const Sx = await lot('Itération S'); const T = await lot('Itération T · en diffusion', 2);
    Object.assign(S, { LC: C.id, nC: C.n, LI: I.id, nI: I.n, LS: Sx.id, nS: Sx.n, LT: T.id, nT: T.n });
    await remplir(c, C.id, ['winner', 'winner', 'winner', 'winner'], 'C');
    await remplir(c, I.id, ['loser', 'loser', 'loser', 'loser'], 'I');
    await remplir(c, Sx.id, ['winner', 'loser', 'loser'], 'S');
    for (const [ad, l] of [[S.itC, C.id], [S.itI, I.id], [S.itS, Sx.id], [S.itT, T.id]] as const) await db.update(schema.ads).set({ batchId: l, status: 'done' }).where(eq(schema.ads.id, ad));
    // Le verdict de l'itération C manque encore · son lot n'est pas conclu · « en test ».
    await verdict(S.itI, 'loser'); await verdict(S.itS, 'winner');
    const encore = await ficheRendue();
    expect(resultat(encore.d, S.kC)!.querySelector('[data-resultat-commentaire]')!.getAttribute('data-resultat-commentaire'), 'un statut avant la conclusion du lot C').toBe('en_test');
    await verdict(S.itC, 'winner');

    const C0 = await Promise.all([S.kC, S.kI, S.kS, S.kT, S.kRien].map(ligne));
    const { d } = await ficheRendue();
    const lu = (k: string) => {
      const r = resultat(d, k)!.querySelector('[data-resultat-commentaire]')!;
      return { statut: r.getAttribute('data-resultat-commentaire'), pastille: r.querySelector('.pill')?.textContent ?? '', chiffre: r.querySelector('[data-chiffre-resultat]')?.textContent ?? null, lien: r.querySelector('a[data-lien-lot]')?.getAttribute('href') ?? null };
    };
    const c1 = lu(S.kC);
    expect([c1.statut, c1.pastille, c1.lien]).toEqual(['confirmee', 'Itération confirmée', `/adsmap/lots/${S.LC}`]);
    expect(c1.chiffre).toMatch(new RegExp(`^${await codeDe(S.itC)} · lot #${S.nC} · 5 gagnantes sur 5 variantes tranchées \\(\\d+ % à 100 %\\) · la marque, 8 sur 21 dans ses autres lots \\(\\d+ % à \\d+ %\\)$`));
    const i1 = lu(S.kI);
    expect([i1.statut, i1.pastille, i1.lien]).toEqual(['infirmee', 'Itération infirmée', `/adsmap/lots/${S.LI}`]);
    expect(i1.chiffre).toMatch(new RegExp(`^${await codeDe(S.itI)} · lot #${S.nI} · 0 gagnante sur 5 variantes tranchées`));
    const s1 = lu(S.kS);
    expect([s1.statut, s1.pastille, s1.lien]).toEqual(['sans_conclusion', 'Itération sans conclusion', `/adsmap/lots/${S.LS}`]);
    expect(s1.chiffre).toMatch(new RegExp(`^${await codeDe(S.itS)} · lot #${S.nS} · 2 gagnantes sur 4 variantes tranchées`));
    expect(lu(S.kT).statut, 'le lot en diffusion · encore en test').toBe('en_test');
    expect(resultat(d, S.kRien)).toBeNull();
    // Afficher n'a rien écrit · le statut n'est ni posé ni recopié sur le commentaire.
    expect(await Promise.all([S.kC, S.kI, S.kS, S.kT, S.kRien].map(ligne))).toEqual(C0);
    expect(JSON.stringify(C0.map((x) => x.history))).not.toMatch(/confirm|infirm|conclusion/);
  });

  it('autre marque active · le résultat se dit, le lien vers le lot est fermé avec sa raison · Résultats fermé · rien', async () => {
    h.marque = ids.brandA2;
    const a = await ficheRendue();
    const r = resultat(a.d, S.kC)!;
    expect(r.querySelector('[data-resultat-commentaire]')!.getAttribute('data-resultat-commentaire')).toBe('confirmee');
    const b = r.querySelector('button[data-lien-lot]') as HTMLButtonElement;
    expect([b?.getAttribute('aria-disabled'), r.querySelector('a[data-lien-lot]')]).toEqual(['true', null]);
    expect(r.querySelector(`#${CSS.escape(b.getAttribute('aria-describedby')!)}`)?.textContent).toBe(RAISON_LOT_AUTRE_MARQUE);
    h.marque = ids.brandA1;
    h.session = proprietaire({ plan: 'core' });
    const f = await ficheRendue();
    expect(f.d.querySelector('[data-resultats-commentaire]'), 'Résultats fermé · un résultat est dit').toBeNull();
    expect(f.html).not.toMatch(/Itération (confirmée|infirmée|sans conclusion|en test)/);
  });
});

/* ───────────────────────────── 2 · les mentions ───────────────────────────── */

describe('les mentions · la liste au clavier, l’identifiant stocké, le nom affiché, une notification par personne', () => {
  let kM = '';
  it('la liste · combobox/listbox · seuls les membres qui voient le projet (ni l’auteur, ni le lecteur, ni hors marque, ni masqué, ni autre espace)', async () => {
    await ficheMontee();
    const champ = document.querySelector('[data-champ="texte-commentaire"]') as HTMLTextAreaElement;
    expect([champ.getAttribute('role'), champ.getAttribute('aria-autocomplete'), champ.getAttribute('aria-expanded')]).toEqual(['combobox', 'list', 'false']);
    await saisir(champ, '@');
    expect(champ.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(champ.getAttribute('aria-controls')!)?.getAttribute('role')).toBe('listbox');
    expect(options(), 'la liste ne dit pas les membres qui voient le projet').toEqual([`@${NOM_ZOE}`, '@Nina Nouvelle', '@Rémi Restreint'].sort((x, y) => x.localeCompare(y, 'fr', { sensitivity: 'base' })));
    expect(document.body.innerHTML).not.toMatch(/Karim|Xavier|Valérie|Bob Autre|Anne Propri/);
    // Échap ferme la liste, le texte reste.
    await touche(champ, 'Escape');
    expect([champ.getAttribute('aria-expanded'), champ.value]).toEqual(['false', '@']);
    expect((document.querySelector('[data-liste-mentions]') as HTMLElement).hidden).toBe(true);
  });

  it('↓ ↑ parcourent, Entrée choisit · « @Nom » inséré · publier · stockée par IDENTIFIANT et place · affichée en texte · chaque mentionné prévenu une fois, l’auteur jamais', async () => {
    await ficheMontee();
    const champ = document.querySelector('[data-champ="texte-commentaire"]') as HTMLTextAreaElement;
    await saisir(champ, 'Vu avec @');
    const actif = () => document.getElementById(champ.getAttribute('aria-activedescendant') ?? '')?.textContent;
    const premiere = options()[0];
    expect(actif()).toBe(premiere);
    await touche(champ, 'ArrowDown');
    expect(actif()).toBe(options()[1]);
    await touche(champ, 'ArrowUp'); await touche(champ, 'ArrowUp');
    expect(actif(), 'la flèche vers le haut ne boucle pas').toBe(options()[options().length - 1]);
    await saisir(champ, 'Vu avec @zo');
    expect(options()).toEqual([`@${NOM_ZOE}`]);
    await touche(champ, 'Enter');
    await attendre();
    expect(champ.value).toBe(`Vu avec @${NOM_ZOE} `);
    expect(document.activeElement, 'le focus quitte le champ après le choix').toBe(champ);
    expect(champ.selectionStart, 'le curseur n’est pas après la mention').toBe(champ.value.length);
    await saisir(champ, `${champ.value}et @ré`);
    await touche(champ, 'Enter');
    await attendre();
    await saisir(champ, `${champ.value}<script>window.__texte = 1</script> à revoir`);
    await act(async () => { (document.querySelector('[data-nouveau-commentaire]') as HTMLFormElement).requestSubmit(); });
    await attendre();

    const [k] = await db.select().from(schema.studioComments).where(and(eq(schema.studioComments.projectId, S.P1), eq(schema.studioComments.body, `Vu avec @${NOM_ZOE} et @Rémi Restreint <script>window.__texte = 1</script> à revoir`)));
    expect(k, 'le commentaire n’est pas écrit tel quel').toBeTruthy();
    kM = k!.id;
    const debutZ = 'Vu avec '.length; const debutR = `Vu avec @${NOM_ZOE} et `.length;
    expect(k!.history, 'stockée par identifiant et place, chaque personne prévenue').toEqual([{
      mentions: [{ id: ids.um, debut: debutZ, longueur: NOM_ZOE.length + 1 }, { id: ids.ur, debut: debutR, longueur: '@Rémi Restreint'.length }],
      prevenus: [ids.um, ids.ur],
    }]);
    expect(JSON.stringify(k!.history), 'un nom dans le stockage des mentions').not.toMatch(/Zoé|Rémi/);
    // Affichée · le nom courant, en TEXTE · aucun élément <script>.
    const carte = document.querySelector(`[data-commentaire="${kM}"]`)!;
    expect(carte.querySelector(`[data-mention="${ids.um}"]`)?.textContent).toBe(`@${NOM_ZOE}`);
    expect(carte.querySelector(`[data-mention="${ids.ur}"]`)?.textContent).toBe('@Rémi Restreint');
    expect(document.querySelector('[data-commentaires-projet] script')).toBeNull();
    expect((window as { __mention?: number; __texte?: number }).__mention ?? (window as { __texte?: number }).__texte).toBeUndefined();
    const { html } = await ficheRendue();
    expect(html).toContain('&lt;script&gt;window.__mention = 1&lt;/script&gt;');
    expect(html).not.toMatch(/<script>window\.__(mention|texte)/);
    // Prévenus · une fois chacun, par le mécanisme existant · l'auteur (propriétaire) jamais.
    const attendu = (titre: string) => [{ type: 'studio_comment_mention', titre, corps: expect.stringContaining('Vu avec @Zoé'), href: `/studio/projets/${S.P1}#activite` }];
    expect(await notifs(ids.um)).toEqual(attendu('On te mentionne dans un commentaire · Sérum · boucle'));
    expect(await notifs(ids.ur)).toEqual(attendu('On te mentionne dans un commentaire · Sérum · boucle'));
    expect(await notifs(ids.ua), 'l’auteur prévenu').toEqual([]);
    for (const q of ['uk', 'ux', 'uv', 'ub', 'un'] as const) expect(await notifs(ids[q]), `${q} prévenu`).toEqual([]);
  });

  it('modifier · la mention tient (nom courant), aucune nouvelle notification · un membre ajouté est prévenu UNE fois · retiré puis remis, jamais deux', async () => {
    await ficheMontee();
    const carte = () => document.querySelector(`[data-commentaire="${kM}"]`)!;
    await act(async () => { (carte().querySelector('[data-geste="modifier-commentaire"]') as HTMLButtonElement).click(); });
    const champ = carte().querySelector('[data-champ="edition-commentaire"]') as HTMLTextAreaElement;
    expect(champ.value).toBe(`Vu avec @${NOM_ZOE} et @Rémi Restreint <script>window.__texte = 1</script> à revoir`);
    await saisir(champ, `${champ.value} · cc @nin`);
    await touche(champ, 'Enter');
    await attendre();
    await act(async () => { (carte().querySelector('[data-geste="enregistrer-commentaire"]') as HTMLButtonElement).click(); });
    await attendre();
    const l = await ligne(kM);
    expect(lireMentions(l.history, l.body).mentions.map((m) => m.id)).toEqual([ids.um, ids.ur, ids.un]);
    expect((l.history as Array<{ texte?: string }>)[0]!.texte, 'l’ancien texte est gardé').toContain('à revoir');
    expect(await notifs(ids.un)).toHaveLength(1);
    expect([(await notifs(ids.um)).length, (await notifs(ids.ur)).length], 'une mention qui tient prévient deux fois').toEqual([1, 1]);
    // Retirée puis remise (actions directes) · jamais une seconde notification.
    const r1 = await modifierCommentaire({ commentId: kM, rowVersion: l.rowVersion, texte: 'Plus personne ici.', mentions: [] });
    if (!r1.ok) throw new Error(JSON.stringify(r1));
    const l2 = await ligne(kM);
    expect(lireMentions(l2.history, l2.body), 'les personnes prévenues ne sont pas gardées').toEqual({ mentions: [], prevenus: [ids.um, ids.ur, ids.un] });
    const r2 = await modifierCommentaire({ commentId: kM, rowVersion: l2.rowVersion, texte: `Retour de @${NOM_ZOE}.`, mentions: [ids.um] });
    if (!r2.ok) throw new Error(JSON.stringify(r2));
    expect([(await notifs(ids.um)).length, (await notifs(ids.un)).length]).toEqual([1, 1]);
    expect(lireHistoriqueTextes(await ligne(kM))).toHaveLength(3);
  });

  it('identifiants forgés · autre espace, hors marque, lecteur, masqué, l’auteur · ignorés · rien stocké, personne prévenu', async () => {
    const texte = '@Bob Autre Espace @Karim Hors Marque @Valérie Lectrice @Xavier Masqué @Anne Propriétaire · forgé';
    const k = await commenter(texte, [ids.ub, ids.uk, ids.uv, ids.ux, ids.ua, 'pas-un-id', 42]);
    expect((await ligne(k)).history, 'une mention forgée est stockée').toEqual([]);
    for (const q of ['ub', 'uk', 'uv', 'ux', 'ua'] as const) expect(await notifs(ids[q]), `${q} prévenu par une mention forgée`).toEqual([]);
    const { d } = await ficheRendue();
    expect(d.querySelector(`[data-commentaire="${k}"] [data-mention]`), 'une mention forgée affichée').toBeNull();
    expect(d.querySelector(`[data-commentaire="${k}"] [data-texte-commentaire]`)?.textContent).toBe(texte);
  });

  it('le propriétaire mentionné par un autre · la mention SEULE (pas aussi « Nouveau commentaire ») · sans mention · « Nouveau commentaire », comme avant', async () => {
    h.session = session(ids, 'ur', { plan: 'plus' });
    const avantUr = (await notifs(ids.ur)).length;
    await commenter('Pour @Anne Propriétaire · à trancher.', [ids.ua]);
    expect((await notifs(ids.ua)).map((n) => n.type)).toEqual(['studio_comment_mention']);
    await commenter('Sans mention, pour l’équipe.');
    expect((await notifs(ids.ua)).map((n) => n.type).sort()).toEqual(['studio_comment', 'studio_comment_mention']);
    expect((await notifs(ids.ur)).length, 'l’auteur prévenu de son propre commentaire').toBe(avantUr);
  });

  it('affichée sous le nom COURANT · renommé, le nouveau nom · plus d’accès à la marque, « un ancien membre » et plus proposé', async () => {
    const k = await commenter(`Merci @${NOM_ZOE} et @Rémi Restreint.`, [ids.um, ids.ur]);
    await db.update(schema.users).set({ name: 'Zoé Martin-Durand' }).where(eq(schema.users.id, ids.um));
    await db.update(schema.studioMemberBrandScopes).set({ brandId: ids.brandA2 }).where(and(eq(schema.studioMemberBrandScopes.userId, ids.ur), eq(schema.studioMemberBrandScopes.workspaceId, ids.wsA)));
    await ficheMontee();
    const carte = document.querySelector(`[data-commentaire="${k}"]`)!;
    expect(carte.querySelector(`[data-mention="${ids.um}"]`)?.textContent).toBe('@Zoé Martin-Durand');
    expect(carte.querySelector('[data-mention="ancien"]')?.textContent).toBe(`@${LIBELLE_ANCIEN_MEMBRE}`);
    expect(carte.querySelector('[data-texte-commentaire]')?.textContent).toBe(`Merci @Zoé Martin-Durand et @${LIBELLE_ANCIEN_MEMBRE}.`);
    expect(carte.innerHTML, 'le nom d’un ancien membre reste lisible').not.toContain('Rémi');
    const champ = document.querySelector('[data-champ="texte-commentaire"]') as HTMLTextAreaElement;
    await saisir(champ, '@');
    expect(options()).toEqual(['@Nina Nouvelle', '@Zoé Martin-Durand']);
    await db.update(schema.studioMemberBrandScopes).set({ brandId: ids.brandA1 }).where(and(eq(schema.studioMemberBrandScopes.userId, ids.ur), eq(schema.studioMemberBrandScopes.workspaceId, ids.wsA)));
  });
});

function lireHistoriqueTextes(l: { history: unknown }) {
  return (l.history as Array<{ texte?: string }>).filter((e) => typeof e.texte === 'string');
}
