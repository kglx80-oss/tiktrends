/**
 * La veille qui vient à toi.
 *
 * ── Ce que la veille faisait, et pourquoi ça ne suffisait pas ────────────────
 *
 * Le suivi de marques existait : chaque nuit, on rescanne les concurrents et on
 * signale les pubs jamais vues. « 4 nouvelles pubs chez tes concurrents. »
 *
 * Or **la naissance d'une pub ne dit rien**. La plupart meurent en une semaine.
 * Un annonceur qui lance dix créas n'a rien prouvé · il a dépensé. Signaler des
 * naissances, c'est produire une alerte quotidienne dont le taux d'information
 * est proche de zéro, et une alerte qu'on n'ouvre plus est pire qu'une absence
 * d'alerte : elle occupe la place.
 *
 * Le signal qui compte est la **survie**. Une pub encore diffusée après trois
 * semaines est une pub que son annonceur continue de payer, semaine après
 * semaine, en connaissant ses chiffres. C'est le seul vote crédible qu'on puisse
 * observer de l'extérieur.
 *
 * Ce fichier déplace donc l'alerte de la naissance vers le **franchissement** :
 * le jour où une créa passe le cap, on le dit une fois, et une seule.
 *
 * ── La règle qui gouverne la dépense ─────────────────────────────────────────
 *
 * Détecter est GRATUIT : `daysRunning` vient de l'API, franchir un seuil est de
 * l'arithmétique. Décrire coûte un appel modèle. Une veille nocturne qui décrit
 * tout ce qui bouge produit une facture proportionnelle au bruit du marché,
 * c'est-à-dire non bornée.
 *
 * On sélectionne donc AVANT de dépenser, sur des signaux gratuits, et on borne
 * en dur. Ce fichier ne fait aucun appel · il dit seulement ce qui mérite qu'on
 * en fasse un, et combien ça coûtera.
 *
 * Pur : ni base, ni horloge, ni réseau.
 */

// Le seuil de survie vient de `market-stats` · une seule définition fait foi,
// sinon le radar et les statistiques de marché finiraient par ne plus parler du
// même « éprouvé ».
import { PROVEN_DAYS } from './market-stats';

/**
 * Coût estimé d'une description de créa · `claude-sonnet-5`, vignette + copy.
 *
 * ~3 800 tokens en entrée (consigne, schéma d'outil, image, texte) et ~450 en
 * sortie, aux tarifs 3 $ / 15 $ par million. Volontairement arrondi vers le
 * HAUT : une estimation optimiste d'un coût est une estimation fausse dans le
 * seul sens qui fasse mal.
 */
export const COST_PER_ANALYSIS_USD = 0.02;

export type RadarSignal = 'crossed_proven' | 'reach_growing' | 'advertiser_scaling';

export const SIGNAL_LABEL: Record<RadarSignal, string> = {
  crossed_proven: 'tient depuis trois semaines',
  reach_growing: 'gagne encore en portée',
  advertiser_scaling: 'l’annonceur multiplie les diffusions',
};

export interface RadarCandidate {
  externalId: string;
  advertiser: string | null;
  daysRunning: number;
  reachDelta30d?: number | null;
  liveAdsCount?: number | null;
  format?: string | null;
  /** Sans visuel NI texte, aucune description n'est possible · on ne paie pas pour deviner. */
  hasImage: boolean;
  hasText: boolean;
}

export interface RadarKnowledge {
  /** Créas déjà décrites · on ne repaie jamais la même. */
  analyzedIds: ReadonlySet<string>;
  /** Combien de créas on a déjà décrites par annonceur. */
  perAdvertiser: ReadonlyMap<string, number>;
}

export interface RadarPick {
  candidate: RadarCandidate;
  signal: RadarSignal;
  /** Ce qui justifie la dépense, en une phrase affichable. */
  reason: string;
  priority: number;
}

export interface RadarSelection {
  picked: RadarPick[];
  /** Retenus par le signal mais écartés par le plafond · reviendront demain. */
  deferred: number;
  /** Coût estimé de ce qui est retenu, en dollars. */
  estimatedUsd: number;
  /** Ce qu'on a vu sans rien dépenser · sert à expliquer un plan vide. */
  seen: number;
}

/**
 * Au-delà, on étudie une marque, pas un marché.
 *
 * Trois créas d'un même annonceur suffisent à connaître sa manière. La
 * quatrième coûte le même prix et n'apprend presque rien · le budget est mieux
 * placé sur un annonceur qu'on ne connaît pas encore.
 */
export const MAX_PER_ADVERTISER = 3;

/* -------------------------------------------------------------------------- */
/*  Détection · gratuite                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Ce qu'une créa a prouvé, s'il y a quelque chose.
 *
 * L'ordre des tests n'est pas indifférent : la survie l'emporte sur la
 * croissance, qui l'emporte sur le volume. Un annonceur peut multiplier les
 * diffusions par optimisme · il ne les maintient pas trois semaines par
 * optimisme.
 */
export function survivalSignal(c: RadarCandidate): RadarSignal | null {
  if (c.daysRunning >= PROVEN_DAYS) return 'crossed_proven';
  // Une portée qui monte encore après une semaine est un budget qu'on augmente.
  if (c.daysRunning >= 7 && (c.reachDelta30d ?? 0) > 0) return 'reach_growing';
  // Beaucoup d'annonces vivantes ne prouve rien sur CELLE-CI, seulement que
  // l'annonceur est en phase active · c'est le signal le plus faible des trois.
  if (c.daysRunning >= 7 && (c.liveAdsCount ?? 0) >= 10) return 'advertiser_scaling';
  return null;
}

