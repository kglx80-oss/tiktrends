/**
 * Recette Studios · SEMIS synthétique de la base de recette ·
 * `pnpm --filter @tiktrends/web recette:semer` (dans le service d'outils du
 * projet compose `tiktrends-recette`, voir `ops/recette/README.md`).
 *
 * Écrit, une seule fois (identifiants fixes, un second passage ne duplique
 * rien) : un espace, une personne, une marque, un produit et ses photos
 * SYNTHÉTIQUES (dessinées par code, jeu du benchmark `jeu-synthetique.ts`,
 * aucune source client), un projet studio avec brief et produit épinglé, puis
 * la release de prompts de recette locale (`preparerReleaseLocale` : import du
 * pack embarqué, validation, release, publication en environnement « test »).
 *
 * Aucun appel de modèle, aucune dépense.
 *
 * Garde anti-production · `verifierCibleRecette` (pur) AVANT toute connexion :
 * TIKTRENDS_ENV=recette, base jointe en 127.0.0.1, nom de base contenant
 * « recette », STUDIOS_PROMPTS_RECETTE_LOCALE=1, plafond posé ≤ 15 $. La même
 * vérification est refaite dans `semerRecette` (ce que le test éprouve).
 * Codes de sortie : 0 succès, 1 erreur, 2 refus.
 */

import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContenuVersion } from '@tiktrends/core';
import { RECETTE, verifierCibleRecette, type Env } from './regles';

export type ResultatSemis =
  | { ok: false; raisons: string[] }
  | { ok: true; deja: boolean; releaseId: string; projectId: string; productId: string };

const dataUri = (octets: Buffer) => `data:image/png;base64,${octets.toString('base64')}`;

/**
 * Le semis · `env` est l'environnement VÉRIFIÉ ; la base écrite est le client
 * `@tiktrends/db` du processus (construit sur ce même `DATABASE_URL` par la
 * commande, une base pglite dans les tests).
 */
