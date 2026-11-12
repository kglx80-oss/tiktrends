// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * « Mes mentions » · base RÉELLE (pglite, migrations du dépôt), VRAIES actions
 * (commenter, modifier, résoudre, noter un nœud de la lignée, avec mention ·
 * gardes relues), VRAIE page rendue (`/studio/mentions`) puis montée · on lit
 * le DOM et ce qui est écrit.
 *
 *  · SES mentions seulement · ni celles d'un autre membre, ni une
 *    notification d'un autre espace, ni une notification qui n'est pas une
 *    mention · une personne d'un autre espace ne voit rien ;
 *  · chaque ligne · qui, quand, projet, extrait (texte courant, mentions sous le
 *    nom COURANT), état ouvert / résolu · relue dans la portée ACTUELLE · la
 *    marque retirée de sa portée → « Fil hors de ta portée », ni texte, ni
 *    projet, ni auteur, ni lien ;
 *  · le lien · la fiche s'ouvre sur l'ancre du BON commentaire (onglet
 *    Activité, filtre ouvert s'il est résolu) ou le nœud de la note (détail
 *    choisi, ancre de la note) ;
 *  · « Marquer comme lue » · l'action EXISTANTE des notifications · la page
 *    relue dit « Lue » · le focus replacé sur la ligne ;
 *  · `<script>` dans un texte reste du texte · rien n'est écrit pour afficher.
 * 0 $ · aucun appel réseau, aucune dépense. Aucune date « à venir ».
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios & Record<'um', string>, session: null as SessionTest | null, marque: null as string | null }));
vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u(), um: u() };
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
  useSearchParams: () => new URLSearchParams(), usePathname: () => '/studio/mentions', useParams: () => ({}),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'tt_brand' && h.marque ? { value: h.marque } : undefined), getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ 'x-tt-chemin': '/studio/mentions', host: 'localhost' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('../lib/jarvis-memory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/jarvis-memory')>()), invalidateJarvisMemory: () => {}, briefConceptBeforeLaunch: async () => ({ summary: '' }),
}));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));

import { db, schema, eq, and } from '@tiktrends/db';
import { TEXTES_MES_MENTIONS } from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { projetAvecBrief } from './l4c-harnais';
import { avecSpatial } from './spatial/fournisseur';
import { commenterProjet, modifierCommentaire, resoudreCommentaire } from '../app/actions/studios/activite';
import { noterNoeudLignee } from '../app/actions/studios/notes-lignee';
import MesMentionsSpatial from '../app/(spatial)/sp/studio/mentions/page';
import ProjetSpatial from '../app/(spatial)/sp/studio/projets/[id]/page';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });

const ids = h.ids;
const NOM_ZOE = 'Zoé Martin';
const S = { P1: '', v1: '', P3: '', v3: '', cOuvert: '', cResolu: '', cScript: '', cEdite: '', cAutre: '', cA2: '', nBrief: '' };
const proprietaire = (): SessionTest => session(ids, 'ua', { role: 'owner', plan: 'plus' });
const zoe = (): SessionTest => ({ user: { id: ids.um, email: 'um@studios.test', name: NOM_ZOE }, workspaceId: ids.wsA, workspaceName: 'Espace A', role: 'member', plan: 'plus', equipe: null });
const T = {
  ouvert: () => `Vu avec @${NOM_ZOE} et @Rémi Restreint · le titre est trop long.`,
  resolu: () => `@${NOM_ZOE} le produit est flou sur la version 1.`,
  script: () => `@${NOM_ZOE} <script>window.__mention = 1</script> à relire`,
  edite: 'Premier jet, sans personne.',
  editeApres: () => `Premier jet repris, @${NOM_ZOE} peux-tu regarder ?`,
  autre: 'Pour @Rémi Restreint seulement · SECRET_AUTRE_PERSONNE',
  a2: () => `@${NOM_ZOE} SECRET_TEXTE_A2 sur la marque deux`,
  note: () => `@${NOM_ZOE} l’hypothèse du brief est trop large, à resserrer.`,
};

