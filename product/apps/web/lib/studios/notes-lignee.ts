import 'server-only';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  TEXTES_NOTE, aPermissionEspace, cleNoeudNote, droitsCommentaire, erreurStudio, historiqueApresModification, libelleAuteurVersion,
  lireHistoriqueCommentaire, noeudPourNote, objetDansPortee, quandJournal, validerTexteCommentaire, RAISON_PAS_UN_NOEUD,
  aPrevenirMentions, extraitCommentaire, gesteHypotheseNote, gesteIterationNote, historiqueAvecMentions, lienLigneeProjet, lireMentions,
  noeudDeGeste, nomAffichageMention, prevenusApres, resultatsFil, segmentsCommentaire, statutsHypothesesNote,
  type ErreurStudio, type MembreBrut, type TestPourGeste,
} from '@tiktrends/core';
import type { ContexteStudio } from './garde';
import { estUuid, lireProjet, type ProjetStudio } from './depot';
import { lireLigneeProjetPour } from './lignee/lignee';
import { listerVariantes } from './variantes/variantes';
import { membresDeLEspace, mentionnablesDe, mentionsDuTexte } from './membres-mentions';
import { lireResultatsDesFils, type ResultatsDesFils } from './resultat-fil';
import { createNotification } from '../notifications';
import { getActiveBrand } from '../brands';
import { getSession } from '../auth';
import { effectiveAccess } from '../access';
import { canAccess, denyReason, roleAtLeast, FEATURES } from '../rbac';
import type { NotesLignee, VueNoteLignee } from '../../spatial/vues/projet/types';

/**
 * Studios · lot 11 V5 (PC E11) · les NOTES du canvas de lignée (règles :
 * `C/spatial/projet/notes-lignee.ts` et celles des commentaires,
 * `C/studios/activite/commentaires.ts`, phrases `TEXTES_NOTE`).
 *
 *  · lire · qui voit le projet (`studio.read`) · toutes les notes du projet,
 *    rangées par l'écran sous leur nœud ou dans « Notes sans nœud » ;
 *  · poser · qui peut proposer (`studio.propose`) · le nœud est RELU dans la
 *    lignée du projet projetée au moment du geste (`lireLigneeProjetPour`,
 *    `noeudPourNote`) · un lien, une clé inventée, un nœud d'un autre projet ou
 *    disparu sont refusés, rien n'est écrit · le libellé du nœud est gardé
 *    avec la note (lisible si le nœud disparaît) ;
 *  · modifier la sienne (ancien texte gardé), résoudre / rouvrir · la règle
 *    des commentaires (`droitsCommentaire`) rejouée dans la transaction,
 *    version de ligne comparée · JAMAIS de suppression (la base la refuse) ;
 *  · MENTIONS (suite du lot 11) · les règles des commentaires (#1066)
 *    réutilisées telles quelles · « @Nom » d'un membre qui VOIT le projet
 *    (`membresDeLEspace`, `membresMentionnables`, `analyserMentions`) · stockée
 *    par IDENTIFIANT dans le JSON existant `history` de la note (aucune
 *    migration) · chaque mentionné prévenu UNE fois par note
 *    (`createNotification`, type `studio_note_mention`), jamais l'auteur ;
 *  · RÉSULTAT (suite du lot 11) · sous une note d'où est née une itération
 *    (provenance `source_ref_json.note`) · le résultat de cette itération une
 *    fois son lot conclu, « en test » avant · et sous une note d'où est née
 *    une hypothèse (origine `type: 'note'`) · le statut de sa carte · la règle
 *    des commentaires GÉNÉRALISÉE (`resultatsFil`,
 *    `statutsHypothesesNote`, `lireResultatsDesFils`) · CALCULÉ à chaque
 *    lecture, jamais écrit · Résultats fermé, rien ;
 *  · GESTES · « Itérer depuis cette note » (nœud création / résultat dont la
 *    variante a une pub testée · `gesteIterationNote`) et « Formuler une
 *    hypothèse » (nœud brief / hypothèse · `gesteHypotheseNote`) · des LIENS
 *    vers les écrans existants, qui relisent tout · rien n'est écrit ici.
 *
 * Aucune permission nouvelle, aucun appel IA · 0 $.
 */

