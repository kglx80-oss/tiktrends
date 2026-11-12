import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { aPermissionEspace, libelleAuteurVersion, noeudDeGeste, objetDansPortee } from '@tiktrends/core';
import type { Session } from '../auth';
import { effectiveAccess } from '../access';
import { canAccess, FEATURES } from '../rbac';
import { gardeStudio } from './garde';
import { listerVariantes } from './variantes/variantes';
import { refusCapacite } from './interrupteurs';

/**
 * « Itérer depuis ce commentaire » · le côté serveur · une LECTURE, jamais une
 * écriture, aucun modèle. Les règles vivent au noyau
 * (`C/studios/activite/iterer-commentaire.ts`, `provenanceCommentaireAdmise`).
 *
 * Le commentaire désigné par l'adresse (`?commentaire=<uuid>&projet=<uuid>`)
 * est relu dans la portée de la session :
 *  · Résultats ouvert (la fonction `adsmap` · l'itération part d'un verdict) ;
 *  · la garde des Studios (`studio.read`) · même espace, marque ACTIVE parmi
 *    les marques visibles (restrictions comprises) ;
 *  · le PROJET de l'adresse, dans l'espace et la marque active ;
 *  · le commentaire DE CE projet, de cette marque, sur une CRÉATION ;
 *  · la variante de cette création et son lien de test (`listerVariantes`,
 *    la même lecture que la fiche) · la pub de départ.
 * Un commentaire d'un autre projet, d'une autre marque, d'un autre espace,
 * sur une version, d'une création non testée, inconnu · `null` · l'appelant dit
 * la même phrase (`REFUS_GESTE_COMMENTAIRE`), rien ne dit s'il existe ailleurs.
 *
 * Lot 11 · les NOTES de la lignée suivent la même portée (`projetDeLaPortee`)
 * · « Itérer depuis cette note » (nœud création / résultat testé,
 * `lireNotePourIterer`) et « Formuler une hypothèse » (nœud brief / hypothèse,
 * `lireNotePourHypothese`) · même refus muet (`REFUS_GESTE_NOTE`,
 * `REFUS_HYPOTHESE_NOTE`).
 */

const ADSMAP = FEATURES.find((f) => f.key === 'adsmap')!;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SessionLue = Pick<Session, 'workspaceId' | 'role' | 'plan' | 'user' | 'equipe'>;

export interface CommentaireLuPourIterer { commentaireId: string; projetId: string; texte: string; adsmapAdId: string }

type Garde = Extract<Awaited<ReturnType<typeof gardeStudio>>, { ok: true }>;
type Portee = { workspaceId: string; marquesDuWorkspace: string[]; restrictionsMarque: string[] };

/**
 * La portée commune aux deux fils (commentaire, note) · Résultats ouvert, la
 * garde des Studios relue (`studio.read`, même espace, marque ACTIVE parmi les
 * marques visibles), le PROJET de l'adresse dans l'espace et la marque active ·
 * `null` sinon (rien ne dit pourquoi).
 */
async function projetDeLaPortee(s: SessionLue, brandId: string, projetId: string): Promise<{ g: Garde; portee: Portee; projetId: string } | null> {
  if (!canAccess(effectiveAccess(s), ADSMAP)) return null;
  const g = await gardeStudio('studio.read');
  if (!g.ok || g.ctx.workspaceId !== s.workspaceId || !g.ctx.marques.includes(brandId) || !aPermissionEspace(g.ctx.permissions, 'studio.read')) return null;
  const portee = { workspaceId: g.ctx.workspaceId, marquesDuWorkspace: g.ctx.marquesDuWorkspace, restrictionsMarque: g.ctx.restrictionsMarque };
  const P = schema.studioProjects;
  const [p] = await db.select({ id: P.id, workspaceId: P.workspaceId, brandId: P.brandId }).from(P)
    .where(and(eq(P.id, projetId), eq(P.workspaceId, s.workspaceId), eq(P.brandId, brandId))).limit(1);
  if (!p || !objetDansPortee(portee, p)) return null;
  return { g, portee, projetId: p.id };
}

/** La pub de test de la variante d'une création (par son média) ou d'un nœud (par sa variante) · la lecture de la fiche. */
async function pubDeTest(g: Garde, projetId: string, cherche: (v: { id: string; assetId: string }) => boolean): Promise<string | null> {
  const r = await listerVariantes(g.ctx, { projectId: projetId }, { adsmapAcces: false, relecture: { disponible: false, raison: null, coutMaxUsd: null } });
  if (!r.ok) return null;
  const v = r.donnees.variantes.find((x) => cherche(x) && x.test);
  return v?.test ? v.test.adsmapAdId.toLowerCase() : null;
}

