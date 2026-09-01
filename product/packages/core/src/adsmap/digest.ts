/**
 * Ce que la semaine a appris.
 *
 * ── Le manque ────────────────────────────────────────────────────────────────
 *
 * Le radar tourne la nuit, les verdicts tombent, la mémoire s'allume, les scènes
 * se classent · et rien ne revient vers personne. Tout attend qu'on pense à
 * ouvrir le bon écran. Un outil qui ne rappelle jamais rien devient un outil
 * qu'on ouvrait, au passé.
 *
 * ── Pourquoi c'est CALCULÉ, jamais rédigé ────────────────────────────────────
 *
 * Un modèle écrirait un résumé plus joli et parfois faux. Ici chaque phrase
 * découle d'un compte · c'est la même règle que pour les justifications de
 * Jarvis (D72) : calculée depuis les chiffres, une phrase est un fait ; écrite
 * par un modèle, c'est une affirmation.
 *
 * Conséquence heureuse : le digest ne coûte rien. Une lettre hebdomadaire qui
 * dépense à chaque envoi finirait par être coupée pour la mauvaise raison.
 *
 * ── La règle qui décide s'il part ────────────────────────────────────────────
 *
 * **On n'envoie pas une lettre pour dire qu'il n'y a rien.** Trois semaines de
 * « rien de neuf » et plus personne ne l'ouvre · le jour où elle porte quelque
 * chose, elle est déjà morte.
 *
 * Mais « rien appris » et « rien à faire » sont deux choses différentes : une
 * marque avec quarante créas et zéro verdict n'a rien appris ET a tout à faire.
 * Ce cas-là part.
 *
 * ── Ce qu'il ne dit PAS, et pourquoi ─────────────────────────────────────────
 *
 * « Ta mémoire vient de trancher sur l'UGC » serait la plus belle ligne de la
 * lettre. Elle demande de comparer l'état d'aujourd'hui à celui d'il y a une
 * semaine, et nous ne gardons aucun historique des seuils franchis.
 *
 * On ne l'écrit donc pas. Un champ qu'on remplirait toujours à vide laisserait
 * deux branches mortes dans ce fichier, et la tentation de les remplir
 * approximativement · une lettre qui annonce un apprentissage qui n'a pas eu
 * lieu vaut moins que pas de lettre du tout.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

export interface DigestFacts {
  brandName: string;
  /** Verdicts arbitrés pendant la fenêtre. */
  verdictsWeek: number;
  /** Parmi eux, ceux qui ont gagné. */
  winnersWeek: number;
  /** Créas produites pendant la fenêtre, tous studios confondus. */
  createdWeek: number;
  /** Créas en attente d'un verdict, au total · c'est le stock, pas le flux. */
  pending: number;
  /** Trouvailles du radar pendant la fenêtre. */
  radarFindings: number;
  /** Parmi elles, celles qui touchent une voie jamais testée. */
  radarUnexplored: number;
  /** Suites conseillées, prêtes à lancer. */
  iterationsReady: number;
}

export type DigestActionKey = 'lots' | 'suites' | 'radar' | 'studio';

export interface DigestAction {
  key: DigestActionKey;
  label: string;
  href: string;
  /** Pourquoi c'est CE geste-là · une phrase, tirée des chiffres. */
  why: string;
}

export interface Digest {
  /** La phrase qu'on lit en premier · elle porte le fait le plus lourd. */
  headline: string;
  /** Ce que la semaine a produit et tranché · deux à quatre lignes, jamais plus. */
  lines: string[];
  /** Le seul geste conseillé · jamais une liste. */
  action: DigestAction | null;
}

/** Au-delà, on a remplacé une lettre par un tableau de bord. */
export const MAX_LINES = 4;

/**
 * Faut-il envoyer ?
 *
 * Une semaine sans le moindre mouvement ne mérite pas de lettre. Une semaine
 * sans apprentissage MAIS avec un stock à trancher en mérite une · c'est
 * précisément le silence qu'il faut casser.
 */
export function worthSending(f: DigestFacts): boolean {
  if (f.verdictsWeek > 0) return true;
  if (f.radarFindings > 0) return true;
  // Rien appris, mais un stock qui dort · c'est la lettre la plus utile.
  if (f.pending >= 3) return true;
  return false;
}

/* -------------------------------------------------------------------------- */

/**
 * Le geste conseillé.
 *
 * L'ordre n'est pas un goût, c'est la boucle du produit : on ne fabrique pas
 * avant d'avoir tranché, et on ne tranche pas ce qui n'existe pas.
 */