type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

/** Au plus 500 notes lues par projet · les plus anciennes d'abord (l'ordre de la conversation). */
export const NOTES_MAX_LUES = 500;

const portee = (ctx: ContexteStudio) => ({ workspaceId: ctx.workspaceId, marquesDuWorkspace: ctx.marquesDuWorkspace, restrictionsMarque: ctx.restrictionsMarque });
const N = () => schema.studioLineageNotes;
/** La portée SQL bornée à LA marque du projet (déjà relue dans la portée). */
const duProjet = (ctx: ContexteStudio, p: ProjetStudio) =>
  and(eq(N().projectId, p.id), eq(N().workspaceId, ctx.workspaceId), eq(N().brandId, p.brandId), inArray(N().brandId, ctx.marques))!;

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

const ADSMAP = FEATURES.find((f) => f.key === 'adsmap')!;

/**
 * Les portes des gestes, relues seulement s'il y a de quoi · Résultats ouvert
 * à la session (« Itérer » · la fonction Adsmap), le niveau d'accès aux
 * hypothèses (`accesHypothese` · formule, rôle membre comme `adsmapGuard`), et
 * le projet dans la marque ACTIVE · jamais pris du client.
 */
async function portesDesGestes(p: ProjetStudio): Promise<{ resultats: boolean; adsmap: 'ok' | 'plan' | 'role'; marqueActive: boolean }> {
  const s = await getSession().catch(() => null);
  const acces = s ? effectiveAccess(s) : null;
  const ouvert = !!acces && canAccess(acces, ADSMAP);
  const adsmap = !s || !acces ? 'role' : ouvert ? (roleAtLeast(s.role, 'member') ? 'ok' : 'role') : denyReason(acces, ADSMAP) === 'plan' ? 'plan' : 'role';
  const active = s ? await getActiveBrand(s.workspaceId).catch(() => null) : null;
  return { resultats: ouvert, adsmap, marqueActive: !!active && active.id === p.brandId };
}

/** Le test de chaque variante du projet · la pub dont « Itérer depuis cette note » part (la lecture de la fiche). */
async function testsDesVariantes(ctx: ContexteStudio, p: ProjetStudio): Promise<Map<string, TestPourGeste>> {
  const out = new Map<string, TestPourGeste>();
  const r = await listerVariantes(ctx, { projectId: p.id }, { adsmapAcces: false, relecture: { disponible: false, raison: null, coutMaxUsd: null } });
  if (!r.ok) return out;
  for (const v of r.donnees.variantes) {
    if (v.test) out.set(v.id.toLowerCase(), { adsmapAdId: v.test.adsmapAdId, verdict: v.test.verdict ? { validated: v.test.verdict.validated, comparable: v.test.verdict.comparable } : null });
  }
  return out;
}