const RANG: Record<RadarSignal, number> = {
  crossed_proven: 0, reach_growing: 1, advertiser_scaling: 2,
};

function raison(c: RadarCandidate, s: RadarSignal): string {
  const qui = c.advertiser ?? 'un concurrent';
  if (s === 'crossed_proven') {
    return `${qui} paie cette créa depuis ${c.daysRunning} jours · à ce stade, ce n'est plus un essai.`;
  }
  if (s === 'reach_growing') {
    return `${qui} augmente la portée de cette créa après ${c.daysRunning} jours · le budget monte, pas l'inverse.`;
  }
  return `${qui} diffuse ${c.liveAdsCount} annonces en parallèle · phase active, à regarder de près.`;
}

/* -------------------------------------------------------------------------- */
/*  Sélection · c'est ici qu'on décide de dépenser                            */
/* -------------------------------------------------------------------------- */

/**
 * Ce qui mérite un appel modèle cette nuit, et rien de plus.
 *
 * `cap` est un plafond DUR, exprimé en nombre de créas. Il n'est pas une
 * préférence de qualité · c'est ce qui rend la facture prévisible quel que soit
 * le bruit du marché. Le reste attend demain, et le dire évite de croire qu'on
 * a tout vu.
 */
export function selectForAnalysis(
  candidates: RadarCandidate[],
  known: RadarKnowledge,
  cap: number,
): RadarSelection {
  const retenus: RadarPick[] = [];

  for (const c of candidates) {
    if (known.analyzedIds.has(c.externalId)) continue;   // jamais deux fois
    if (!c.hasImage && !c.hasText) continue;             // rien à décrire
    const s = survivalSignal(c);
    if (!s) continue;
    retenus.push({ candidate: c, signal: s, reason: raison(c, s), priority: RANG[s] });
  }

  // Le plus fort signal d'abord · à signal égal, la créa la plus ancienne, parce
  // qu'elle a survécu plus longtemps au même test.
  retenus.sort((a, b) => a.priority - b.priority || b.candidate.daysRunning - a.candidate.daysRunning);

  // Largeur avant profondeur · le quota par annonceur se consomme au fil du tri,
  // ce qui laisse mécaniquement de la place aux annonceurs inconnus.
  const compte = new Map<string, number>(known.perAdvertiser);
  const picked: RadarPick[] = [];
  let differes = 0;

  for (const p of retenus) {
    const a = p.candidate.advertiser ?? '(inconnu)';
    const deja = compte.get(a) ?? 0;
    if (deja >= MAX_PER_ADVERTISER) { differes++; continue; }
    if (picked.length >= cap) { differes++; continue; }
    picked.push(p);
    compte.set(a, deja + 1);
  }

  return {
    picked, deferred: differes,
    estimatedUsd: estimateCost(picked.length),
    seen: candidates.length,
  };
}

/** Ce que coûtera une sélection · arrondi au centime supérieur. */
export function estimateCost(n: number): number {
  return Math.ceil(n * COST_PER_ANALYSIS_USD * 100) / 100;
}

/* -------------------------------------------------------------------------- */
/*  Restitution                                                               */
/* -------------------------------------------------------------------------- */

export interface RadarFinding {
  externalId: string;
  advertiser: string | null;
  signal: RadarSignal;
  daysRunning: number;
  /** Ce que la description a révélé · vide si la description a échoué. */
  traits: string[];
  /** Vrai quand la marque n'a jamais testé cette voie · c'est là qu'est la valeur. */
  unexplored: boolean;
  headline: string;
}

/**
 * La phrase qu'on pose sur le bureau le matin.
 *
 * Une trouvaille qui touche une voie jamais testée passe devant tout · c'est la
 * seule qui ouvre quelque chose. Les autres confirment, et une confirmation ne
 * fait pas se lever de sa chaise.
 */
export function radarDigest(findings: RadarFinding[], deferred = 0): string {
  if (!findings.length) {
    return deferred > 0
      ? `Rien de neuf cette nuit · ${deferred} créa(s) mise(s) de côté pour demain, le plafond était atteint.`
      : 'Rien de neuf cette nuit · aucune créa concurrente n\'a franchi de cap.';
  }

  const neuves = findings.filter((f) => f.unexplored);
  const n = findings.length;
  const tete = neuves[0] ?? findings[0]!;

  const socle = neuves.length
    ? `${neuves.length} piste(s) que tu n'as jamais testée(s) tiennent chez tes concurrents.`
    : `${n} créa(s) concurrente(s) ont franchi un cap · elles confirment ce que tu fais déjà.`;

  const reste = deferred > 0 ? ` ${deferred} autre(s) attendent demain.` : '';
  return `${socle} ${tete.headline}${reste}`;
}

/** Titre d'une trouvaille · dit le fait, pas l'étiquette. */
export function findingHeadline(f: Omit<RadarFinding, 'headline'>): string {
  const qui = f.advertiser ?? 'Un concurrent';
  const traits = f.traits.length ? f.traits.slice(0, 2).join(', ') : null;
  if (!traits) {
    return `${qui} · une créa ${SIGNAL_LABEL[f.signal]} (${f.daysRunning} j), sans description exploitable.`;
  }
  return f.unexplored
    ? `${qui} · ${traits} ${SIGNAL_LABEL[f.signal]} (${f.daysRunning} j), et tu ne l'as jamais testé.`
    : `${qui} · ${traits} ${SIGNAL_LABEL[f.signal]} (${f.daysRunning} j).`;
}
