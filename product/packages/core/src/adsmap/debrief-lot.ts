/**
 * Ce que le lot entière vient de donner, dit d'un coup.
 *
 * ── La question qu'il débloque ───────────────────────────────────────────────
 *
 * Chaque publicité produite entière est relue à la génération · l'accroche
 * est-elle restée la nôtre, le packaging le bon. Ces constats vivent par pub,
 * sur la carte, et le cumul de tout l'historique vit dans Jarvis. Entre les
 * deux, rien ne dit ce que CE lot vaut, au moment où on le regarde.
 *
 * Or c'est exactement la lecture qui décide si le mode entière est viable :
 * « sur ces six pubs, combien tiennent nos mots, combien gardent le produit ».
 * La faire à l'œil, carte par carte, est le vrai coût d'activation du premier
 * lot de contrôle · ce module l'aggrège en une phrase.
 *
 * ── Pourquoi PAS d'intervalle ici, contrairement au cumul ────────────────────
 *
 * `bilanCopie` compare chaque groupe au taux général avec un intervalle de
 * Wilson · il conclut sur des MOTEURS, à partir de dizaines de relectures. Un
 * lot fait huit pubs au plus : aucun intervalle ne trancherait, et prétendre le
 * contraire serait mentir sur ce qu'on sait.
 *
 * Le débrief ne conclut pas, il COMPTE. « 5 conformes, 1 réécrite » est un fait
 * sur ce lot, pas un verdict sur un moteur. Les deux lectures ne se remplacent
 * pas · le cumul dit quel moteur choisir, le débrief dit si ce lot-ci est bon.
 *
 * ── Ce qui rend un lot « tout bon » ──────────────────────────────────────────
 *
 * Aucune accroche réécrite ET aucun produit modifié. Ce sont les deux seuls
 * écarts éliminatoires · un accent perdu se corrige, une photo produit absente
 * n'a pas pu être jugée, mais ni l'un ni l'autre ne rend la pub inutilisable.
 * Un lot sans photo de référence peut donc être « tout bon » côté copie : on
 * n'invente pas un défaut qu'on n'a pas pu regarder.
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

/** Une relecture du lot, réduite à ce qui décide du débrief. */
export interface RelecturePub {
  /** L'accroche a été réécrite ou est absente · le seul écart éliminatoire de copie. */
  accrocheReecrite: boolean;
  /** Un écart mineur constaté (accents, bouton) sans être éliminatoire. */
  copieMineure: boolean;
  /** Le packaging correspond à la référence · `null` quand il n'y en avait pas. */
  produitFidele: boolean | null;
  /** La typographie publicitaire est lisible · `null` quand il n'y a pas de texte. */
  texteLisible?: boolean | null;
}

export interface DebriefLot {
  /** Publicités relues du lot · seules les entières le sont. */
  n: number;
  accrocheConforme: number;
  accrocheMineure: number;
  accrocheReecrite: number;
  /** Publicités du lot qui avaient une photo de référence · le dénominateur du produit. */
  avecReference: number;
  produitFidele: number;
  produitInfidele: number;
  sansReference: number;
  /** Publicités dont la typographie publicitaire a été jugée illisible. */
  texteIllisible: number;
  /** Aucun écart éliminatoire · ni accroche réécrite, ni produit modifié, ni texte illisible. */
  toutBon: boolean;
  /** La phrase affichée · factuelle, sans intervalle, parce qu'un lot ne conclut pas. */
  resume: string;
}

/**
 * Le contrôle d'une créa tel que la grille le porte · l'entrée dont on
 * reconstruit un débrief au rechargement, sans re-relire quoi que ce soit.
 */
export interface ControleLu {
  copieResume: string;
  copieGrave: boolean;
  produitFidele: boolean | null;
  texteLisible?: boolean | null;
}

/**
 * Traduit un contrôle de carte en relecture de débrief.
 *
 * C'était une logique d'écran (inline dans le Studio) qui DÉCIDAIT du sens de la
 * mesure — « accroche réécrite = copie grave », « écart mineur = un résumé sans
 * gravité ». Une règle de mesure n'a rien à faire dans du JSX · on la rapatrie
 * ici, pure et testée, pour que l'écran et la reconstruction au chargement
 * comptent EXACTEMENT pareil.
 */
export function relectureDepuisControle(c: ControleLu): RelecturePub {
  return {
    accrocheReecrite: c.copieGrave,
    copieMineure: !c.copieGrave && c.copieResume.trim() !== '',
    produitFidele: c.produitFidele,
    texteLisible: c.texteLisible ?? null,
  };
}

