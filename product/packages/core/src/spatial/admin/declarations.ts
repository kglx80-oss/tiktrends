/**
 * « Inscriptions & comptes » · ce que chaque espace a DÉCLARÉ à l'onboarding
 * (colonne `workspaces.onboarding`). Porté tel quel de l'ancienne page
 * `/admin/signups` (mêmes libellés, même lecture des anciennes réponses
 * « niveau IA », même lien de site) · aucune valeur n'est déduite ni
 * reconstituée · une réponse absente reste absente (`VALEUR_ABSENTE`).
 */
import { VALEUR_ABSENTE } from '../../ponctuation-ecran';

export const LIBELLE_PROFIL: Readonly<Record<string, string>> = { brand: 'Marque / E-com', agency: 'Agence', freelancer: 'Freelance', ai_artist: 'AI Artist', other: 'Autre' };
/** Expérience publicitaire · le signal courant. */
export const LIBELLE_EXPERIENCE_PUB: Readonly<Record<string, string>> = { debute: 'Débute', cree: 'Crée déjà', teste: 'Teste', metier: 'Métier' };
/** Anciennes réponses « niveau IA » · affichées comme héritées, jamais confondues avec l'expérience pub. */
export const LIBELLE_NIVEAU_IA: Readonly<Record<string, string>> = { starter: 'Débutant', exploring: 'Explore', comfortable: 'À l’aise', advanced: 'Avancé' };
export const LIBELLE_OBJECTIF: Readonly<Record<string, string>> = { ads: 'Pubs', clone: 'Clone', analyze: 'Analytics', scale: 'Échelle', multi: 'Multi-marques', video: 'Vidéo' };

/** Le nombre d'espaces listés · le même plafond que l'ancienne page (les plus récents d'abord). */
export const LIMITE_DECLARATIONS = 60;

export interface DeclarationAffichee {
  profil: string;
  /** `herite` · une ancienne réponse « niveau IA », pas une expérience publicitaire. */
  experience: { texte: string; herite: boolean } | null;
  objectifs: string[];
  site: { texte: string; href: string } | null;
}

const texte = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

/** La déclaration d'onboarding d'un espace, prête à afficher · tolère un JSON partiel ou malformé. */
export function declarationOnboarding(brut: unknown): DeclarationAffichee {
  const o = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const profil = texte(o.profile);
  const ad = texte(o.adLevel);
  const ia = texte(o.aiLevel);
  const site = texte(o.siteUrl);
  const objectifs = Array.isArray(o.goals) ? o.goals.filter((g): g is string => typeof g === 'string' && !!g) : [];
  return {
    profil: profil ? (LIBELLE_PROFIL[profil] ?? profil) : VALEUR_ABSENTE,
    experience: ad
      ? { texte: LIBELLE_EXPERIENCE_PUB[ad] ?? ad, herite: false }
      : ia ? { texte: `${LIBELLE_NIVEAU_IA[ia] ?? ia} · IA hérité`, herite: true } : null,
    objectifs: objectifs.map((g) => LIBELLE_OBJECTIF[g] ?? g),
    site: site ? { texte: site, href: `https://${site}` } : null,
  };
}

/** La date d'inscription ou d'onboarding · jour, mois abrégé, année sur deux chiffres (format de l'ancienne page). */
export function dateDeclaration(d: Date | string | null): string {
  if (d == null) return VALEUR_ABSENTE;
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? VALEUR_ABSENTE : x.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
}
