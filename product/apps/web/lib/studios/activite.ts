import 'server-only';
import { and, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db, schema } from '@tiktrends/db';
import {
  LECTURE_MAX_JOURNAL, aPermissionEspace, droitsCommentaire, erreurStudio, extraitCommentaire, historiqueApresModification, journalProjet,
  libelleAuteurVersion, lireHistoriqueCommentaire, objetDansPortee, quandJournal, validerTexteCommentaire, vueVariantes, cibleCommentaire,
  gesteIterationCommentaire, aPrevenirMentions, historiqueAvecMentions, lireMentions,
  nomAffichageMention, prevenusApres, proprietairePrevenuSansMention, resultatsCommentaire, segmentsCommentaire,
  type ErreurStudio, type FaitJournal, type JournalProjet, type CommentairePourGeste, type IterationDuCommentaire, type MembreBrut,
} from '@tiktrends/core';
import type { ContexteStudio } from './garde';
import { membresDeLEspace, mentionnablesDe, mentionsDuTexte } from './membres-mentions';
import { estUuid, lireProjet, lireVersion, type ProjetStudio } from './depot';
import { listerVariantes } from './variantes/variantes';
import type { CibleCommentable, CommentairesProjet, PropsActiviteProjet } from '../../spatial/vues/projet/types';
import { createNotification } from '../notifications';
import { getActiveBrand } from '../brands';
import { accesAdsmap } from './variantes/acces';
import { liensDeCopie } from './copie-projet';
import { lireResultatsDesFils } from './resultat-fil';

/**
 * Studios · lot 10 V5 · l'ACTIVITÉ d'un projet · journal et commentaires
 * (règles : `C/studios/activite/`).
 *
 *  · journal · LECTURE seule, rien n'est écrit pour l'occasion · le journal
 *    d'audit des studios (cibles du projet : lui-même, ses versions,
 *    propositions, devis, tâches, variantes, liens de test, médias, lots
 *    d'images), l'historique des versions, les tâches, les commentaires et
 *    les notes du canvas de lignée (lot 11 · le nœud, jamais le texte) ·
 *    chaque requête bornée à la portée (espace, marques visibles) ET à la
 *    marque du projet, au plus `LECTURE_MAX_JOURNAL` lignes par source ;
 *  · commentaires · lire = qui voit le projet (`studio.read`) · écrire,
 *    modifier le sien, résoudre / rouvrir = qui peut proposer
 *    (`studio.propose`, la permission qui édite le projet) · aucune
 *    permission nouvelle · jamais de suppression. La cible (version ou
 *    création) est RELUE dans le projet · une version d'un autre projet, une
 *    création d'ailleurs sont introuvables.
 *  · notification · le mécanisme existant (`createNotification`) prévient le
 *    propriétaire du projet d'un commentaire d'une autre personne, s'il voit
 *    encore la marque · best-effort, il ne bloque jamais l'écriture ;
 *  · mentions · « @Nom » d'un membre qui VOIT le projet (règles au noyau,
 *    `C/studios/activite/mentions.ts`) · la liste proposée et l'analyse
 *    relisent les membres de l'espace, leur rôle, la formule et leurs
 *    restrictions de marque (`membresDeLEspace`) · gardées par IDENTIFIANT
 *    dans le JSON existant du commentaire (`history`, aucune migration) ·
 *    affichées sous le nom courant (« un ancien membre » sinon) · chaque
 *    mentionné prévenu une fois par commentaire (`prevenus`), jamais l'auteur ·
 *    aucune mention ne donne un accès ;
 *  · résultat · une itération née du commentaire (provenance
 *    `source_ref_json.commentaire`) dit son résultat une fois son lot conclu ·
 *    CALCULÉ à chaque lecture (`resultatsCommentaire`, la conclusion du lot de
 *    `chargerLots`), jamais écrit · Résultats fermé, rien.
 *  · « Itérer depuis ce commentaire » · sur une création dont la variante a une
 *    pub testée · la règle du noyau (`gesteIterationCommentaire`) · Résultats
 *    ouvert à la session (`accesAdsmap`), projet dans la marque active · le
 *    lien ouvre l'écran Itérer, qui relit tout (`lireCommentairePourIterer`) ;
 *  · duplication · le journal du projet SOURCE relit les copies dont la
 *    création porte `copieDe` vers lui (`liensDeCopie`) · « Dupliqué en « … » ».
 *
 * Gratuit · aucun appel IA, aucune génération, aucune dépense.
 */

