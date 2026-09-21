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
/**
 * Une affirmation commerciale · prix, remise, gratuité, multi-achat · repérée
 * dans un texte. Elle ne dépend PAS du gabarit · une pastille « -50 % » sur un
 * gabarit « Problème / solution » est une offre autant que sur un gabarit
 * « Offre » (CDC v8 · F02 · une remise présente dans le rendu échappait au
 * contrôle parce que le format n'était pas « Offre »).
 *
 * On mesure les motifs, on ne les pose pas d'instinct · le tableau ci-dessous a
 * été vérifié contre une liste de cas positifs et négatifs (test dédié). En cas
 * de doute, on PENCHE vers « c'est une offre » · l'absence de fait est le
 * défaut coûteux (une affirmation non prouvée passe « Prête à diffuser »), pas
 * le fait de trop (une vérification demandée à tort).
 */
const RE_DEVISE = /\d[\d .,]*\s?[€$£]|[€$£]\s?\d/u;      // 9,99 € · €9.99 · 19 €
const RE_REMISE_SIGNEE = /[-−–]\s?\d/u;                 // -50% · -30€ · –50 %
const RE_MULTIACHAT = /\b\d+\s?\+\s?\d+\b/u;            // 2+1
const RE_POURCENT = /\d+\s?%/u;                         // 50 % (compte comme offre en PASTILLE)
const RE_MOTS_OFFRE =
  /(promo(?:tion)?s?|soldes?|remises?|r[eé]ductions?|offert(?:e|es|s)?|gratuit(?:e|es|s)?|[eé]conomis\w*|cashback|d[eé]stockage|liquidation|bon plan|livraison offerte|achet\w+\s+\w*\s*(?:offert|gratuit))/u;

/**
 * Vrai si `texte` porte une affirmation commerciale. `pastille` = le texte est
 * une pastille (badge) · là, un pourcentage seul suffit (une pastille « 50 % »
 * est promotionnelle par nature), alors qu'ailleurs il faut un signe de remise,
 * une devise ou un mot d'offre pour ne pas confondre avec un bénéfice chiffré.
 */
export function texteContientOffre(texte: string, opts?: { pastille?: boolean }): boolean {
  const n = (texte ?? '').normalize('NFKC').toLowerCase();
  if (RE_DEVISE.test(n) || RE_REMISE_SIGNEE.test(n) || RE_MULTIACHAT.test(n) || RE_MOTS_OFFRE.test(n)) return true;
  return !!opts?.pastille && RE_POURCENT.test(n);
}

/** Les champs texte d'une pub · matière du contrôle factuel, quel que soit le gabarit. */
export interface ChampsPub {
  template?: string | null;
  headline?: string | null;
  quote?: string | null;
  badge?: string | null;
  subhead?: string | null;
  kicker?: string | null;
  cta?: string | null;
  benefits?: string[] | null;
}

/**
 * Ce qu'une pub AFFIRME et qu'une relecture technique ne vérifie pas.
 *
 * D'abord le fait DU GABARIT (témoignage → citation, offre → prix, stat →
 * chiffre, avant/après → preuve), au contenu INCHANGÉ · les validations
 * existantes reposent sur sa signature, on n'y touche pas.
 *
 * Puis, EN PLUS, les faits que le contenu porte HORS de son gabarit · une remise
 * dans une pastille ou un bénéfice sur un gabarit qui n'est pas « Offre », une
 * citation posée hors d'un gabarit « Témoignage ». Additif · on ne double jamais
 * un fait déjà produit, donc les gabarits « offer »/« testimonial » gardent
 * exactement leur fait (et leur signature). C'est ce qui ferme F02 sans casser
 * l'acquis N04-suite.
 */
export function faitsPortes(pub: ChampsPub): FaitPorte[] {
  const headline = (pub.headline ?? '').trim();
  const quote = (pub.quote ?? '').trim();
  const badge = (pub.badge ?? '').trim();
  const joindre = (...parts: string[]) => parts.filter(Boolean).join(' · ');
  const fait = (cle: string, label: string, contenu: string): FaitPorte[] => contenu ? [{ cle, label, contenu }] : [];

  const faits: FaitPorte[] = [];
  switch (pub.template) {
    case 'testimonial': faits.push(...fait('temoignage', 'Témoignage', joindre(quote, headline))); break;
    case 'offer': faits.push(...fait('offre', 'Offre / prix', joindre(badge, headline))); break;
    case 'stat': faits.push(...fait('stat', 'Chiffre avancé', headline)); break;
    case 'before_after': faits.push(...fait('avant_apres', 'Avant / après', headline)); break;
    default: break;
  }
  const aDeja = (cle: string) => faits.some((f) => f.cle === cle);

  // Offre HORS gabarit · on balaie tous les champs porteurs (la pastille compte
  // un pourcentage seul). Le contenu = les fragments qui portent l'affirmation,
  // dans un ordre fixe · éditer l'un d'eux rend la validation caduque.
  if (!aDeja('offre')) {
    const benefits = (pub.benefits ?? []).map((b) => (b ?? '').trim()).filter(Boolean);
    const champs: Array<{ t: string; pastille: boolean }> = [
      { t: badge, pastille: true },
      { t: headline, pastille: false },
      { t: (pub.subhead ?? '').trim(), pastille: false },
      { t: (pub.kicker ?? '').trim(), pastille: false },
      { t: (pub.cta ?? '').trim(), pastille: false },
      ...benefits.map((t) => ({ t, pastille: false })),
    ];
    const porteurs = champs.filter((c) => c.t && texteContientOffre(c.t, { pastille: c.pastille })).map((c) => c.t);
    if (porteurs.length) faits.push({ cle: 'offre', label: 'Offre / prix', contenu: joindre(...porteurs) });
  }

  // Citation HORS gabarit · une pub qui porte une citation (champ `quote`) sans
  // être un gabarit « Témoignage » affirme quand même la parole d'un tiers.
  if (!aDeja('temoignage') && quote) {
    faits.push({ cle: 'temoignage', label: 'Témoignage', contenu: joindre(quote, headline) });
  }

  return faits;
}

/** Une preuve datée · ce qu'il faut pour désigner l'ACTIVE de façon stable. */
export interface PreuveDatee {
  /** Identifiant unique · départage une égalité de date. */
  id: string;
  /** Quand la preuve a été posée · en millisecondes. */
  poseeA: number;
}

/**
 * La plus récente de deux preuves du même fait · la DATE tranche d'abord, et sur
 * égalité (deux validations au même instant) l'`id` départage. Sans ce second
 * critère, l'active — donc l'état vérifié/caduque — dépendrait de l'ordre que la
 * base rend sur les ex æquo, indéfini · elle pouvait basculer d'un chargement à
 * l'autre. Pur, donc éprouvable sans base et sur un ordre d'entrée adverse.
 */
export function preuvePlusRecente<T extends PreuveDatee>(a: T, b: T): T {
  if (a.poseeA !== b.poseeA) return a.poseeA > b.poseeA ? a : b;
  return a.id > b.id ? a : b;
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
