import 'server-only';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { jarvisStats, jarvisHooks } from './jarvis-memory';

/**
 * Ce que Jarvis applique VRAIMENT, pour cette marque, en ce moment.
 *
 * ── Le problème que ça règle ─────────────────────────────────────────────────
 *
 * L'écran Jarvis affichait six cartes en dur : « Ancrage marque », « Intelligence
 * concurrentielle », « Copywriting direct-response »… Le même texte pour tout le
 * monde, quel que soit l'état réel du compte. Une marque sans logo ni produit
 * lisait « DA, produit réel et USP injectés dans chaque prompt » · c'était faux,
 * et c'était affirmé.
 *
 * Une carte qui décrit une capacité est une **promesse**. Une carte qui dit
 * qu'elle est éteinte et pourquoi est un **diagnostic**. La différence entre une
 * brochure et un tableau de bord tient là, et pas ailleurs.
 *
 * ── Ce que chaque couche répond ──────────────────────────────────────────────
 *
 * Trois choses, jamais moins : est-ce que ça tourne, sur quel volume, et si non
 * quel est le geste exact qui l'allume. Sans le troisième, un état « éteint »
 * n'est qu'un reproche.
 *
 * ── Ce qu'on ne maquille pas ─────────────────────────────────────────────────
 *
 * Certaines couches sont toujours actives · elles font partie du prompt de base
 * et ne dépendent d'aucune donnée. On le dit comme ça, plutôt que de leur
 * inventer un compteur flatteur. Un tableau de bord où tout est vert n'est plus
 * lu.
 */

export type LayerState = 'on' | 'partial' | 'off' | 'always';

export interface JarvisLayer {
  key: string;
  icon: string;
  title: string;
  /** Ce que la couche fait · au présent, sans conditionnel. */
  what: string;
  state: LayerState;
  /** Le chiffre qui prouve l'état · vide quand la couche ne dépend d'aucune donnée. */
  detail: string;
  /** Le geste qui l'allume · seulement quand elle ne l'est pas. */
  fix?: { label: string; href: string };
}

export interface JarvisSnapshot {
  layers: JarvisLayer[];
  /** Couches réellement alimentées par des données de la marque. */
  liveCount: number;
  /** Couches qui dépendent de données · dénominateur honnête du compteur. */
  dataCount: number;
  summary: string;
}

/* -------------------------------------------------------------------------- */

const vide = (s: string): boolean => !s || !s.trim();

/**
 * Photographie l'état des couches.
 *
 * Une seule passe, requêtes en parallèle · l'écran d'accueil de Jarvis ne doit
 * pas coûter une seconde à s'afficher sous prétexte qu'il est complet.
 */
