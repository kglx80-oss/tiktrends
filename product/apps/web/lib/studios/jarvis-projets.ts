import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { etatEffectif, resumerProjetsPourJarvis, type EtatProposition, type ProjetPourJarvis } from '@tiktrends/core';
import { gardeStudio } from './garde';
import { gardeSources } from './sources/acces';
import { etatInterrupteurs } from './interrupteurs';

/**
 * Jarvis ↔ Studios · le côté serveur (règle pure : `packages/core/src/studios/jarvis-projets.ts`).
 *
 * Mêmes gardes que l'écran « Projets » (`listerProjetsCartes`) : session relue,
 * permission `studio.read`, capacité « projets » active pour l'espace, portée
 * (espace de la session + marques de l'espace + restrictions par marque). Puis
 * la MÊME lecture que les cartes (`listerCartesPour`), filtrée à la marque
 * active. Rien n'est pris du navigateur.
 *
 * Lecture seule, jamais bloquante : un refus ou une panne rend un bloc vide,
 * et Jarvis répond comme avant.
 */

/** Projets lus pour le résumé · au-delà, le bloc renvoie vers la liste complète. */
const LECTURE_MAX = 20;

/** L'utilisateur peut-il ouvrir l'écran « Projets » ? Même garde que l'écran. */
export async function peutOuvrirProjetsStudios(): Promise<boolean> {
  try {
    return (await gardeStudio('studio.read', 'projets')).ok;
  } catch {
    return false;
  }
}

/** Le bloc de consigne des projets de la marque active · `''` si rien à dire ou pas le droit. */
export async function blocProjetsJarvis(brandId: string, maintenant: Date = new Date()): Promise<string> {
  if (!db) return '';
  const g = await gardeSources('studio.read');
  if (!g.ok) return '';
  const { ctx, veilleOuverte } = g;
  if (!ctx.marques.includes(brandId)) return '';
  const capacites = await etatInterrupteurs(ctx.workspaceId);
  if (!capacites.actif('projets')) return '';

  const { listerCartesPour } = await import('./sources/projet');
  const cartes = await listerCartesPour(ctx, { brandId, veilleOuverte, maintenant, limite: LECTURE_MAX });
  if (cartes.length === 0) return '';
  const ids = cartes.map((c) => c.id);

  const V = schema.studioVariants;
  const PR = schema.studioProposals;
  const [variantes, propositions] = await Promise.all([
    db.select({ projectId: V.projectId, n: sql<number>`count(*)::int` }).from(V)
      .where(and(eq(V.workspaceId, ctx.workspaceId), eq(V.brandId, brandId), inArray(V.projectId, ids)))
      .groupBy(V.projectId),
    // Les propositions ne comptent que si leur capacité est ouverte · sinon
    // l'écran ne les montre pas, et Jarvis n'en parle pas.
    capacites.actif('propositions')
      ? db.select({ projectId: PR.projectId, state: PR.state, expiresAt: PR.expiresAt }).from(PR)
        .where(and(eq(PR.workspaceId, ctx.workspaceId), eq(PR.brandId, brandId), inArray(PR.projectId, ids), eq(PR.state, 'proposed')))
        .limit(500)
      : Promise.resolve(null),
  ]);
  const nVariantes = new Map(variantes.map((v) => [v.projectId, Number(v.n)]));
  const nAttente = new Map<string, number>();
  for (const p of propositions ?? []) {
    if (etatEffectif({ state: p.state as EtatProposition, expiresAt: p.expiresAt }, maintenant) !== 'proposed') continue;
    nAttente.set(p.projectId, (nAttente.get(p.projectId) ?? 0) + 1);
  }

  const projets: ProjetPourJarvis[] = cartes.map((c) => ({
    id: c.id,
    // Les cartes sont déjà filtrées par la portée de la session · l'espace est
    // celui du contexte serveur, la règle pure le revérifie.
    workspaceId: ctx.workspaceId,
    brandId: c.brandId,
    titre: c.title,
    type: c.libelleType,
    etape: c.libelleEtape,
    manque: c.manques[0]?.libelle ?? null,
    majLe: c.updatedAt,
    variantes: nVariantes.get(c.id) ?? 0,
    propositionsEnAttente: propositions ? (nAttente.get(c.id) ?? 0) : null,
  }));
  return resumerProjetsPourJarvis(projets, { workspaceId: ctx.workspaceId, brandId });
}