async function vueNotes(ctx: ContexteStudio, p: ProjetStudio): Promise<NotesLignee> {
  const lignes = (await db.select().from(N()).where(duProjet(ctx, p)).orderBy(asc(N().createdAt), asc(N().id)).limit(NOTES_MAX_LUES))
    .filter((l) => objetDansPortee(portee(ctx), l));
  const nom = await noms(ctx, lignes.flatMap((l) => [l.authorId, l.resolvedBy]));
  const peutEcrire = aPermissionEspace(ctx.permissions, 'studio.propose');
  // Les gestes · lus seulement s'il y a une note sur un nœud qui en porte un.
  const gestes = lignes.map((l) => noeudDeGeste(l.nodeKey)?.geste ?? null);
  const [membres, tests, nees] = await Promise.all([
    membresDeLEspace(p).catch(() => [] as MembreBrut[]),
    gestes.includes('iterer') ? testsDesVariantes(ctx, p).catch(() => new Map<string, TestPourGeste>()) : new Map<string, TestPourGeste>(),
    lireResultatsDesFils(ctx, p, 'note', lignes.map((l) => l.id)).catch((): ResultatsDesFils => ({ iterations: new Map(), hypotheses: new Map() })),
  ]);
  // Les portes (Résultats, marque active) · relues seulement s'il y a un geste ou de quoi dire sous une note.
  const portes = gestes.some(Boolean) || nees.iterations.size || nees.hypotheses.size ? await portesDesGestes(p).catch(() => null) : null;
  const parMembre = new Map(membres.map((m) => [m.id.toLowerCase(), m]));
  const nomMentionne = (id: string) => nomAffichageMention(parMembre.get(id), p, ctx.marquesDuWorkspace);
  const fermees = { resultats: false, adsmap: 'role' as const, marqueActive: false };
  return {
    peutEcrire,
    mentionnables: peutEcrire ? mentionnablesDe(ctx, p, membres) : [],
    notes: lignes.map((l): VueNoteLignee => {
      const n = noeudDeGeste(l.nodeKey);
      const o = portes ?? fermees;
      const anciens = lireHistoriqueCommentaire(l.history);
      return {
        id: l.id, noeud: l.nodeKey, libelleNoeud: l.nodeLabel,
        auteur: nom(l.authorId) ?? 'Un ancien membre de l’espace',
        quand: quandJournal(l.createdAt.toISOString()),
        texte: l.body,
        modifie: l.editedAt ? `Modifiée le ${quandJournal(l.editedAt.toISOString())}${anciens.length > 1 ? ` · ${anciens.length} fois` : ''}` : null,
        anciens: anciens.map((a) => ({ texte: a.texte, quand: quandJournal(a.remplaceLe) })),
        resolu: l.resolvedAt ? { par: nom(l.resolvedBy) ?? 'Un ancien membre de l’espace', quand: quandJournal(l.resolvedAt.toISOString()) } : null,
        gestes: droitsCommentaire({ auteurId: l.authorId, resolu: !!l.resolvedAt, modifications: anciens.length }, { userId: ctx.userId, peutProposer: peutEcrire }, TEXTES_NOTE),
        rowVersion: l.rowVersion,
        segments: segmentsCommentaire(l.body, lireMentions(l.history, l.body).mentions, nomMentionne),
        iterer: n?.geste === 'iterer'
          ? gesteIterationNote({ id: l.id, projetId: p.id, noeud: l.nodeKey, test: tests.get(n.varianteId) ?? null }, { resultats: o.resultats, marqueActive: o.marqueActive })
          : null,
        hypothese: n?.geste === 'hypothese' ? gesteHypotheseNote({ id: l.id, projetId: p.id, noeud: l.nodeKey }, { adsmap: o.adsmap, marqueActive: o.marqueActive }) : null,
        resultats: resultatsFil(nees.iterations.get(l.id) ?? [], { resultats: o.resultats, marqueActive: o.marqueActive }),
        hypotheses: statutsHypothesesNote(nees.hypotheses.get(l.id) ?? [], { resultats: o.resultats, marqueActive: o.marqueActive }),
      };
    }),
  };
}

const invalide = (ctx: ContexteStudio, raison: string, chemin = 'texte') => erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, message: raison, violations: [{ chemin, raison }] });