/**
 * Le débrief d'un lot reconstruit depuis les contrôles déjà en base.
 *
 * Le débrief vivait en état d'écran · il s'effaçait au rechargement, alors que
 * la matière (les contrôles par créa) est persistée. On la relit et on
 * recompte · `null` quand aucune créa du lot n'a été relue (un lot composé, où
 * le mode garantit déjà le texte, n'a rien à débriefer · le silence est juste).
 */
export function debriefDepuisControles(controles: readonly (ControleLu | null | undefined)[]): DebriefLot | null {
  return debriefLot(controles.filter((c): c is ControleLu => !!c).map(relectureDepuisControle));
}

/**
 * Une créa du lot est-elle CASSÉE · c.-à-d. porte-t-elle un écart éliminatoire.
 *
 * Ce sont exactement les trois écarts qui empêchent `toutBon` : accroche
 * réécrite, produit modifié, texte illisible. Un accent perdu ou une photo
 * produit absente ne cassent pas la pub · ils ne comptent pas ici, comme ils ne
 * comptent pas dans `toutBon`. On tient la règle une seule fois pour que « le
 * lot est bon » et « voici les pubs à reprendre » ne puissent pas diverger.
 */
export function controleCasse(c: ControleLu | null | undefined): boolean {
  return !!c && (c.copieGrave || c.produitFidele === false || c.texteLisible === false);
}

const s = (k: number) => (k > 1 ? 's' : '');

/**
 * Le débrief d'un lot · `null` quand rien n'a été relu.
 *
 * `null` n'est pas « lot vide » · c'est « il n'y a rien à débriefer », ce qui
 * arrive dès qu'un lot n'est pas en mode entière, ou que la relecture n'a pas
 * pu tourner. Le silence est une réponse : on n'affiche pas « 0 conforme »,
 * qui se lirait comme un échec là où il n'y a eu aucune mesure.
 */
export function debriefLot(relectures: readonly RelecturePub[]): DebriefLot | null {
  const n = relectures.length;
  if (!n) return null;

  const accrocheReecrite = relectures.filter((r) => r.accrocheReecrite).length;
  const accrocheMineure = relectures.filter((r) => !r.accrocheReecrite && r.copieMineure).length;
  const accrocheConforme = n - accrocheReecrite - accrocheMineure;

  const avecReference = relectures.filter((r) => r.produitFidele !== null).length;
  const produitFidele = relectures.filter((r) => r.produitFidele === true).length;
  const produitInfidele = relectures.filter((r) => r.produitFidele === false).length;
  const sansReference = n - avecReference;

  const texteIllisible = relectures.filter((r) => r.texteLisible === false).length;

  const toutBon = accrocheReecrite === 0 && produitInfidele === 0 && texteIllisible === 0;

  // La copie · l'issue heureuse se dit en un mot, le reste s'énumère.
  const acc = accrocheReecrite === 0 && accrocheMineure === 0
    ? (n > 1 ? 'toutes les accroches sont conformes' : 'l’accroche est conforme')
    : [
        `${accrocheConforme} accroche${s(accrocheConforme)} conforme${s(accrocheConforme)}`,
        accrocheReecrite ? `${accrocheReecrite} réécrite${s(accrocheReecrite)}` : '',
        accrocheMineure ? `${accrocheMineure} avec un écart mineur` : '',
      ].filter(Boolean).join(', ');

  // Le produit · il ne se compte que sur les pubs qui avaient une référence,
  // sinon la relecture n'a rien regardé et ne peut rien affirmer.
  const prod = avecReference === 0
    ? 'aucune photo produit · la fidélité du packaging n’a pas pu être vérifiée'
    : `${produitFidele} produit${s(produitFidele)} fidèle${s(produitFidele)} sur ${avecReference} avec photo`
      + (produitInfidele ? `, ${produitInfidele} modifié${s(produitInfidele)}` : '');

  // La lisibilité · on ne la dit que quand elle a manqué. Un lot dont tout le
  // texte se lit n'a pas besoin qu'on le signale · le silence est une réponse,
  // ici comme pour la copie exacte.
  const lisibilite = texteIllisible ? ` · ${texteIllisible} au texte illisible` : '';

  const resume = `${n} publicité${s(n)} relue${s(n)} · ${acc} · ${prod}${lisibilite}.`;

  return {
    n, accrocheConforme, accrocheMineure, accrocheReecrite,
    avecReference, produitFidele, produitInfidele, sansReference,
    texteIllisible, toutBon, resume,
  };
}