type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

const portee = (ctx: ContexteStudio) => ({ workspaceId: ctx.workspaceId, marquesDuWorkspace: ctx.marquesDuWorkspace, restrictionsMarque: ctx.restrictionsMarque });
/** La portée SQL d'une table bornée à LA marque du projet (déjà relue dans la portée). */
const duProjet = (t: { workspaceId: PgColumn; brandId: PgColumn }, ctx: ContexteStudio, p: ProjetStudio): SQL =>
  and(eq(t.workspaceId, ctx.workspaceId), eq(t.brandId, p.brandId), inArray(t.brandId, ctx.marques))!;

/** Les noms des personnes citées · « Toi », le nom, l'adresse, ou « Un membre de l’espace » quand la personne masque ses informations. */
async function noms(ctx: ContexteStudio, ids: ReadonlyArray<string | null>): Promise<(id: string | null) => string | null> {
  const uniques = [...new Set(ids.filter((x): x is string => !!x))];
  const U = schema.users;
  const lignes = uniques.length ? await db.select({ id: U.id, nom: U.name, email: U.email, masque: U.hidePersonalInfo }).from(U).where(inArray(U.id, uniques)) : [];
  const par = new Map(lignes.map((l) => [l.id, l]));
  return (id) => {
    if (!id) return null;
    const l = par.get(id);
    return libelleAuteurVersion({ authorId: id, nom: l?.nom ?? null, email: l?.email ?? null, masque: !!l?.masque }, ctx.userId);
  };
}

interface Contexte {
  projet: ProjetStudio;
  versions: Array<{ id: string; n: number; reason: string; authorId: string | null; createdAt: Date }>;
  /** Les créations du projet (sorties livrées des lots), avec leur libellé d'écran · lues par `listerVariantes`. */
  creations: Map<string, string>;
  /** Le test de la variante de chaque création (média) qui en a un · la pub dont « Itérer depuis ce commentaire » part. */
  tests: Map<string, NonNullable<CommentairePourGeste['test']>>;
}

async function contexte(ctx: ContexteStudio, projectId: unknown): Promise<Resultat<Contexte>> {
  const p = await lireProjet(ctx, projectId);
  if (!p.ok) return p;
  const V = schema.studioProjectVersions;
  const versions = await db.select({ id: V.id, n: V.n, reason: V.reason, authorId: V.authorId, createdAt: V.createdAt }).from(V)
    .where(and(eq(V.projectId, p.projet.id), duProjet(V, ctx, p.projet))).orderBy(desc(V.n)).limit(LECTURE_MAX_JOURNAL);
  const creations = new Map<string, string>();
  const tests = new Map<string, NonNullable<CommentairePourGeste['test']>>();
  const lu = await listerVariantes(ctx, { projectId: p.projet.id }, { adsmapAcces: false, relecture: { disponible: false, raison: null, coutMaxUsd: null } }).catch(() => null);
  if (lu?.ok) {
    for (const bv of vueVariantes(lu.donnees).versions) for (const l of bv.lots) for (const s of l.sorties) creations.set(s.assetId, `${l.titre} · ${s.libelle}`);
    for (const v of lu.donnees.variantes) {
      if (v.test) tests.set(v.assetId, { adsmapAdId: v.test.adsmapAdId, verdict: v.test.verdict ? { validated: v.test.verdict.validated, comparable: v.test.verdict.comparable } : null });
    }
  }
  return { ok: true, projet: p.projet, versions, creations, tests };
}

/* ─────────────────────────────── journal ─────────────────────────────── */