function chooseAction(f: DigestFacts): DigestAction | null {
  // Trancher d'abord · un stock non jugé rend tout le reste aveugle.
  if (f.pending >= 3) {
    return {
      key: 'lots', label: 'Faire trancher les créas en attente', href: '/adsmap/lots',
      why: `${f.pending} créa(s) attendent un verdict · tant qu'elles ne sont pas jugées, la suivante sera aussi aveugle que la première.`,
    };
  }

  // Itérer ensuite · c'est là que le gagnant se transforme en série.
  if (f.iterationsReady > 0) {
    return {
      key: 'suites', label: 'Lancer la suite conseillée', href: '/adsmap/suites',
      why: `${f.iterationsReady} suite(s) conseillée(s) · en ne changeant qu'une variable, le résultat reste attribuable.`,
    };
  }

  // Une voie jamais testée chez un concurrent qui la paie · ça vaut le détour.
  if (f.radarUnexplored > 0) {
    return {
      key: 'radar', label: 'Regarder ce que le radar a trouvé', href: '/adsmap/radar',
      why: `${f.radarUnexplored} piste(s) que tu n'as jamais testée(s) tiennent chez tes concurrents.`,
    };
  }

  // Rien produit et rien en attente · il faut bien commencer par fabriquer.
  if (f.createdWeek === 0 && f.pending === 0) {
    return {
      key: 'studio', label: 'Fabriquer une série', href: '/studio/ads',
      why: 'Rien n’a été produit cette semaine · il n’y a rien à faire trancher.',
    };
  }

  return null;
}

/**
 * L'accroche · le fait le plus lourd de la semaine.
 *
 * Un gagnant passe devant tout : c'est la seule information qui change ce qu'on
 * fera lundi. Vient ensuite ce que la mémoire a appris, puis le marché · qui
 * informe sans jamais trancher.
 */
function headline(f: DigestFacts): string {
  if (f.winnersWeek > 0) {
    return `${f.winnersWeek} gagnante(s) cette semaine sur ${f.verdictsWeek} test(s) tranché(s) chez ${f.brandName}.`;
  }
  if (f.verdictsWeek > 0) {
    return `${f.verdictsWeek} test(s) tranché(s) chez ${f.brandName}, aucun gagnant · c'est une information, pas un échec.`;
  }
  if (f.radarUnexplored > 0) {
    return `${f.radarUnexplored} piste(s) jamais testée(s) tiennent chez les concurrents de ${f.brandName}.`;
  }
  if (f.radarFindings > 0) {
    return `${f.radarFindings} créa(s) concurrente(s) ont franchi un cap · elles confirment ce que tu fais déjà.`;
  }
  return `Rien n'a été tranché chez ${f.brandName} cette semaine.`;
}

/**
 * Compose la lettre.
 *
 * Chaque ligne vient d'un compte. Aucune n'est écrite quand son compte est nul ·
 * « 0 vidéo générée » occupe une ligne pour ne rien dire, et trois lignes de ce
 * genre suffisent à faire refermer la lettre.
 */
export function buildDigest(f: DigestFacts): Digest {
  const lines: string[] = [];

  if (f.createdWeek > 0) {
    lines.push(`${f.createdWeek} créa(s) produite(s).`);
  }
  if (f.verdictsWeek > 0) {
    const taux = Math.round((f.winnersWeek / f.verdictsWeek) * 100);
    lines.push(`${f.verdictsWeek} verdict(s) arbitré(s) · ${f.winnersWeek} gagnante(s), soit ${taux} %.`);
  }
  if (f.pending > 0) {
    lines.push(`${f.pending} créa(s) attendent encore un verdict.`);
  }
  if (f.radarFindings > 0) {
    lines.push(
      f.radarUnexplored > 0
        ? `Radar · ${f.radarFindings} trouvaille(s), dont ${f.radarUnexplored} sur une voie jamais testée.`
        : `Radar · ${f.radarFindings} trouvaille(s), toutes sur des voies déjà connues.`,
    );
  }

  return {
    headline: headline(f),
    lines: lines.slice(0, MAX_LINES),
    action: chooseAction(f),
  };
}

/** Rendu texte · sert le courriel comme la notification, pour ne pas diverger. */
export function digestText(d: Digest): string {
  const bloc = [d.headline, ...d.lines];
  if (d.action) bloc.push(`→ ${d.action.label} · ${d.action.why}`);
  return bloc.join('\n');
}