export async function jarvisSnapshot(brandId: string, workspaceId: string): Promise<JarvisSnapshot> {
  const layers: JarvisLayer[] = [];

  if (!db) {
    return { layers, liveCount: 0, dataCount: 0, summary: 'État indisponible.' };
  }

  const [brand] = await db.select({
    logoUrl: schema.brands.logoUrl, logos: schema.brands.logos,
    palette: schema.brands.palette, colors: schema.brands.colors, fonts: schema.brands.fonts,
    description: schema.brands.description, usp: schema.brands.usp,
    creativeRules: schema.brands.creativeRules,
    jarvisLearnings: schema.brands.jarvisLearnings,
    radarArmed: schema.brands.radarArmed,
  }).from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);

  const [produits, concurrents, marche, decrites, stats, hooks] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(schema.products).where(eq(schema.products.brandId, brandId)),
    db.select({ n: sql<number>`count(*)` }).from(schema.followedBrands).where(eq(schema.followedBrands.workspaceId, workspaceId)),
    db.select({ n: sql<number>`count(*)` }).from(schema.marketCreatives)
      .where(and(eq(schema.marketCreatives.workspaceId, workspaceId), isNotNull(schema.marketCreatives.analyzedAt))),
    // `creatives` est rattachée à la MARQUE, pas à l'espace · une créa décrite
    // pour une autre marque du compte n'apprend rien sur celle-ci.
    db.select({ n: sql<number>`count(*)` }).from(schema.creatives)
      .where(and(eq(schema.creatives.brandId, brandId), isNotNull(schema.creatives.analysis))),
    jarvisStats(brandId, workspaceId),
    jarvisHooks(brandId, workspaceId),
  ]);

  const nProduits = Number(produits[0]?.n ?? 0);
  const nConcurrents = Number(concurrents[0]?.n ?? 0);
  const nMarche = Number(marche[0]?.n ?? 0);
  const nDecrites = Number(decrites[0]?.n ?? 0);
  const nSignaux = stats.stats.filter((r) => r.nConclusive >= 3 && r.hitRate !== null).length;
  const nHooks = hooks.filter((h) => h.evidence === 'proven' || h.evidence === 'refuted').length;

  /* --- Ce qui vient de la marque -------------------------------------------- */

  const identite = [brand?.logoUrl, brand?.description, brand?.usp].filter((x) => !vide(String(x ?? ''))).length
    + ((brand?.colors?.length || brand?.palette) ? 1 : 0);
  layers.push({
    key: 'brand', icon: '🎯', title: 'Ancrage marque',
    what: 'Direction artistique, produit réel et promesse injectés dans chaque prompt.',
    state: identite >= 3 && nProduits > 0 ? 'on' : identite > 0 ? 'partial' : 'off',
    detail: nProduits > 0
      ? `${identite}/4 éléments d’identité · ${nProduits} produit(s)`
      : `${identite}/4 éléments d’identité · aucun produit`,
    ...(identite >= 3 && nProduits > 0 ? {} : { fix: { label: 'Compléter la marque', href: `/brands/${brandId}` } }),
  });

  layers.push({
    key: 'rules', icon: '📜', title: 'Tes règles',
    what: 'Tes consignes maison, imposées avant tout le reste.',
    state: vide(brand?.creativeRules ?? '') ? 'off' : 'on',
    detail: vide(brand?.creativeRules ?? '')
      ? 'Aucune règle écrite'
      : `${(brand!.creativeRules ?? '').trim().split(/\n+/).length} ligne(s) de consignes`,
    ...(vide(brand?.creativeRules ?? '') ? { fix: { label: 'Écrire tes règles', href: '/jarvis#regles' } } : {}),
  });

  /* --- Ce que la mesure a produit ------------------------------------------- */

  layers.push({
    key: 'measured', icon: '📊', title: 'Mémoire mesurée',
    what: 'Ce qui a gagné chez toi, avec ses chiffres · prime sur tout le reste.',
    state: nSignaux >= 3 ? 'on' : nSignaux > 0 ? 'partial' : 'off',
    detail: nSignaux > 0
      ? `${nSignaux} signal(aux) exploitable(s) sur ${stats.nAds} ad(s) suivie(s)`
      : stats.nAds > 0
        ? `${stats.nAds} ad(s) suivies, aucun verdict sur 3 tests d’un même type`
        : 'Aucune ad mesurée',
    ...(nSignaux >= 3 ? {} : { fix: { label: 'Ouvrir ADSMAP', href: '/adsmap' } }),
  });

  layers.push({
    key: 'hooks', icon: '✍️', title: 'Bibliothèque d’accroches',
    what: 'Les phrases exactes qui ont gagné ou perdu · pas des catégories, des mots.',
    state: nHooks >= 3 ? 'on' : nHooks > 0 ? 'partial' : 'off',
    detail: nHooks > 0
      ? `${nHooks} accroche(s) tranchée(s) sur ${hooks.length} connue(s)`
      : hooks.length > 0
        ? `${hooks.length} accroche(s) connue(s), aucune encore tranchée`
        : 'Aucune accroche extraite',
    ...(nHooks >= 3 ? {} : { fix: { label: 'Décrire les créas', href: '/jarvis#decrire' } }),
  });

  /* --- Ce qui vient du dehors ----------------------------------------------- */

  layers.push({
    key: 'market', icon: '🔎', title: 'Intelligence concurrentielle',
    what: 'La mécanique des créas concurrentes qui tiennent · jamais leurs mots.',
    state: nMarche >= 6 ? 'on' : nMarche > 0 ? 'partial' : 'off',
    detail: nMarche > 0
      ? `${nMarche} créa(s) concurrente(s) décrite(s) · ${nConcurrents} marque(s) suivie(s)`
      : nConcurrents > 0
        ? `${nConcurrents} marque(s) suivie(s), aucune créa décrite`
        : 'Aucun concurrent suivi',
    ...(nMarche >= 6 ? {} : {
      fix: nConcurrents > 0
        ? { label: 'Apprendre du marché', href: '/jarvis#marche' }
        : { label: 'Suivre des concurrents', href: '/inspo' },
    }),
  });

  layers.push({
    key: 'radar', icon: '🛰️', title: 'Radar de veille',
    what: 'Chaque nuit, ce que tes concurrents continuent de payer.',
    state: brand?.radarArmed ? 'on' : 'off',
    detail: brand?.radarArmed
      ? 'Armé · passage nocturne actif'
      : 'Éteint · aucune dépense en arrière-plan',
    ...(brand?.radarArmed ? {} : { fix: { label: 'Voir le radar', href: '/adsmap/radar' } }),
  });

  layers.push({
    key: 'described', icon: '🧩', title: 'Description de tes créas',
    what: 'Chaque asset décrit dans la même taxonomie que le marché · c’est ce qui rend les deux comparables.',
    state: nDecrites >= 6 ? 'on' : nDecrites > 0 ? 'partial' : 'off',
    detail: nDecrites > 0 ? `${nDecrites} créa(s) décrite(s)` : 'Aucune créa décrite',
    ...(nDecrites >= 6 ? {} : { fix: { label: 'Décrire les créas', href: '/jarvis#decrire' } }),
  });

  layers.push({
    key: 'training', icon: '🎓', title: 'Entraînement sur la veille',
    what: 'Les schémas gagnants distillés à partir des pubs que tu as sauvegardées.',
    state: vide(brand?.jarvisLearnings ?? '') ? 'off' : 'on',
    detail: vide(brand?.jarvisLearnings ?? '') ? 'Jamais entraîné' : 'Schémas distillés',
    ...(vide(brand?.jarvisLearnings ?? '') ? { fix: { label: 'Entraîner Jarvis', href: '/jarvis#entrainement' } } : {}),
  });

  /* --- Ce qui ne dépend d'aucune donnée ------------------------------------- */

  // On ne leur invente pas de compteur · elles font partie du prompt de base et
  // seraient vertes sur un compte vide. Un tableau où tout est vert n'est plus lu.
  layers.push({
    key: 'copy', icon: '⚡', title: 'Copywriting direct-response',
    what: 'Spécificité, déclencheurs, anti-slogans plats.',
    state: 'always', detail: 'Toujours actif · fait partie du prompt de base',
  });
  layers.push({
    key: 'render', icon: '📐', title: 'Contraintes de rendu',
    what: 'Réalisme, proportions, packaging fidèle, aucun texte parasite.',
    state: 'always', detail: 'Toujours actif · fait partie du prompt de base',
  });

  const dependantes = layers.filter((l) => l.state !== 'always');
  const allumees = dependantes.filter((l) => l.state === 'on').length;

  return {
    layers,
    liveCount: allumees,
    dataCount: dependantes.length,
    summary: resume(allumees, dependantes.length, dependantes),
  };
}

function resume(on: number, total: number, deps: JarvisLayer[]): string {
  if (on === total) {
    return `Les ${total} couches alimentées par tes données tournent · Jarvis travaille avec tout ce qu’il a.`;
  }
  if (on === 0) {
    return `Aucune des ${total} couches nourries par tes données n’est active · Jarvis génère aujourd’hui sur ses règles générales, comme n’importe quel modèle.`;
  }
  // On nomme la plus rentable à allumer, pas la première venue : la mémoire
  // mesurée prime, puis les accroches, puis le marché.
  const ordre = ['measured', 'hooks', 'market', 'brand', 'described', 'rules', 'radar', 'training'];
  const manque = ordre
    .map((k) => deps.find((l) => l.key === k))
    .find((l) => l && l.state !== 'on');
  return manque
    ? `${on} couche(s) sur ${total} alimentées par tes données · la prochaine à ouvrir est « ${manque.title} ».`
    : `${on} couche(s) sur ${total} alimentées par tes données.`;
}

export const STATE_LABEL: Record<LayerState, string> = {
  on: 'actif', partial: 'partiel', off: 'éteint', always: 'toujours actif',
};