export async function lireJournalPour(ctx: ContexteStudio, e: { projectId: unknown; type?: unknown; page?: unknown }): Promise<Resultat<{ journal: JournalProjet; tronque: boolean }>> {
  if (!aPermissionEspace(ctx.permissions, 'studio.read')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  const c = await contexte(ctx, e.projectId);
  if (!c.ok) return c;
  const { projet } = c;
  const pid = projet.id;
  const versionIds = c.versions.map((v) => v.id);
  const versionN = new Map(c.versions.map((v) => [v.id, v.n]));
  const raisonV = new Map(c.versions.map((v) => [v.id, v.reason]));

  const J = schema.studioJobs; const PR = schema.studioProposals; const Q = schema.studioQuotes; const VA = schema.studioVariants; const A = schema.studioAssets;
  const borne = LECTURE_MAX_JOURNAL * 4;
  const [propositions, devis, variantes, medias, jobs] = await Promise.all([
    db.select({ id: PR.id }).from(PR).where(and(eq(PR.projectId, pid), duProjet(PR, ctx, projet))).limit(borne),
    db.select({ id: Q.id }).from(Q).where(and(eq(Q.projectId, pid), duProjet(Q, ctx, projet))).limit(borne),
    db.select({ id: VA.id }).from(VA).where(and(eq(VA.projectId, pid), duProjet(VA, ctx, projet))).limit(borne),
    db.select({ id: A.id }).from(A).where(and(eq(A.projectId, pid), duProjet(A, ctx, projet))).limit(borne),
    db.select({ id: J.id, operation: J.operation, state: J.state, createdAt: J.createdAt, finishedAt: J.finishedAt }).from(J)
      .where(and(eq(J.projectId, pid), duProjet(J, ctx, projet))).orderBy(desc(J.createdAt)).limit(LECTURE_MAX_JOURNAL),
  ]).then(([a, b, c2, d, j]) => [a.map((x) => x.id), b.map((x) => x.id), c2.map((x) => x.id), d.map((x) => x.id), j] as const);
  const TL = schema.studioTestLinks;
  const liens = variantes.length
    ? (await db.select({ id: TL.id }).from(TL).where(and(inArray(TL.variantId, [...variantes]), eq(TL.workspaceId, ctx.workspaceId), eq(TL.brandId, projet.brandId))).limit(borne)).map((x) => x.id)
    : [];

  const E = schema.studioAuditEvents;
  const cible = (type: string, liste: readonly string[]) => (liste.length ? and(eq(E.targetType, type), inArray(E.targetId, [...liste])) : undefined);
  const cibles = [
    and(eq(E.targetType, 'studio_project'), eq(E.targetId, pid)),
    cible('studio_project_version', versionIds), cible('studio_proposal', propositions), cible('studio_quote', devis),
    cible('studio_job', jobs.map((j) => j.id)), cible('studio_variant', variantes), cible('studio_test_link', liens), cible('studio_asset', medias),
    versionIds.length ? and(eq(E.targetType, 'studio_image_batch'), inArray(E.versionAfter, versionIds)) : undefined,
  ].filter((x): x is SQL => !!x);
  const evenements = await db.select({
    id: E.id, le: E.occurredAt, acteur: E.actorId, action: E.action, targetType: E.targetType, targetId: E.targetId,
    versionAfter: E.versionAfter, reason: E.reason, details: E.details, workspaceId: E.workspaceId, brandId: E.brandId,
  }).from(E).where(and(eq(E.workspaceId, ctx.workspaceId), eq(E.brandId, projet.brandId), inArray(E.brandId, ctx.marques), or(...cibles)))
    .orderBy(desc(E.occurredAt)).limit(LECTURE_MAX_JOURNAL);

  const C = schema.studioComments;
  const commentaires = await db.select({ id: C.id, targetType: C.targetType, versionId: C.versionId, assetId: C.assetId, authorId: C.authorId, createdAt: C.createdAt, resolvedAt: C.resolvedAt, resolvedBy: C.resolvedBy })
    .from(C).where(and(eq(C.projectId, pid), duProjet(C, ctx, projet))).orderBy(desc(C.createdAt)).limit(LECTURE_MAX_JOURNAL);

  // Lot 11 · les notes du canvas de lignée · le libellé du nœud gardé avec la note (jamais son texte).
  const NL = schema.studioLineageNotes;
  const notes = await db.select({ id: NL.id, noeud: NL.nodeLabel, authorId: NL.authorId, createdAt: NL.createdAt, resolvedAt: NL.resolvedAt, resolvedBy: NL.resolvedBy })
    .from(NL).where(and(eq(NL.projectId, pid), duProjet(NL, ctx, projet))).orderBy(desc(NL.createdAt)).limit(LECTURE_MAX_JOURNAL);

  const nom = await noms(ctx, [...evenements.map((x) => x.acteur), ...c.versions.map((v) => v.authorId), ...commentaires.flatMap((x) => [x.authorId, x.resolvedBy]), ...notes.flatMap((x) => [x.authorId, x.resolvedBy])]);
  const faits: FaitJournal[] = [];
  for (const x of evenements) {
    // Deux gardes valent mieux qu'une · une ligne hors portée ne se dit pas.
    if (!x.workspaceId || !x.brandId || !objetDansPortee(portee(ctx), { workspaceId: x.workspaceId, brandId: x.brandId })) continue;
    const vId = x.targetType === 'studio_project_version' && versionN.has(x.targetId) ? x.targetId : x.versionAfter && versionN.has(x.versionAfter) ? x.versionAfter : null;
    faits.push({
      source: 'audit', id: x.id, le: x.le.toISOString(), acteur: nom(x.acteur), action: x.action, cible: { type: x.targetType, id: x.targetId },
      versionApresId: vId, versionN: vId ? versionN.get(vId)! : null, etatApres: x.versionAfter && !estUuid(x.versionAfter) ? x.versionAfter : null,
      raison: x.reason, raisonVersion: vId ? raisonV.get(vId) ?? null : null, details: x.details,
    });
  }
  for (const v of c.versions) faits.push({ source: 'version', id: v.id, le: v.createdAt.toISOString(), acteur: nom(v.authorId), versionN: v.n, raison: v.reason });
  for (const j of jobs) {
    faits.push({ source: 'tache', id: `${j.id}:debut`, jobId: j.id, le: j.createdAt.toISOString(), operation: j.operation, etat: j.state, fini: false });
    if (j.finishedAt) faits.push({ source: 'tache', id: `${j.id}:fin`, jobId: j.id, le: j.finishedAt.toISOString(), operation: j.operation, etat: j.state, fini: true });
  }
  for (const k of commentaires) {
    const sur = k.targetType === 'version' && k.versionId && versionN.has(k.versionId)
      ? { type: 'version' as const, versionId: k.versionId, versionN: versionN.get(k.versionId)! }
      : { type: 'creation' as const, libelle: (k.assetId && c.creations.get(k.assetId)) || 'Une création du projet' };
    faits.push({ source: 'commentaire', id: `${k.id}:ecrit`, le: k.createdAt.toISOString(), acteur: nom(k.authorId), geste: 'ecrit', cible: sur });
    if (k.resolvedAt) faits.push({ source: 'commentaire', id: `${k.id}:resolu`, le: k.resolvedAt.toISOString(), acteur: nom(k.resolvedBy), geste: 'resolu', cible: sur });
  }
  for (const k of notes) {
    faits.push({ source: 'note', id: `${k.id}:ecrite`, le: k.createdAt.toISOString(), acteur: nom(k.authorId), geste: 'ecrite', noeud: k.noeud });
    if (k.resolvedAt) faits.push({ source: 'note', id: `${k.id}:resolue`, le: k.resolvedAt.toISOString(), acteur: nom(k.resolvedBy), geste: 'resolue', noeud: k.noeud });
  }
  // Les copies de ce projet (`copieDe` dans l'audit de leur création) · « Dupliqué en « … » » · une duplication passée ne se dit pas ici.
  const copies = (await liensDeCopie(ctx, projet).catch(() => ({ source: null, copies: [] }))).copies;
  const nomCopie = await noms(ctx, copies.map((x) => x.acteurId));
  for (const x of copies) {
    faits.push({
      source: 'duplication', id: x.evenementId, le: x.le.toISOString(), acteur: nomCopie(x.acteurId),
      copie: x.titre !== null ? { id: x.id, titre: x.titre } : null, versionN: versionN.get(x.versionId) ?? null,
    });
  }
  const tronque = [evenements.length, c.versions.length, jobs.length, commentaires.length, notes.length].some((n) => n >= LECTURE_MAX_JOURNAL);
  return { ok: true, journal: journalProjet(faits, { projectId: pid, type: e.type, page: e.page }), tronque };
}

/* ─────────────────────────────── commentaires ─────────────────────────────── */

/** Au plus 200 commentaires lus par projet · les plus récents, rendus dans l'ordre de la conversation. */
export const COMMENTAIRES_MAX_LUS = 200;

function ciblesDe(c: Contexte): CibleCommentable[] {
  return [
    ...c.versions.map((v) => ({ cle: `version:${v.id}`, type: 'version' as const, id: v.id, libelle: `Version ${v.n}${v.id === c.projet.currentVersionId ? ' · courante' : ''}` })),
    ...[...c.creations.entries()].map(([id, libelle]) => ({ cle: `creation:${id}`, type: 'creation' as const, id, libelle })),
  ];
}

/**
 * Les itérations nées des commentaires lus · la lecture partagée avec les
 * notes de la lignée (`lireResultatsDesFils`, `W/lib/studios/resultat-fil.ts`) ·
 * la provenance relue sur les ads de l'espace, puis chaque ad retrouvée dans
 * les lots de la MARQUE du projet avec la conclusion de son lot · rien n'est écrit.
 */
async function iterationsDesCommentaires(ctx: ContexteStudio, p: ProjetStudio, ids: readonly string[]): Promise<Map<string, IterationDuCommentaire[]>> {
  return (await lireResultatsDesFils(ctx, p, 'commentaire', ids)).iterations;
}

async function vueCommentaires(ctx: ContexteStudio, c: Contexte): Promise<CommentairesProjet> {
  const C = schema.studioComments;
  const lignes = (await db.select().from(C).where(and(eq(C.projectId, c.projet.id), duProjet(C, ctx, c.projet))).orderBy(desc(C.createdAt), desc(C.id)).limit(COMMENTAIRES_MAX_LUS))
    .filter((l) => objetDansPortee(portee(ctx), l)).reverse();
  const nom = await noms(ctx, lignes.flatMap((l) => [l.authorId, l.resolvedBy]));
  const peutProposer = aPermissionEspace(ctx.permissions, 'studio.propose');
  const n = new Map(c.versions.map((v) => [v.id, v.n]));
  const [membres, iterations] = await Promise.all([
    membresDeLEspace(c.projet).catch(() => [] as MembreBrut[]),
    iterationsDesCommentaires(ctx, c.projet, lignes.map((l) => l.id)).catch(() => new Map<string, IterationDuCommentaire[]>()),
  ]);
  const parMembre = new Map(membres.map((m) => [m.id.toLowerCase(), m]));
  const nomMentionne = (id: string) => nomAffichageMention(parMembre.get(id), c.projet, ctx.marquesDuWorkspace);
  // « Itérer depuis ce commentaire » et le résultat d'une itération · Résultats et marque active relus seulement s'il y a de quoi.
  const testees = lignes.some((l) => l.targetType === 'creation' && l.assetId && c.tests.has(l.assetId));
  const [resultats, active] = testees || iterations.size
    ? await Promise.all([accesAdsmap().catch(() => false), getActiveBrand(ctx.workspaceId).catch(() => null)])
    : [false, null];
  const marqueActive = !!active && active.id === c.projet.brandId;
  return {
    peutCommenter: peutProposer,
    cibles: ciblesDe(c),
    mentionnables: peutProposer ? mentionnablesDe(ctx, c.projet, membres) : [],
    commentaires: lignes.map((l) => {
      const modifications = lireHistoriqueCommentaire(l.history).length;
      return {
        id: l.id,
        cible: l.targetType === 'version'
          ? { type: 'version' as const, id: l.versionId!, libelle: n.has(l.versionId!) ? `Version ${n.get(l.versionId!)}` : 'Une version du projet' }
          : { type: 'creation' as const, id: l.assetId!, libelle: c.creations.get(l.assetId!) ?? 'Une création du projet' },
        auteur: nom(l.authorId) ?? 'Un ancien membre de l’espace',
        quand: quandJournal(l.createdAt.toISOString()),
        texte: l.body,
        segments: segmentsCommentaire(l.body, lireMentions(l.history, l.body).mentions, nomMentionne),
        modifie: l.editedAt ? `Modifié le ${quandJournal(l.editedAt.toISOString())}${modifications > 1 ? ` · ${modifications} fois` : ''}` : null,
        resolu: l.resolvedAt ? { par: nom(l.resolvedBy) ?? 'Un ancien membre de l’espace', quand: quandJournal(l.resolvedAt.toISOString()) } : null,
        gestes: droitsCommentaire({ auteurId: l.authorId, resolu: !!l.resolvedAt, modifications }, { userId: ctx.userId, peutProposer }),
        iterer: gesteIterationCommentaire({
          id: l.id, projetId: c.projet.id, cible: l.targetType === 'version' ? 'version' : 'creation',
          test: l.targetType === 'creation' && l.assetId ? c.tests.get(l.assetId) ?? null : null,
        }, { resultats, marqueActive }),
        resultats: resultatsCommentaire(iterations.get(l.id) ?? [], { resultats, marqueActive }),
        rowVersion: l.rowVersion,
      };
    }),
  };
}

export async function listerCommentairesPour(ctx: ContexteStudio, e: { projectId: unknown }): Promise<Resultat<CommentairesProjet>> {
  if (!aPermissionEspace(ctx.permissions, 'studio.read')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  const c = await contexte(ctx, e.projectId);
  if (!c.ok) return c;
  return { ok: true, ...(await vueCommentaires(ctx, c)) };
}

const invalide = (ctx: ContexteStudio, raison: string, chemin = 'texte') => erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, message: raison, violations: [{ chemin, raison }] });