export async function lireCommentairePourIterer(s: SessionLue, brandId: string, d: { commentaireId: string; projetId: string }): Promise<CommentaireLuPourIterer | null> {
  if (!db || !UUID.test(d.commentaireId) || !UUID.test(d.projetId)) return null;
  try {
    const x = await projetDeLaPortee(s, brandId, d.projetId);
    if (!x) return null;
    const C = schema.studioComments;
    const [k] = await db.select({ id: C.id, body: C.body, targetType: C.targetType, assetId: C.assetId, workspaceId: C.workspaceId, brandId: C.brandId }).from(C)
      .where(and(eq(C.id, d.commentaireId), eq(C.projectId, x.projetId), eq(C.workspaceId, s.workspaceId), eq(C.brandId, brandId))).limit(1);
    if (!k || k.targetType !== 'creation' || !k.assetId || !objetDansPortee(x.portee, k)) return null;
    const ad = await pubDeTest(x.g, x.projetId, (v) => v.assetId === k.assetId);
    if (!ad) return null;
    return { commentaireId: k.id, projetId: x.projetId, texte: k.body, adsmapAdId: ad };
  } catch {
    return null;
  }
}

/* ───────────────────────── les notes de la lignée (lot 11) ───────────────────────── */

/** Une note de la lignée relue dans la portée · son texte, son nœud, qui l'a écrite (`null` · la session). */
export interface NoteLuePourGeste { noteId: string; projetId: string; texte: string; noeud: string; libelleNoeud: string; auteur: string | null }

/**
 * La note désignée par l'adresse, relue · la portée des deux fils
 * (`projetDeLaPortee`), les capacités « projets » et « canvas » de l'espace
 * (celles des actions des notes), la note DE CE projet et de cette marque ·
 * `null` sinon. Le geste du nœud est vérifié par l'appelant.
 */
async function lireNote(s: SessionLue, brandId: string, d: { noteId: string; projetId: string }): Promise<{ g: Garde; note: NoteLuePourGeste } | null> {
  if (!db || !UUID.test(d.noteId) || !UUID.test(d.projetId)) return null;
  const x = await projetDeLaPortee(s, brandId, d.projetId);
  if (!x) return null;
  if (await refusCapacite(x.g.ctx, ['projets', 'canvas'])) return null;
  const N = schema.studioLineageNotes;
  const [n] = await db.select({ id: N.id, body: N.body, nodeKey: N.nodeKey, nodeLabel: N.nodeLabel, authorId: N.authorId, workspaceId: N.workspaceId, brandId: N.brandId }).from(N)
    .where(and(eq(N.id, d.noteId), eq(N.projectId, x.projetId), eq(N.workspaceId, s.workspaceId), eq(N.brandId, brandId))).limit(1);
  if (!n || !objetDansPortee(x.portee, n)) return null;
  let auteur: string | null = null;
  if (n.authorId && n.authorId !== s.user.id) {
    const U = schema.users;
    const [u] = await db.select({ nom: U.name, email: U.email, masque: U.hidePersonalInfo }).from(U).where(eq(U.id, n.authorId)).limit(1);
    auteur = libelleAuteurVersion({ authorId: n.authorId, nom: u?.nom ?? null, email: u?.email ?? null, masque: !!u?.masque }, s.user.id);
  } else if (!n.authorId) auteur = 'Un ancien membre de l’espace';
  return { g: x.g, note: { noteId: n.id, projetId: x.projetId, texte: n.body, noeud: n.nodeKey, libelleNoeud: n.nodeLabel, auteur } };
}

/**
 * « Itérer depuis cette note » · la note relue, posée sur un nœud CRÉATION ou
 * RÉSULTAT dont la variante a une pub testée (`noeudDeGeste`, noyau) · la pub
 * de départ · `null` sinon (autre projet, autre marque, autre espace, autre
 * nœud, variante sans test, inconnue) · l'appelant dit `REFUS_GESTE_NOTE`.
 */
export async function lireNotePourIterer(s: SessionLue, brandId: string, d: { noteId: string; projetId: string }): Promise<(NoteLuePourGeste & { adsmapAdId: string }) | null> {
  try {
    const l = await lireNote(s, brandId, d);
    const n = l ? noeudDeGeste(l.note.noeud) : null;
    if (!l || n?.geste !== 'iterer') return null;
    const ad = await pubDeTest(l.g, l.note.projetId, (v) => v.id.toLowerCase() === n.varianteId);
    return ad ? { ...l.note, adsmapAdId: ad } : null;
  } catch {
    return null;
  }
}

/**
 * « Formuler une hypothèse » · la note relue, posée sur un nœud BRIEF ou
 * HYPOTHÈSE (`noeudDeGeste`) · `null` sinon · l'appelant dit `REFUS_HYPOTHESE_NOTE`.
 */
export async function lireNotePourHypothese(s: SessionLue, brandId: string, d: { noteId: string; projetId: string }): Promise<NoteLuePourGeste | null> {
  try {
    const l = await lireNote(s, brandId, d);
    return l && noeudDeGeste(l.note.noeud)?.geste === 'hypothese' ? l.note : null;
  } catch {
    return null;
  }
}
