import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { etatEffectif, resumerProjetsPourJarvis, resumerConceptPourJarvis, lienProjetStudio, type EtatProposition, type ProjetPourJarvis } from '@tiktrends/core';
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

export interface ProjetColonne { id: string; titre: string; href: string }

/**
 * Les projets de la marque pour la COLONNE V5 (titres cliquables), MÊMES gardes
 * que l'écran « Projets » et que le bloc de consigne · session relue, portée
 * (espace + marque + restrictions), capacité « projets ». Lecture seule, jamais
 * bloquante · un refus ou une panne rend une liste vide, la colonne n'affiche
 * simplement pas la section.
 */
export async function projetsPourColonneJarvis(brandId: string, limite = 8): Promise<ProjetColonne[]> {
  if (!db) return [];
  try {
    const g = await gardeSources('studio.read');
    if (!g.ok) return [];
    const { ctx, veilleOuverte } = g;
    if (!ctx.marques.includes(brandId)) return [];
    const capacites = await etatInterrupteurs(ctx.workspaceId);
    if (!capacites.actif('projets')) return [];
    const { listerCartesPour } = await import('./sources/projet');
    const cartes = await listerCartesPour(ctx, { brandId, veilleOuverte, maintenant: new Date(), limite });
    return cartes
      .map((c) => ({ id: c.id, titre: c.title, href: lienProjetStudio(c.id) }))
      .filter((p): p is ProjetColonne => p.href !== null && !!p.titre);
  } catch {
    return [];
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

/**
 * L'état d'UN concept pour la consigne de Jarvis, quand la conversation lui est
 * liée (`projectId`). MÊMES gardes que l'écran « Projets » (session relue,
 * `studio.read`, capacité « projets », portée espace + marque + restrictions) ·
 * le projet est relu via `lireProjetDetailPour` (#837, lecture seule, appelé,
 * jamais modifié), ce qui sert aussi de barrière de portée : un projet absent,
 * hors portée ou d'une autre marque que la marque active rend un bloc vide.
 *
 * Résume le brief (objectif, audience, persona, angle, concept, plateformes ·
 * connu vs manquant), l'étape, les propositions en attente (`proposed`) et la
 * présence de médias/générations · la règle pure du noyau
 * (`resumerConceptPourJarvis`) décide du texte. Lecture seule, jamais bloquante :
 * un refus ou une panne rend `''`, et la consigne reste exactement celle d'avant
 * (page /jarvis sans projet · comportement inchangé).
 */
export async function blocConceptJarvis(brandId: string, projectId: string, maintenant: Date = new Date()): Promise<string> {
  if (!db) return '';
  try {
    const g = await gardeSources('studio.read');
    if (!g.ok) return '';
    const { ctx, veilleOuverte } = g;
    if (!ctx.marques.includes(brandId)) return '';
    const capacites = await etatInterrupteurs(ctx.workspaceId);
    if (!capacites.actif('projets')) return '';

    // Lecture du projet dans la portée (barrière de portée + brief + étape).
    const { lireProjetDetailPour } = await import('./sources/projet');
    const d = await lireProjetDetailPour(ctx, projectId, { veilleOuverte, maintenant });
    if (!d.ok) return '';
    const { detail } = d;
    // Seconde barrière : le concept doit être celui de la marque ACTIVE.
    if (detail.projet.brandId !== brandId) return '';

    const PR = schema.studioProposals;
    const A = schema.studioAssets;
    const J = schema.studioJobs;
    const [propositions, medias, jobs] = await Promise.all([
      // Les propositions ne comptent que si leur capacité est ouverte · sinon
      // l'écran ne les montre pas, et Jarvis n'en parle pas.
      capacites.actif('propositions')
        ? db.select({ state: PR.state, expiresAt: PR.expiresAt }).from(PR)
          .where(and(eq(PR.workspaceId, ctx.workspaceId), eq(PR.brandId, brandId), eq(PR.projectId, detail.projet.id), eq(PR.state, 'proposed')))
          .limit(500)
        : Promise.resolve(null),
      db.select({ n: sql<number>`count(*)::int` }).from(A)
        .where(and(eq(A.workspaceId, ctx.workspaceId), eq(A.brandId, brandId), eq(A.projectId, detail.projet.id))),
      db.select({ n: sql<number>`count(*)::int` }).from(J)
        .where(and(eq(J.workspaceId, ctx.workspaceId), eq(J.brandId, brandId), eq(J.projectId, detail.projet.id))),
    ]);
    const propositionsEnAttente = (propositions ?? [])
      .filter((p) => etatEffectif({ state: p.state as EtatProposition, expiresAt: p.expiresAt }, maintenant) === 'proposed')
      .length;

    return resumerConceptPourJarvis({
      titre: detail.projet.title,
      libelleEtape: detail.completude.libelleEtape,
      brief: detail.brief,
      propositionsEnAttente,
      medias: Number(medias[0]?.n ?? 0),
      jobs: Number(jobs[0]?.n ?? 0),
    });
  } catch {
    return '';
  }
}