/** Le propriétaire voit-il encore le projet (membre de l'espace, marque dans sa portée) ? */
async function proprietaireVoit(ctx: ContexteStudio, p: ProjetStudio): Promise<boolean> {
  if (!p.ownerId) return false;
  const M = schema.workspaceMembers;
  const [membre] = await db.select({ userId: M.userId }).from(M).where(and(eq(M.workspaceId, p.workspaceId), eq(M.userId, p.ownerId))).limit(1);
  if (!membre) return false;
  const R = schema.studioMemberBrandScopes;
  const restrictions = (await db.select({ brandId: R.brandId }).from(R).where(and(eq(R.workspaceId, p.workspaceId), eq(R.userId, p.ownerId)))).map((r) => r.brandId);
  return objetDansPortee({ workspaceId: p.workspaceId, marquesDuWorkspace: ctx.marquesDuWorkspace, restrictionsMarque: restrictions }, p);
}

/**
 * Prévient le propriétaire du projet d'un NOUVEAU commentaire · seulement s'il
 * est encore membre de l'espace et voit la marque, et s'il n'y est pas
 * mentionné (la mention le prévient déjà) · best-effort.
 */
async function prevenirProprietaire(ctx: ContexteStudio, p: ProjetStudio, texte: string, mentionnesPrevenus: readonly string[]): Promise<void> {
  if (!proprietairePrevenuSansMention(p.ownerId, ctx.userId, mentionnesPrevenus)) return;
  try {
    if (!(await proprietaireVoit(ctx, p))) return;
    await createNotification({
      workspaceId: p.workspaceId, userId: p.ownerId!, type: 'studio_comment',
      title: `Nouveau commentaire · ${p.title}`, body: extraitCommentaire(texte), href: `/studio/projets/${p.id}#activite`,
    });
  } catch { /* la notification ne bloque jamais le commentaire */ }
}