async function commenter(projectId: string, versionId: string, texte: string, mentions: string[]) {
  const r = await commenterProjet({ projectId, cible: 'version', cibleId: versionId, texte, mentions });
  if (!r.ok) throw new Error(`commenter ${JSON.stringify(r)}`);
  return r.commentaires.find((c) => c.texte === texte)!.id;
}
async function commentaire(id: string) {
  const [l] = await db.select().from(schema.studioComments).where(eq(schema.studioComments.id, id));
  return l!;
}

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'plus', onboardedAt: new Date() }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));
  await db.insert(schema.users).values({ id: ids.um, email: 'um@studios.test', name: NOM_ZOE });
  await db.insert(schema.workspaceMembers).values({ workspaceId: ids.wsA, userId: ids.um, role: 'member' });
  for (const [q, nom] of [['ua', 'Anne Propriétaire'], ['ur', 'Rémi Restreint'], ['ub', 'Bob Autre Espace']] as const) {
    await db.update(schema.users).set({ name: nom }).where(eq(schema.users.id, ids[q]));
  }
  h.session = proprietaire(); h.marque = ids.brandA1;

  const p1 = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum · mentions' });
  S.P1 = p1.projectId; S.v1 = p1.versionId;
  const p3 = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA2, userId: ids.ua, titre: 'SECRET_PROJET_A2' });
  S.P3 = p3.projectId; S.v3 = p3.versionId;

  // Les mentions · par les VRAIES actions, l'auteur est Anne.
  S.cOuvert = await commenter(S.P1, S.v1, T.ouvert(), [ids.um, ids.ur]);
  S.cResolu = await commenter(S.P1, S.v1, T.resolu(), [ids.um]);
  const r = await resoudreCommentaire({ commentId: S.cResolu, rowVersion: (await commentaire(S.cResolu)).rowVersion, resolu: true });
  if (!r.ok) throw new Error(`résoudre ${JSON.stringify(r)}`);
  S.cScript = await commenter(S.P1, S.v1, T.script(), [ids.um]);
  // Une mention posée en MODIFIANT un commentaire · la notification vient de la modification.
  S.cEdite = await commenter(S.P1, S.v1, T.edite, []);
  const m = await modifierCommentaire({ commentId: S.cEdite, rowVersion: (await commentaire(S.cEdite)).rowVersion, texte: T.editeApres(), mentions: [ids.um] });
  if (!m.ok) throw new Error(`modifier ${JSON.stringify(m)}`);
  S.cAutre = await commenter(S.P1, S.v1, T.autre, [ids.ur]);
  const n = await noterNoeudLignee({ projectId: S.P1, noeud: `brief:${S.v1}`, texte: T.note(), mentions: [ids.um] });
  if (!n.ok) throw new Error(`noter ${JSON.stringify(n)}`);
  S.nBrief = n.notes.find((x) => x.texte === T.note())!.id;
  h.marque = ids.brandA2;
  S.cA2 = await commenter(S.P3, S.v3, T.a2(), [ids.um]);
  h.marque = ids.brandA1;

  // Ni une mention ni de cet espace · une notification ordinaire, et une mention FORGÉE d'un autre espace (même personne).
  await db.insert(schema.notifications).values([
    { workspaceId: ids.wsA, userId: ids.um, type: 'system', title: 'SECRET_SYSTEME', body: 'SECRET_SYSTEME', href: '/dashboard' },
    { workspaceId: ids.wsB, userId: ids.um, type: 'studio_comment_mention', title: 'SECRET_AUTRE_ESPACE', body: 'SECRET_AUTRE_ESPACE', href: `/studio/projets/${S.P1}#activite` },
  ]);
}, 240_000);

/* ───────────────────────────── outils ───────────────────────────── */