export async function lireNotesLigneePour(ctx: ContexteStudio, e: { projectId: unknown }): Promise<Resultat<NotesLignee>> {
  if (!aPermissionEspace(ctx.permissions, 'studio.read')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  const p = await lireProjet(ctx, e.projectId);
  if (!p.ok) return p;
  return { ok: true, ...(await vueNotes(ctx, p.projet)) };
}

/** Pose une note sur UN nœud de la lignée du projet · le nœud est relu dans la lignée projetée maintenant. */
/**
 * Prévient chaque personne mentionnée dans une note (la liste
 * `aPrevenirMentions` · une fois par note, jamais l'auteur, toutes déjà relues
 * mentionnables) · le mécanisme existant, best-effort.
 */
async function prevenirMentionnesNote(p: ProjetStudio, texte: string, ids: readonly string[]): Promise<void> {
  for (const userId of ids) {
    try {
      await createNotification({
        workspaceId: p.workspaceId, userId, type: 'studio_note_mention',
        title: `On te mentionne dans une note de la lignée · ${p.title}`, body: extraitCommentaire(texte), href: lienLigneeProjet(p.id),
      });
    } catch { /* la notification ne bloque jamais la note */ }
  }
}

export async function noterNoeudPour(
  ctx: ContexteStudio,
  e: { projectId: unknown; noeud: unknown; texte: unknown; mentions?: unknown },
  o: { veilleOuverte: boolean; maintenant: Date },
): Promise<Resultat<NotesLignee>> {
  if (!aPermissionEspace(ctx.permissions, 'studio.propose')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  const p = await lireProjet(ctx, e.projectId);
  if (!p.ok) return p;
  const t = validerTexteCommentaire(e.texte, TEXTES_NOTE);
  if (!t.ok) return invalide(ctx, t.raison);
  if (!cleNoeudNote(e.noeud)) return invalide(ctx, RAISON_PAS_UN_NOEUD, 'noeud');
  const l = await lireLigneeProjetPour(ctx, p.projet.id, o);
  if (!l.ok) return l;
  const n = noeudPourNote(l.lignee.lignee, e.noeud);
  if (!n.ok) return invalide(ctx, n.raison, 'noeud');
  // Les mentions · relues contre les membres qui voient le projet (un identifiant forgé est ignoré) · prévenues après l'écriture.
  const mentions = await mentionsDuTexte(ctx, p.projet, t.texte, e.mentions);
  const prevenus = aPrevenirMentions(mentions, [], ctx.userId);
  try {
    await db.insert(schema.studioLineageNotes).values({
      workspaceId: ctx.workspaceId, brandId: p.projet.brandId, projectId: p.projet.id,
      nodeKey: n.cle, nodeLabel: n.libelle, authorId: ctx.userId, body: t.texte, history: historiqueAvecMentions([], { mentions, prevenus }),
    });
  } catch (err) {
    console.error(`[studios] ${ctx.traceId} note de lignée`, err instanceof Error ? err.message : err);
    return erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId, message: 'La note n’a pas pu être enregistrée · réessaie dans un instant.' });
  }
  await prevenirMentionnesNote(p.projet, t.texte, prevenus);
  return { ok: true, ...(await vueNotes(ctx, p.projet)) };
}

type Geste = { genre: 'modifier'; texte: unknown; mentions?: unknown } | { genre: 'resoudre' } | { genre: 'rouvrir' };

