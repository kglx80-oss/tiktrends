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
  /** Aucun écart éliminatoire · ni accroche réécrite, ni produit modifié. */
  toutBon: boolean;
  /** La phrase affichée · factuelle, sans intervalle, parce qu'un lot ne conclut pas. */
  resume: string;
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

  const toutBon = accrocheReecrite === 0 && produitInfidele === 0;

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

  const resume = `${n} publicité${s(n)} relue${s(n)} · ${acc} · ${prod}.`;

  return {
    n, accrocheConforme, accrocheMineure, accrocheReecrite,
    avecReference, produitFidele, produitInfidele, sansReference,
    toutBon, resume,
  };
}