let root: Root | null = null;
beforeEach(() => { h.session = zoe(); h.marque = ids.brandA1; });
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; });
const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const page = async (sp: Record<string, string> = {}) => MesMentionsSpatial({ searchParams: Promise.resolve(sp) }) as Promise<ReactElement>;
async function rendue(sp: Record<string, string> = {}) {
  const html = renderToStaticMarkup(avecSpatial(await page(sp)));
  return { html, d: dom(html) };
}
async function monter(el: ReactElement) {
  act(() => { root?.unmount(); });
  document.body.innerHTML = '<div id="app"></div><div id="orn" hidden></div>';
  root = createRoot(document.getElementById('app')!);
  await act(async () => { root!.render(avecSpatial(el)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
}
const attendre = async () => { await act(async () => { for (let i = 0; i < 40; i += 1) await new Promise((r) => setTimeout(r, 5)); }); };
const params = (href: string) => Object.fromEntries(new URL(`http://x${href}`).searchParams);
const ancre = (href: string) => new URL(`http://x${href}`).hash.slice(1);
const texte = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
/** Les lignes de la page · notification → ce qu'on voit. */
function lignes(d: ParentNode) {
  return [...d.querySelectorAll('[data-mention]')].map((li) => ({
    id: li.getAttribute('data-mention')!, genre: li.getAttribute('data-genre'), portee: li.getAttribute('data-portee'), lue: li.getAttribute('data-lue'),
    entete: texte(li.querySelector('[data-entete-mention]')), extrait: texte(li.querySelector('[data-extrait-mention]')),
    etat: li.querySelector('[data-etat-fil]')?.getAttribute('data-etat-fil') ?? null, phraseEtat: texte(li.querySelector('[data-etat-fil]')),
    hors: texte(li.querySelector('[data-hors-portee]')), href: li.querySelector('a[data-ouvrir-fil]')?.getAttribute('href') ?? null,
  }));
}
/** La notification de mention d'un fil, lue en base (pour la retrouver dans la page). */
async function notifDe(texteFil: string, u = ids.um, genre: 'studio_comment_mention' | 'studio_note_mention' = 'studio_comment_mention') {
  const N = schema.notifications;
  const l = await db.select().from(N).where(and(eq(N.userId, u), eq(N.type, genre), eq(N.workspaceId, ids.wsA)));
  const x = l.filter((n) => (n.body ?? '').startsWith(texteFil.slice(0, 20)));
  expect(x, `une seule notification pour « ${texteFil} »`).toHaveLength(1);
  return x[0]!;
}
const ligneDe = async (d: ParentNode, texteFil: string, genre?: 'studio_note_mention') => {
  const n = await notifDe(texteFil, ids.um, genre);
  return lignes(d).find((l) => l.id === n.id) ?? null;
};
async function traces() {
  const N = schema.notifications;
  const notifs = await db.select({ id: N.id, lue: N.readAt }).from(N);
  const C = schema.studioComments; const L = schema.studioLineageNotes;
  return {
    notifs: notifs.map((n) => `${n.id}:${n.lue ? 'lue' : 'non'}`).sort(),
    commentaires: (await db.select({ id: C.id, v: C.rowVersion }).from(C)).map((c) => `${c.id}:${c.v}`).sort(),
    notes: (await db.select({ id: L.id, v: L.rowVersion }).from(L)).map((c) => `${c.id}:${c.v}`).sort(),
    depense: (await db.select().from(schema.aiSpend)).length,
  };
}

/* ───────────────────────────── 1 · la sélection ───────────────────────────── */

describe('ses mentions seulement · de son espace, de types mention', () => {
  it('la page de Zoé · ses six mentions (cinq commentaires, une note), rien d’une autre personne, d’un autre espace, ni d’une notification ordinaire · rien n’est écrit', async () => {
    const avant = await traces();
    const { html, d } = await rendue();
    expect(d.querySelector('h1')?.textContent).toBe('Mes mentions');
    const l = lignes(d);
    expect(l.map((x) => x.genre).sort(), 'les mentions de la personne').toEqual(['commentaire', 'commentaire', 'commentaire', 'commentaire', 'commentaire', 'note']);
    expect(html).not.toMatch(/SECRET_AUTRE_PERSONNE|SECRET_SYSTEME|SECRET_AUTRE_ESPACE/);
    expect(texte(d.querySelector('[data-titre-mentions]'))).toBe('Mentions · 6');
    expect(await traces(), 'afficher la page a écrit').toEqual(avant);
  });

  it('une personne d’un autre espace ne voit rien · « Personne ne t’a encore mentionné »', async () => {
    h.session = session(ids, 'ub', { plan: 'plus' });
    const { html, d } = await rendue();
    expect(lignes(d)).toEqual([]);
    expect(texte(d.querySelector('[data-mentions-vide]'))).toBe(TEXTES_MES_MENTIONS.vide);
    expect(html).not.toMatch(/Sérum|SECRET|Zoé|le titre est trop long/);
  });

  it('Rémi ne voit que les siennes · jamais celles de Zoé', async () => {
    h.session = session(ids, 'ur', { plan: 'plus' });
    const { html, d } = await rendue();
    expect(lignes(d).map((x) => x.extrait).sort()).toEqual(['Pour @Rémi Restreint seulement · SECRET_AUTRE_PERSONNE', `Vu avec @${NOM_ZOE} et @Rémi Restreint · le titre est trop long.`].sort());
    expect(html).not.toMatch(/produit est flou|hypothèse du brief/);
  });
});

/* ───────────────────────────── 2 · chaque ligne, relue dans la portée ───────────────────────────── */

describe('chaque ligne · qui, quand, projet, extrait, état, lien · relue dans la portée actuelle', () => {
  it('un commentaire ouvert · auteur, projet, extrait du texte COURANT, mentions sous le nom courant, « Ouvert »', async () => {
    const { d } = await rendue();
    const x = (await ligneDe(d, T.ouvert()))!;
    expect(x.portee).toBe('dans');
    expect(x.entete).toMatch(/^Commentaire · \d{2}\/\d{2}\/\d{4} · \d{2}:\d{2} · Anne Propriétaire · projet « Sérum · mentions »$/);
    expect(x.extrait).toBe(T.ouvert());
    expect([x.etat, x.phraseEtat]).toEqual(['ouvert', 'Fil ouvert']);
    const li = d.querySelector(`[data-mention="${x.id}"]`)!;
    expect([...li.querySelectorAll('[data-mention-nom]')].map((b) => [b.getAttribute('data-mention-nom'), b.textContent])).toEqual([[ids.um, `@${NOM_ZOE}`], [ids.ur, '@Rémi Restreint']]);
    // Le nom COURANT · Rémi se renomme, l'extrait suit.
    await db.update(schema.users).set({ name: 'Rémi Renommé' }).where(eq(schema.users.id, ids.ur));
    try {
      expect((await ligneDe((await rendue()).d, T.ouvert()))!.extrait).toBe(`Vu avec @${NOM_ZOE} et @Rémi Renommé · le titre est trop long.`);
    } finally { await db.update(schema.users).set({ name: 'Rémi Restreint' }).where(eq(schema.users.id, ids.ur)); }
  });

  it('un fil résolu · le dit, avec qui l’a résolu', async () => {
    const x = (await ligneDe((await rendue()).d, T.resolu()))!;
    expect(x.etat).toBe('resolu');
    expect(x.phraseEtat).toMatch(/^Commentaire résolu par Anne Propriétaire · \d{2}\/\d{2}\/\d{4} · \d{2}:\d{2}$/);
    expect(texte((await rendue()).d.querySelector(`[data-mention="${x.id}"] [data-pastille-etat]`))).toBe('Résolu');
  });

  it('une mention posée en modifiant · le fil retrouvé, son texte courant', async () => {
    const x = (await ligneDe((await rendue()).d, T.editeApres()))!;
    expect(x.extrait).toBe(T.editeApres());
    expect(x.href).toBe(`/studio/projets/${S.P1}?commentaire=${S.cEdite}#commentaire-${S.cEdite}`);
  });

  it('`<script>` dans le texte · du texte, aucun élément, rien d’exécuté', async () => {
    const { html, d } = await rendue();
    const x = (await ligneDe(d, T.script()))!;
    expect(x.extrait).toBe(T.script());
    expect(d.querySelector('[data-liste-mentions] script')).toBeNull();
    expect(html).toContain('&lt;script&gt;window.__mention = 1&lt;/script&gt;');
    await monter(await page());
    expect(document.querySelector('[data-liste-mentions] script')).toBeNull();
    expect((window as { __mention?: number }).__mention).toBeUndefined();
  });

  it('une note de la lignée · « Note de la lignée », son extrait, son lien vers le nœud', async () => {
    const x = (await ligneDe((await rendue()).d, T.note(), 'studio_note_mention'))!;
    expect(x.genre).toBe('note');
    expect(x.entete).toMatch(/^Note de la lignée · .* · Anne Propriétaire · projet « Sérum · mentions »$/);
    expect(x.extrait).toBe(T.note());
    expect(x.href).toBe(`/studio/projets/${S.P1}?disposition=libre&graphe=lignee&noeud=${encodeURIComponent(`brief:${S.v1}`)}#note-${S.nBrief}`);
  });

  it('la marque du fil retirée de sa portée · la ligne reste, SANS texte, ni projet, ni auteur, ni lien · « Fil hors de ta portée »', async () => {
    const avant = (await ligneDe((await rendue()).d, T.a2()))!;
    expect([avant.portee, avant.extrait], 'préalable · le fil se lit tant que la marque est dans sa portée').toEqual(['dans', T.a2()]);
    await db.insert(schema.studioMemberBrandScopes).values({ workspaceId: ids.wsA, userId: ids.um, brandId: ids.brandA1 });
    try {
      const { html, d } = await rendue();
      const x = (await ligneDe(d, T.a2()))!;
      expect([x.portee, x.extrait, x.href, x.etat], 'hors de la portée').toEqual(['hors', '', null, null]);
      expect(x.hors).toBe('Fil hors de ta portée');
      expect(x.entete).toMatch(/^Commentaire · \d{2}\/\d{2}\/\d{4} · \d{2}:\d{2}$/);
      const li = d.querySelector(`[data-mention="${x.id}"]`)!;
      expect(li.querySelector('button[data-ouvrir-fil]')?.getAttribute('aria-disabled'), 'le lien fermé').toBe('true');
      expect(texte(li.querySelector('[data-raison-ferme="fil-hors-portee"]'))).toBe(TEXTES_MES_MENTIONS.raisonHorsPortee);
      expect(html, 'le texte, le projet ou l’extrait de la notification ont fui').not.toMatch(/SECRET_TEXTE_A2|SECRET_PROJET_A2/);
      // Les fils de sa portée restent lus.
      expect((await ligneDe(d, T.ouvert()))!.portee).toBe('dans');
    } finally {
      await db.delete(schema.studioMemberBrandScopes).where(and(eq(schema.studioMemberBrandScopes.userId, ids.um), eq(schema.studioMemberBrandScopes.workspaceId, ids.wsA)));
    }
  });

  it('les droits Studios retirés (lectrice client) · toutes ses lignes sans texte', async () => {
    await db.update(schema.workspaceMembers).set({ role: 'client_viewer' }).where(eq(schema.workspaceMembers.userId, ids.um));
    h.session = { ...zoe(), role: 'client_viewer' };
    try {
      const { html, d } = await rendue();
      expect(lignes(d).map((x) => x.portee), 'sans droits Studios, aucun fil n’est relu').toEqual(Array(6).fill('hors'));
      expect(html).not.toMatch(/le titre est trop long|produit est flou|hypothèse du brief|SECRET/);
    } finally {
      await db.update(schema.workspaceMembers).set({ role: 'member' }).where(eq(schema.workspaceMembers.userId, ids.um));
    }
  });
});

/* ───────────────────────────── 3 · le lien mène au bon élément ───────────────────────────── */

describe('le lien · l’ancre du bon commentaire, le nœud de la note', () => {
  const fiche = async (href: string) => ProjetSpatial({ params: Promise.resolve({ id: S.P1 }), searchParams: Promise.resolve(params(href)) }) as Promise<ReactElement>;

  it('commentaire ouvert · la fiche s’ouvre sur l’onglet Activité, l’ancre est CE commentaire · monté, il prend le focus', async () => {
    const x = (await ligneDe((await rendue()).d, T.ouvert()))!;
    const d = dom(renderToStaticMarkup(avecSpatial(await fiche(x.href!))));
    const el = d.querySelector(`#${CSS.escape(ancre(x.href!))}`);
    expect(el?.getAttribute('data-commentaire'), 'l’ancre ne mène pas au commentaire de la mention').toBe(S.cOuvert);
    expect(texte(el!.querySelector('[data-texte-commentaire]'))).toBe(T.ouvert());
    expect(d.querySelector('[data-ptab="activite"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(d.querySelectorAll(`[id="${ancre(x.href!)}"]`)).toHaveLength(1);
    await monter(await fiche(x.href!));
    await attendre();
    expect(document.activeElement?.getAttribute('data-commentaire'), 'le commentaire visé ne prend pas le focus').toBe(S.cOuvert);
  });

  it('commentaire résolu · le filtre s’ouvre sur « Tous », l’ancre est à l’écran', async () => {
    const x = (await ligneDe((await rendue()).d, T.resolu()))!;
    const d = dom(renderToStaticMarkup(avecSpatial(await fiche(x.href!))));
    expect(d.querySelector(`#${CSS.escape(ancre(x.href!))}`)?.getAttribute('data-commentaire'), 'le commentaire résolu n’est pas à l’écran').toBe(S.cResolu);
    expect(d.querySelector('[data-filtres-commentaires] [aria-pressed="true"]')?.getAttribute('data-filtre')).toBe('tous');
  });

  it('note · la lignée s’ouvre, le nœud choisi, l’ancre est CETTE note dans son détail · montée, elle prend le focus', async () => {
    const x = (await ligneDe((await rendue()).d, T.note(), 'studio_note_mention'))!;
    const d = dom(renderToStaticMarkup(avecSpatial(await fiche(x.href!))));
    const el = d.querySelector(`#${CSS.escape(ancre(x.href!))}`);
    expect(el?.getAttribute('data-note'), 'l’ancre ne mène pas à la note de la mention').toBe(S.nBrief);
    expect(el!.closest('[data-notes-panneau]')?.getAttribute('data-notes-panneau')).toBe(`detail:brief:${S.v1}`);
    expect(texte(el!.querySelector('[data-texte-note]'))).toBe(T.note());
    expect(d.querySelectorAll(`[id="${ancre(x.href!)}"]`), 'l’ancre est unique').toHaveLength(1);
    window.history.replaceState(null, '', `/studio/projets/${S.P1}#${ancre(x.href!)}`);
    await monter(await fiche(x.href!));
    await attendre();
    expect(document.activeElement?.getAttribute('data-note'), 'la note visée ne prend pas le focus').toBe(S.nBrief);
    window.history.replaceState(null, '', '/');
  });
});

/* ───────────────────────────── 4 · filtres et « marquer comme lue » ───────────────────────────── */

describe('filtres · et « Marquer comme lue » par le mécanisme existant', () => {
  it('« Notes » · la note seule · « Non lues » · les non lues seules', async () => {
    expect(lignes((await rendue({ type: 'notes' })).d).map((x) => x.genre), 'le filtre « Notes » lit d’autres notifications').toEqual(['note']);
    expect(lignes((await rendue({ type: 'commentaires' })).d).every((x) => x.genre === 'commentaire')).toBe(true);
    const { d } = await rendue({ lecture: 'non-lues' });
    expect(lignes(d).every((x) => x.lue === 'non')).toBe(true);
    expect(d.querySelector('[data-lecture="non-lues"]')?.getAttribute('aria-current')).toBe('page');
  });

  it('« Marquer comme lue » · l’action existante, la page RELUE dit « Lue », le focus reste sur la ligne · en base, lue', async () => {
    const n = await notifDe(T.resolu());
    expect(n.readAt, 'préalable · non lue').toBeNull();
    await monter(await page());
    const bouton = document.querySelector(`[data-mention="${n.id}"] [data-geste="marquer-mention"]`) as HTMLButtonElement;
    expect(bouton?.textContent).toBe('Marquer comme lue');
    await act(async () => { bouton.click(); });
    await attendre();
    await vi.waitFor(() => expect(document.querySelector(`[data-mention="${n.id}"]`)?.getAttribute('data-lue'), 'la page relue ne dit pas la mention lue').toBe('oui'));
    expect(document.querySelector(`[data-mention="${n.id}"] [data-geste="marquer-mention"]`)).toBeNull();
    expect(texte(document.querySelector(`[data-mention="${n.id}"] [data-etat-lecture]`))).toBe('Lue');
    await vi.waitFor(() => expect(document.activeElement?.closest('[data-mention]')?.getAttribute('data-mention'), 'le focus n’est pas replacé sur la ligne').toBe(n.id));
    const [l] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, n.id));
    expect(l!.readAt, 'la notification n’est pas lue en base').not.toBeNull();
    // Relue par une nouvelle ouverture · « Lue », et absente des non lues.
    expect((await ligneDe((await rendue()).d, T.resolu()))!.lue).toBe('oui');
    expect(lignes((await rendue({ lecture: 'non-lues' })).d).some((x) => x.id === n.id)).toBe(false);
    // Aucune autre notification touchée.
    const autres = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, ids.um));
    expect(autres.filter((x) => x.readAt).map((x) => x.id)).toEqual([n.id]);
  });
});
