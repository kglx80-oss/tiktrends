/**
 * La preuve d'un fait · vérifiée, à vérifier, ou devenue caduque · décidé ici.
 *
 * ── Pourquoi au noyau ────────────────────────────────────────────────────────
 *
 * N04 a séparé les trois natures du contrôle (technique, factuel, humain) et
 * refusé « Prête à diffuser » à une pub qui porte un fait non vérifié. N04-suite
 * donne au factuel sa VRAIE mécanique · un fait n'est « vérifié » que relié à
 * une source consultable, une version, un validateur et une date · et il
 * REDEVIENT « à vérifier » dès que son contenu change (prix, citation,
 * référence). La règle qui tranche cet état est une DÉCISION pure · elle doit
 * être éprouvable sans base ni réseau, exactement comme au moment où on valide
 * ET au moment où on relit.
 *
 * ── Trois principes ──────────────────────────────────────────────────────────
 *
 * 1. Une case cochée seule ne vaut rien · sans source ET validateur ET date, la
 *    validation est incomplète · le fait reste « à vérifier ».
 * 2. La validation porte sur un CONTENU précis, capté par sa signature. Le
 *    contenu change → la signature ne colle plus → la validation est caduque
 *    (`invalidee`), SANS qu'on ait touché à l'enregistrement approuvé.
 * 3. Ré-valider crée une NOUVELLE preuve · l'ancienne reste dans l'historique.
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

import type { EtatFait } from '../carte-creative';

/** Une preuve enregistrée · ce qui relie un fait à sa vérification. */
export interface ValidationFait {
  /** La source consultable · URL ou texte de la preuve. Vide = pas de preuve. */
  source: string;
  /** Qui a validé · nom ou identifiant. Vide = personne. */
  validateur: string;
  /** Quand · date ISO. Vide = jamais. */
  date: string;
  /** La version du contenu validé · identifiant court, pour l'afficher. */
  version: string;
  /** La signature du contenu au moment de la validation · sert à détecter un changement. */
  signature: string;
}

/**
 * La signature d'un contenu de fait · normalisée pour ignorer le formatage
 * incident (espaces de bord, casse, forme Unicode), sensible au reste. Deux
 * prix « -20 % » et « -25 % » diffèrent ; « -20 % » et «  -20 %  » non.
 */
export function signatureFait(contenu: string): string {
  return (contenu ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Un identifiant COURT et stable d'une signature · « v·xxxxxxxx ». Sert de
 * numéro de version affichable, et change dès que le contenu change. FNV-1a
 * 32 bits · pur, sans dépendance de hachage.
 */
export function versionFait(signature: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < signature.length; i++) {
    h ^= signature.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `v·${(h >>> 0).toString(16).padStart(8, '0')}`;
}

/** Un fait porté par une pub, avant qu'on regarde s'il est prouvé · sa matière. */
export interface FaitPorte {
  cle: string;
  label: string;
  /** Le texte exact dont la véracité est à établir · sert de signature. */
  contenu: string;
}

/**
 * Ce qu'une pub AFFIRME et qu'une relecture technique ne vérifie pas · déduit
 * du gabarit. Un témoignage porte une citation, une offre un prix, une stat un
 * chiffre, un avant/après une preuve. La matière (`contenu`) vient de TOUS les
 * champs qui portent l'affirmation · pour un témoignage la citation ET
 * l'accroche, pour une offre la pastille ET l'accroche. Signer un seul champ
 * laissait l'édition de l'autre passer sous le radar · une offre validée
 * « -20 % » en pastille restait « vérifiée » quand l'accroche devenait « -50 % »,
 * et l'invalidation dépendait, absurdement, de la présence d'un champ sans
 * rapport. C'est cette matière qui décide « vérifié » vs « caduque » · toute
 * mutation d'un champ porteur doit la casser. Un gabarit qui n'affirme rien à
 * prouver ne porte aucun fait.
 */
export function faitsPortes(pub: { template?: string | null; headline?: string | null; quote?: string | null; badge?: string | null }): FaitPorte[] {
  const headline = (pub.headline ?? '').trim();
  const quote = (pub.quote ?? '').trim();
  const badge = (pub.badge ?? '').trim();
  const joindre = (...parts: string[]) => parts.filter(Boolean).join(' · ');
  const fait = (cle: string, label: string, contenu: string): FaitPorte[] => contenu ? [{ cle, label, contenu }] : [];
  switch (pub.template) {
    case 'testimonial':
      return fait('temoignage', 'Témoignage', joindre(quote, headline));
    case 'offer':
      return fait('offre', 'Offre / prix', joindre(badge, headline));
    case 'stat':
      return fait('stat', 'Chiffre avancé', headline);
    case 'before_after':
      return fait('avant_apres', 'Avant / après', headline);
    default:
      return [];
  }
}

/** Une preuve est COMPLÈTE · source ET validateur ET date. Sinon elle ne vaut rien. */
export function preuveComplete(v: ValidationFait | null | undefined): v is ValidationFait {
  return !!v && !!v.source.trim() && !!v.validateur.trim() && !!v.date.trim();
}

/**
 * L'état d'un fait, face à sa dernière preuve et à son contenu ACTUEL.
 *
 * - pas de preuve, ou preuve incomplète → « à vérifier » (une case cochée seule
 *   ne suffit pas) ;
 * - preuve complète ET signature du contenu actuel = signature validée → « vérifié » ;
 * - preuve complète MAIS le contenu a changé → « caduque ».
 */
export function etatFait(contenuActuel: string, validation: ValidationFait | null | undefined): EtatFait {
  if (!preuveComplete(validation)) return 'a_verifier';
  return signatureFait(contenuActuel) === validation.signature ? 'verifiee' : 'invalidee';
}
