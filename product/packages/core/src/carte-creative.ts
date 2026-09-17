/**
 * La carte créative · ce qu'elle DIT de la qualité d'une création, décidé ici.
 *
 * ── Pourquoi au noyau ────────────────────────────────────────────────────────
 *
 * La carte d'une création mêlait trois choses de natures différentes · la
 * pertinence pour la marque (un vote humain qui entraîne Jarvis), la qualité de
 * fabrication (ce qu'une relecture AUTOMATIQUE a constaté) et la performance
 * mesurée (le verdict du marché). Les confondre laisse lire un pouce levé comme
 * une preuve de performance, ou un défaut suspecté comme un fait. La règle de
 * synthèse — « combien de points à vérifier », « est-ce bloquant », « peut-on
 * dire prête à diffuser » — est une DÉCISION · elle vit donc dans un module pur,
 * éprouvable sans rendu.
 *
 * ── Trois principes ──────────────────────────────────────────────────────────
 *
 * 1. Une relecture automatique produit des SUSPICIONS, pas des verdicts · on les
 *    présente comme telles (`automatique`).
 * 2. Un défaut BLOQUANT confirmé (produit modifié, texte illisible, accroche
 *    réécrite grave) reste visible et interdit « Prête à diffuser ».
 * 3. Le silence est une réponse · une création sans relecture n'est pas « prête »,
 *    elle est « non vérifiée » · ne pas la déclarer prête à tort.
 */

/** Ce qu'une relecture a consigné sur une création · forme déjà résumée. */
export interface ControleCarte {
  /** Une phrase sur la copie retouchée · vide quand la copie est conforme. */
  copieResume?: string | null;
  /** La retouche de copie est-elle grave (accroche réécrite) ? */
  copieGrave?: boolean | null;
  /** Le produit est-il fidèle · `false` = modifié, `null` = pas jugé. */
  produitFidele?: boolean | null;
  /** Les écarts produit constatés · le premier sert de détail. */
  ecarts?: string[] | null;
  /** Le texte est-il lisible · `false` = non, `null` = pas de texte ou pas jugé. */
  texteLisible?: boolean | null;
  /** Ce qui gêne la lecture · le premier sert de détail. */
  problemesLisibilite?: string[] | null;
}

export type NiveauQualite = 'ok' | 'suspicion' | 'bloquant';
export type TonQualite = 'bon' | 'attention' | 'bloquant' | 'inconnu';

export interface QualiteCarte {
  /** La création a-t-elle été relue · sans relecture, on ne conclut pas. */
  verifie: boolean;
  niveau: NiveauQualite;
  /** Les points à vérifier, nommés · pour le détail dépliable. Vide si rien. */
  points: string[];
  /** La synthèse affichée sur la carte · « 2 points à vérifier », etc. */
  libelle: string;
  ton: TonQualite;
  /** Un défaut bloquant confirmé interdit ce statut · et une création non relue
   *  ou porteuse d'une suspicion n'est pas déclarée prête. */
  pretADiffuser: boolean;
  /** Les constats viennent d'une relecture automatique · à présenter comme suspicion. */
  automatique: boolean;
}

function txt(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}
function premier(v: unknown): string {
  return Array.isArray(v) ? txt(v[0]) : '';
}

/** Une création est « relue » dès qu'un contrôle porte un jugement. */
function estRelue(c: ControleCarte): boolean {
  return c.produitFidele != null || c.texteLisible != null || !!txt(c.copieResume);
}

/**
 * La synthèse qualité d'une création, à partir de ce qu'une relecture a constaté.
 *
 * Ordre des points · le produit d'abord (une pub au packaging inventé est
 * inutilisable), puis la lisibilité, puis la copie · le même ordre de gravité
 * que le bandeau détaillé, pour qu'une lecture rapide et une lecture fine
 * racontent la même chose.
 */
export function qualiteCarte(controle?: ControleCarte | null): QualiteCarte {
  const c = controle ?? {};
  const verifie = estRelue(c);

  const produitKo = c.produitFidele === false;
  const texteKo = c.texteLisible === false;
  const copie = txt(c.copieResume);
  const copieGrave = !!c.copieGrave && !!copie;

  const points: string[] = [];
  if (produitKo) { const e = premier(c.ecarts); points.push(e ? `Produit modifié · ${e}` : 'Produit modifié'); }
  if (texteKo) { const p = premier(c.problemesLisibilite); points.push(p ? `Texte peu lisible · ${p}` : 'Texte peu lisible'); }
  if (copie) points.push(copieGrave ? `Accroche réécrite · ${copie}` : `Copie retouchée · ${copie}`);

  const bloquant = produitKo || texteKo || copieGrave;
  const niveau: NiveauQualite = bloquant ? 'bloquant' : points.length ? 'suspicion' : 'ok';

  const n = points.length;
  const pluriel = n > 1 ? 's' : '';
  const libelle = !verifie
    ? 'Qualité non vérifiée'
    : bloquant
      ? `À revoir · ${n} point${pluriel}`
      : n
        ? `${n} point${pluriel} à vérifier`
        : 'Prête à diffuser';

  const ton: TonQualite = !verifie ? 'inconnu' : bloquant ? 'bloquant' : n ? 'attention' : 'bon';

  return {
    verifie,
    niveau,
    points,
    libelle,
    ton,
    // Une création non relue n'est pas prête · et une suspicion, même non bloquante,
    // demande une vérification avant de la dire prête.
    pretADiffuser: verifie && n === 0,
    // Les points sortent d'une relecture automatique · ce sont des suspicions.
    automatique: n > 0,
  };
}