export async function semerRecette(env: Env, o: { maintenant?: Date } = {}): Promise<ResultatSemis> {
  const cible = verifierCibleRecette(env);
  if (!cible.ok) return cible;
  const { environnementPrompts } = await import('../../lib/studios/prompts/environnement');
  const environnement = environnementPrompts(env);
  if (environnement !== 'test') return { ok: false, raisons: ['Registre de prompts hors recette locale (STUDIOS_PROMPTS_RECETTE_LOCALE=1 et base locale requis).'] };

  const { eq } = await import('drizzle-orm');
  const { db, schema } = await import('@tiktrends/db');
  if (!db) return { ok: false, raisons: ['Base indisponible (DATABASE_URL).'] };
  const {
    composerBrief, referenceProduit, referenceSource, annonceObservee, empreinteContenu, contenuVide, SCHEMA_VERSION_CONTENU,
  } = await import('@tiktrends/core');
  const maintenant = o.maintenant ?? new Date();

  const [existant] = await db.select({ id: schema.workspaces.id }).from(schema.workspaces).where(eq(schema.workspaces.id, RECETTE.workspaceId)).limit(1);
  if (!existant) {
    const { genererJeu } = await import('../../lib/studios/benchmark/jeu-synthetique');
    const { contexteDepuisSession } = await import('../../lib/studios/garde');
    const { chargerCatalogueProjet } = await import('../../lib/studios/produit/catalogue');
    const { epinglerProduitPour } = await import('../../lib/studios/produit/commandes');
    const jeu = await genererJeu();
    const photos = ['f01-lunettes-bleues', 'f01-bandeau-bleu'].map((id) => dataUri(jeu.get(id)!.octets));

    await db.insert(schema.workspaces).values({ id: RECETTE.workspaceId, name: 'Recette Studios (synthétique)', plan: 'business', creditsBalance: 200 });
    await db.insert(schema.users).values({ id: RECETTE.userId, email: RECETTE.email, name: 'Recette' });
    await db.insert(schema.workspaceMembers).values({ workspaceId: RECETTE.workspaceId, userId: RECETTE.userId, role: 'owner' });
    await db.insert(schema.brands).values({ id: RECETTE.brandId, workspaceId: RECETTE.workspaceId, name: 'Marque synthétique de recette' });
    const [p] = await db.insert(schema.products).values({
      id: RECETTE.productId, brandId: RECETTE.brandId, name: 'Lunettes synthétiques de recette',
      description: 'Lunettes bleues à verres ovales et bandeau bleu assorti · produit dessiné par code pour la recette',
      usp: 'Restent en place pendant l’effort', price: 49, url: null, imageUrl: photos[0]!, imageUrls: photos,
    }).returning();

    const annonce = annonceObservee({ id: 'recette-1', platform: 'meta', daysRunning: 30, mediaType: 'image', thumbnailUrl: null, advertiserName: 'Annonceur synthétique', body: 'Courir sans rien réajuster.', callToAction: 'Acheter', landingDomain: 'recette.invalid' })!;
    const source = referenceSource({ type: 'veille_ad', annonce, savedAdId: null, portee: { workspaceId: RECETTE.workspaceId, brandId: RECETTE.brandId }, observeLe: maintenant, format: null, retourVeille: null });
    const produit = referenceProduit({ id: p!.id, name: p!.name, description: p!.description, usp: p!.usp, price: p!.price, url: p!.url, imageUrl: p!.imageUrl, imageUrls: p!.imageUrls }, maintenant);
    const hypothese = {
      id: 'hyp_recette', statement: 'Une scène de course en extérieur met mieux en valeur le maintien des lunettes qu’un fond studio.', sourceIds: [source.sourceId],
      variable: 'Décor', control: 'Fond studio uni', treatment: 'Sentier de course au matin', invariants: ['Même produit', 'Même cadrage'],
      metric: 'Taux de clic (CTR)', decisionRule: 'Garder si +15 % de CTR après 3 000 impressions', limitations: ['Recette synthétique · aucune diffusion'],
    };
    const brief = composerBrief({ sources: [source], hypothese, produit, audience: 'Coureurs de 25 à 40 ans, sorties matinales' });
    const contenu: ContenuVersion = { ...contenuVide(), brief: brief as unknown as Record<string, unknown>, productRef: produit as unknown as ContenuVersion['productRef'] };
    await db.insert(schema.studioProjects).values({ id: RECETTE.projectId, workspaceId: RECETTE.workspaceId, brandId: RECETTE.brandId, kind: 'ads', title: 'Recette · premier rendu image', ownerId: RECETTE.userId, sourceRefs: [source] });
    const [v] = await db.insert(schema.studioProjectVersions).values({
      projectId: RECETTE.projectId, workspaceId: RECETTE.workspaceId, brandId: RECETTE.brandId, parentId: null, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU,
      content: contenu, contentHash: empreinteContenu(contenu), authorId: RECETTE.userId, reason: 'Semis de recette synthétique',
    }).returning();
    await db.update(schema.studioProjects).set({ currentVersionId: v!.id, rowVersion: 1 }).where(eq(schema.studioProjects.id, RECETTE.projectId));

    const ctx = contexteDepuisSession({ user: { id: RECETTE.userId, email: RECETTE.email, name: 'Recette' }, workspaceId: RECETTE.workspaceId, role: 'owner', plan: 'business', equipe: null }, [RECETTE.brandId], [], `st_recette_${randomUUID()}`);
    const O = { veilleOuverte: true, maintenant };
    const c = await chargerCatalogueProjet(ctx, RECETTE.projectId, O);
    if (!c.ok) throw new Error(`catalogue · ${c.code}`);
    const ph = c.catalogue.produits.find((x) => x.produit.id === RECETTE.productId)?.photos ?? [];
    if (!ph[0]) throw new Error('catalogue · aucune photo du produit synthétique');
    const r = await epinglerProduitPour(ctx, { projectId: RECETTE.projectId, baseVersionId: v!.id, productId: RECETTE.productId, photoId: ph[0].assetId, composants: ['lunettes', 'bandeau'] }, O);
    if (!r.ok) throw new Error(`épinglage · ${JSON.stringify(r)}`);
  }

  const { preparerReleaseLocale } = await import('../../lib/studios/benchmark/programme');
  const release = await preparerReleaseLocale(environnement);
  return { ok: true, deja: !!existant, releaseId: release.id, projectId: RECETTE.projectId, productId: RECETTE.productId };
}

/* -------------------------------------------------------------------------- */

async function main(): Promise<number> {
  // Garde AVANT toute importation de la base : rien ne se connecte à une base refusée.
  const cible = verifierCibleRecette(process.env);
  if (!cible.ok) { console.error(`✗ Semis REFUSÉ · rien n’a été écrit\n${cible.raisons.map((r) => `  - ${r}`).join('\n')}`); return 2; }
  const r = await semerRecette(process.env);
  if (!r.ok) { console.error(`✗ Semis REFUSÉ · rien n’a été écrit\n${r.raisons.map((x) => `  - ${x}`).join('\n')}`); return 2; }
  console.log(`✓ Semis ${r.deja ? 'déjà présent (rien de dupliqué)' : 'écrit'} · projet ${r.projectId} · produit ${r.productId} · release de recette ${r.releaseId}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (e) => { console.error('✗', (e as Error).message); process.exit(1); });
}