async function changerNote(ctx: ContexteStudio, e: { noteId: unknown; rowVersion: unknown }, g: Geste): Promise<Resultat<NotesLignee>> {
  if (!aPermissionEspace(ctx.permissions, 'studio.propose')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  if (!estUuid(e.noteId) || ctx.marques.length === 0) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const [k] = await db.select({ projectId: N().projectId, workspaceId: N().workspaceId, brandId: N().brandId }).from(N())
    .where(and(eq(N().id, e.noteId), eq(N().workspaceId, ctx.workspaceId), inArray(N().brandId, ctx.marques))).limit(1);
  if (!k || !objetDansPortee(portee(ctx), k)) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const p = await lireProjet(ctx, k.projectId);
  if (!p.ok) return p;
  const texte = g.genre === 'modifier' ? validerTexteCommentaire(g.texte, TEXTES_NOTE) : null;
  if (texte && !texte.ok) return invalide(ctx, texte.raison);
  // Les mentions du nouveau texte, relues AVANT la transaction · seules les nouvelles personnes sont prévenues, après l'écriture.
  const mentions = g.genre === 'modifier' && texte?.ok ? await mentionsDuTexte(ctx, p.projet, texte.texte, g.mentions) : [];
  let aPrevenir: string[] = [];
  try {
    const refus = await db.transaction(async (tx): Promise<ErreurStudio | null> => {
      const [l] = await tx.select().from(N()).where(and(eq(N().id, e.noteId as string), duProjet(ctx, p.projet))).limit(1).for('update');
      if (!l) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
      if (e.rowVersion !== l.rowVersion) {
        return erreurStudio('VERSION_CONFLICT', { traceId: ctx.traceId, targetIds: [l.id], message: 'Cette note a changé depuis l’ouverture de la page · relis-la, rien n’a été écrasé.' });
      }
      const historique = lireHistoriqueCommentaire(l.history);
      const d = droitsCommentaire({ auteurId: l.authorId, resolu: !!l.resolvedAt, modifications: historique.length }, { userId: ctx.userId, peutProposer: true }, TEXTES_NOTE)[g.genre];
      if (!d.ok) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId, message: d.raison ?? undefined });
      const maintenant = new Date();
      const commun = { rowVersion: sql`${N().rowVersion} + 1`, updatedAt: maintenant };
      if (g.genre === 'modifier') {
        const nouveau = (texte as { texte: string }).texte;
        if (nouveau === l.body) return null;
        const avant = lireMentions(l.history, l.body);
        aPrevenir = aPrevenirMentions(mentions, avant.prevenus, ctx.userId);
        const history = historiqueAvecMentions(historiqueApresModification(l.history, l.body, maintenant.toISOString()), { mentions, prevenus: prevenusApres(avant.prevenus, aPrevenir) });
        await tx.update(N()).set({ ...commun, body: nouveau, history, editedAt: maintenant }).where(eq(N().id, l.id));
      } else if (g.genre === 'resoudre') {
        await tx.update(N()).set({ ...commun, resolvedAt: maintenant, resolvedBy: ctx.userId }).where(eq(N().id, l.id));
      } else {
        await tx.update(N()).set({ ...commun, resolvedAt: null, resolvedBy: null }).where(eq(N().id, l.id));
      }
      return null;
    });
    if (refus) return refus;
  } catch (err) {
    console.error(`[studios] ${ctx.traceId} note de lignée (${g.genre})`, err instanceof Error ? err.message : err);
    return erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId, message: 'La note n’a pas pu être mise à jour · réessaie dans un instant.' });
  }
  if (aPrevenir.length && texte?.ok) await prevenirMentionnesNote(p.projet, texte.texte, aPrevenir);
  return { ok: true, ...(await vueNotes(ctx, p.projet)) };
}

/** Modifie SA note, encore ouverte · l'ancien texte est gardé. */
export const modifierNoteLigneePour = (ctx: ContexteStudio, e: { noteId: unknown; rowVersion: unknown; texte: unknown; mentions?: unknown }) =>
  changerNote(ctx, e, { genre: 'modifier', texte: e.texte, mentions: e.mentions });

/** `resolue: true` résout, `false` rouvre · toute autre valeur est refusée (rien n'est deviné). */
export async function resoudreNoteLigneePour(ctx: ContexteStudio, e: { noteId: unknown; rowVersion: unknown; resolue: unknown }): Promise<Resultat<NotesLignee>> {
  if (typeof e.resolue !== 'boolean') return invalide(ctx, 'Geste inconnu · recharge la page puis recommence.', 'resolue');
  return changerNote(ctx, e, e.resolue ? { genre: 'resoudre' } : { genre: 'rouvrir' });
}