/**
 * Prévient chaque personne mentionnée (la liste `aPrevenirMentions` · une fois
 * par commentaire, jamais l'auteur, toutes déjà relues mentionnables) · le
 * mécanisme existant, best-effort.
 */
async function prevenirMentionnes(p: ProjetStudio, texte: string, ids: readonly string[]): Promise<void> {
  for (const userId of ids) {
    try {
      await createNotification({
        workspaceId: p.workspaceId, userId, type: 'studio_comment_mention',
        title: `On te mentionne dans un commentaire · ${p.title}`, body: extraitCommentaire(texte), href: `/studio/projets/${p.id}#activite`,
      });
    } catch { /* la notification ne bloque jamais le commentaire */ }
  }
}

export async function commenterPour(ctx: ContexteStudio, e: { projectId: unknown; cible: unknown; cibleId: unknown; texte: unknown; mentions?: unknown }): Promise<Resultat<CommentairesProjet>> {
  if (!aPermissionEspace(ctx.permissions, 'studio.propose')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  const c = await contexte(ctx, e.projectId);
  if (!c.ok) return c;
  const t = validerTexteCommentaire(e.texte);
  if (!t.ok) return invalide(ctx, t.raison);
  const genre = cibleCommentaire(e.cible);
  if (!genre || !estUuid(e.cibleId)) return invalide(ctx, 'Choisis la version ou la création que tu commentes.', 'cible');
  if (genre === 'version') {
    const v = await lireVersion(ctx, e.cibleId);
    if (!v.ok || v.version.projectId !== c.projet.id) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  } else if (!c.creations.has(e.cibleId)) {
    return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  }
  const mentions = await mentionsDuTexte(ctx, c.projet, t.texte, e.mentions);
  const prevenus = aPrevenirMentions(mentions, [], ctx.userId);
  try {
    await db.insert(schema.studioComments).values({
      workspaceId: ctx.workspaceId, brandId: c.projet.brandId, projectId: c.projet.id, targetType: genre,
      versionId: genre === 'version' ? e.cibleId : null, assetId: genre === 'creation' ? e.cibleId : null,
      authorId: ctx.userId, body: t.texte, history: historiqueAvecMentions([], { mentions, prevenus }),
    });
  } catch (err) {
    console.error(`[studios] ${ctx.traceId} commentaire`, err instanceof Error ? err.message : err);
    return erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId, message: 'Le commentaire n’a pas pu être enregistré · réessaie dans un instant.' });
  }
  await prevenirMentionnes(c.projet, t.texte, prevenus);
  await prevenirProprietaire(ctx, c.projet, t.texte, prevenus);
  return { ok: true, ...(await vueCommentaires(ctx, c)) };
}

