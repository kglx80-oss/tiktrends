/**
 * Stockage · un logo importé est une IMAGE · le type et la taille se RELISENT
 * dans l'objet déposé avant qu'il devienne logo · la règle, pure (ni base, ni
 * réseau · la relecture vit dans `packages/integrations/src/storage-relecture.ts`).
 *
 * ── Le défaut ────────────────────────────────────────────────────────────────
 *
 * Depuis le jeton de dépôt (`jeton-depot.ts`), la charte sait qu'une adresse
 * nouvelle du bucket a bien été déposée par CET espace. Mais elle ne relisait
 * pas l'objet : le présigné accepte toute la liste blanche du dépôt (PDF,
 * vidéo, son, images jusqu'à 64 Mio), et rien n'empêchait d'envoyer à
 * `saveBrandDAAction` l'adresse et le jeton d'un PDF ou d'une vidéo · l'objet
 * devenait le logo par défaut de la marque. Le contrôle « png, jpg, webp, 4 Mo »
 * (`refusFichierLogo`) ne vivait que dans le navigateur.
 *
 * ── La règle (`decisionLogoDeposeRelu`) ──────────────────────────────────────
 *
 * Pour l'adresse nouvelle que le jeton atteste, le serveur relit la TAILLE
 * (`HEAD`) et les premiers octets (`OCTETS_RELUS_DEPOT`, même lecteur que
 * l'enregistrement d'un fichier de la Bibliothèque), puis :
 *  1. lecture impossible (objet absent, stockage injoignable) · refus, rien
 *     n'est retiré (l'envoi peut être relancé avec le même jeton) ;
 *  2. contenu de balisage (HTML, SVG, XML) · refus, l'objet est à retirer ;
 *  3. contenu qui n'est pas une image `FORMATS_LOGO` (png, jpeg, webp) d'après
 *     ses octets · refus, à retirer (PDF, MP4, octets inconnus…) ;
 *  4. taille RELUE nulle, ou au-delà de `POIDS_MAX_LOGO` (4 Mo) · refus, à
 *     retirer · jamais la taille annoncée par le navigateur ;
 *  5. type relu différent du type SIGNÉ dans le jeton, ou taille relue
 *     différente de la taille signée · refus, à retirer · l'objet n'est pas
 *     celui que le présigné a autorisé (un JPEG déposé comme PNG, un dépôt
 *     préparé pour une vidéo) ;
 *  6. sinon accepté · le type et la taille relus sont rendus.
 * « À retirer » ne veut jamais dire « supprimé » : le serveur ne retire que si
 * aucune ligne ne cite l'objet (`decisionRetraitDepot`).
 *
 * Les logos déjà en base et les adresses externes `https:` ne passent pas par
 * ici (`decisionCharteDeposee` ne rend en `deposes` que l'adresse nouvelle
 * attestée).
 */

import { lectureDepot, MESSAGES_RELECTURE_DEPOT, MESSAGES_REFUS_RELU } from './depot-relu';
import { TEXTES_REFUS_JETON_DEPOT, type JetonDepot } from './jeton-depot';
import { FORMATS_LOGO, POIDS_MAX_LOGO } from './spatial/marque/logo';

export const MESSAGES_REFUS_LOGO_RELU = {
  balisage: 'Logo refusé · son contenu est une page ou un dessin vectoriel (HTML, SVG, XML), pas une image png, jpg ou webp.',
  contenu: 'Logo refusé · ce fichier n’est pas une image png, jpg ou webp.',
  vide: 'Logo refusé · le fichier déposé est vide.',
  lourd: 'Logo refusé · le fichier déposé pèse plus de 4 Mo.',
  type_different: 'Logo refusé · son contenu ne correspond pas au type annoncé à l’import · importe-le à nouveau.',
  taille_differente: 'Logo refusé · le fichier déposé n’a pas la taille annoncée à l’import · importe-le à nouveau.',
} as const;

/** Ce que le lecteur du stockage rend (`lireDebutObjetEspace`, sans l'empreinte). */
export type LectureLogoDepose =
  | { ok: true; taille: number; octets: Uint8Array }
  | { ok: false; raison: 'hors_espace' | 'absent' | 'illisible' };

export type DecisionLogoDeposeRelu =
  | { ok: true; type: string; taille: number }
  /** `retirer` · l'objet relu n'est pas un logo admissible, le serveur le retire s'il n'est cité nulle part. */
  | { ok: false; erreur: string; retirer: boolean };

/** Le dépôt attesté par `jeton` peut-il devenir logo · voir la règle en tête. */
export function decisionLogoDeposeRelu(o: { jeton: JetonDepot | null | 'illisible'; lecture: LectureLogoDepose }): DecisionLogoDeposeRelu {
  const j = o.jeton;
  if (!j || j === 'illisible') return { ok: false, erreur: TEXTES_REFUS_JETON_DEPOT[j ? 'illisible' : 'absent'], retirer: false };
  const l = o.lecture;
  if (!l || !l.ok) return { ok: false, erreur: MESSAGES_RELECTURE_DEPOT[l?.raison ?? 'illisible'], retirer: false };
  const refus = (erreur: string): DecisionLogoDeposeRelu => ({ ok: false, erreur, retirer: true });

  if (!(l.octets instanceof Uint8Array) || !Number.isSafeInteger(l.taille) || l.taille < 0) return refus(MESSAGES_REFUS_RELU.incoherent);
  if (l.taille === 0) return refus(MESSAGES_REFUS_LOGO_RELU.vide);
  const lu = lectureDepot(l.octets);
  if (lu === 'balisage') return refus(MESSAGES_REFUS_LOGO_RELU.balisage);
  if (!lu || !FORMATS_LOGO.includes(lu)) return refus(MESSAGES_REFUS_LOGO_RELU.contenu);
  if (l.taille > POIDS_MAX_LOGO) return refus(MESSAGES_REFUS_LOGO_RELU.lourd);
  if (j.type !== lu) return refus(MESSAGES_REFUS_LOGO_RELU.type_different);
  if (j.taille !== l.taille) return refus(MESSAGES_REFUS_LOGO_RELU.taille_differente);
  return { ok: true, type: lu, taille: l.taille };
}