type Geste = { genre: 'modifier'; texte: unknown; mentions?: unknown } | { genre: 'resoudre' } | { genre: 'rouvrir' };

async function changerCommentaire(ctx: ContexteStudio, e: { commentId: unknown; rowVersion: unknown }, g: Geste): Promise<Resultat<CommentairesProjet>> {
  if (!aPermissionEspace(ctx.permissions, 'studio.propose')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  if (!estUuid(e.commentId) || ctx.marques.length === 0) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const C = schema.studioComments;
  const [k] = await db.select({ projectId: C.projectId, workspaceId: C.workspaceId, brandId: C.brandId }).from(C)
    .where(and(eq(C.id, e.commentId), eq(C.workspaceId, ctx.workspaceId), inArray(C.brandId, ctx.marques))).limit(1);
  if (!k || !objetDansPortee(portee(ctx), k)) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const c = await contexte(ctx, k.projectId);
  if (!c.ok) return c;
  const texte = g.genre === 'modifier' ? validerTexteCommentaire(g.texte) : null;
  if (texte && !texte.ok) return invalide(ctx, texte.raison);
  // Les mentions du nouveau texte, relues AVANT la transaction (membres de l'espace) · les nouvelles seules préviennent, après l'écriture.
  const mentions = g.genre === 'modifier' && texte?.ok ? await mentionsDuTexte(ctx, c.projet, texte.texte, g.mentions) : [];
  let aPrevenir: string[] = [];
  try {
    const refus = await db.transaction(async (tx): Promise<ErreurStudio | null> => {
      const [l] = await tx.select().from(C).where(and(eq(C.id, e.commentId as string), eq(C.projectId, c.projet.id), duProjet(C, ctx, c.projet))).limit(1).for('update');
      if (!l) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
      if (e.rowVersion !== l.rowVersion) {
        return erreurStudio('VERSION_CONFLICT', { traceId: ctx.traceId, targetIds: [l.id], message: 'Ce commentaire a changé depuis l’ouverture de la page · relis-le, rien n’a été écrasé.' });
      }
      const historique = lireHistoriqueCommentaire(l.history);
      const droits = droitsCommentaire({ auteurId: l.authorId, resolu: !!l.resolvedAt, modifications: historique.length }, { userId: ctx.userId, peutProposer: true });
      const d = droits[g.genre];
      if (!d.ok) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId, message: d.raison ?? undefined });
      const maintenant = new Date();
      const commun = { rowVersion: sql`${C.rowVersion} + 1`, updatedAt: maintenant };
      if (g.genre === 'modifier') {
        if (texte!.ok && texte!.texte === l.body) return null;
        const avant = lireMentions(l.history, l.body);
        aPrevenir = aPrevenirMentions(mentions, avant.prevenus, ctx.userId);
        const history = historiqueAvecMentions(historiqueApresModification(l.history, l.body, maintenant.toISOString()), { mentions, prevenus: prevenusApres(avant.prevenus, aPrevenir) });
        await tx.update(C).set({ ...commun, body: (texte as { texte: string }).texte, history, editedAt: maintenant }).where(eq(C.id, l.id));
      } else if (g.genre === 'resoudre') {
        await tx.update(C).set({ ...commun, resolvedAt: maintenant, resolvedBy: ctx.userId }).where(eq(C.id, l.id));
      } else {
        await tx.update(C).set({ ...commun, resolvedAt: null, resolvedBy: null }).where(eq(C.id, l.id));
      }
      return null;
    });
    if (refus) return refus;
  } catch (err) {
    console.error(`[studios] ${ctx.traceId} commentaire (${g.genre})`, err instanceof Error ? err.message : err);
    return erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId, message: 'Le commentaire n’a pas pu être mis à jour · réessaie dans un instant.' });
  }
  if (aPrevenir.length && texte?.ok) await prevenirMentionnes(c.projet, texte.texte, aPrevenir);
  return { ok: true, ...(await vueCommentaires(ctx, c)) };
}

export const modifierCommentairePour = (ctx: ContexteStudio, e: { commentId: unknown; rowVersion: unknown; texte: unknown; mentions?: unknown }) =>
  changerCommentaire(ctx, e, { genre: 'modifier', texte: e.texte, mentions: e.mentions });

/** `resolu: true` résout, `false` rouvre · toute autre valeur est refusée (rien n'est deviné). */
export async function resoudreCommentairePour(ctx: ContexteStudio, e: { commentId: unknown; rowVersion: unknown; resolu: unknown }): Promise<Resultat<CommentairesProjet>> {
  if (typeof e.resolu !== 'boolean') return invalide(ctx, 'Geste inconnu · recharge la page puis recommence.', 'resolu');
  return changerCommentaire(ctx, e, e.resolu ? { genre: 'resoudre' } : { genre: 'rouvrir' });
}

/** L'onglet « Activité » de la fiche · la première page du journal et les commentaires · un refus se dit, il ne casse pas la fiche. */
export async function activiteDuProjet(ctx: ContexteStudio, projectId: string): Promise<PropsActiviteProjet> {
  const dire = (r: ErreurStudio) => `${r.message} · identifiant support ${r.traceId}`;
  const [j, c] = await Promise.all([
    lireJournalPour(ctx, { projectId }).catch(() => erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId })),
    listerCommentairesPour(ctx, { projectId }).catch(() => erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId })),
  ]);
  return {
    projectId,
    journal: j.ok ? { ok: true, journal: j.journal, tronque: j.tronque } : { ok: false, message: dire(j) },
    commentaires: c.ok ? { ok: true, liste: { commentaires: c.commentaires, cibles: c.cibles, peutCommenter: c.peutCommenter, mentionnables: c.mentionnables } } : { ok: false, message: dire(c) },
  };
}
