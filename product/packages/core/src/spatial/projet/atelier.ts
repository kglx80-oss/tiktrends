import { VARIABLES_TEST, type ProtocoleTest } from '../../studios/variantes/test';

/**
 * Spatial · les ateliers d'un projet (produit, textes, identités et voix,
 * export) et les gestes de la fiche que la maquette ne dessinait pas
 * (rattacher une variante à un test Adsmap, lot d'essai, barre de la vidéo).
 * Pur · ni base, ni réseau. Les écrans ne font que montrer ce qui est décidé ici.
 */

/* ───────────────────────────── Sous-navigation ───────────────────────────── */

/** Les libellés courts de la rangée d'ateliers (l'en-tête porte déjà le titre long). */
export const LIBELLES_COURTS_ATELIER: Readonly<Record<string, string>> = {
  image: 'Image', produit: 'Produit', textes: 'Textes', video: 'Vidéo', identites: 'Identités et voix', export: 'Export',
};

/**
 * La rangée `seg subnav` d'un atelier · « Projet » (la fiche), puis chaque
 * atelier ACTIF de l'espace (un atelier coupé n'a pas de lien : il n'est pas
 * proposé). L'ordre est celui de `liensAtelierProjet`.
 */
export function sousNavAtelier(projectId: string, atelier: ReadonlyArray<{ segment: string; href: string | null }>): Array<{ href: string; libelle: string }> {
  const fiche = `/studio/projets/${encodeURIComponent(projectId)}`;
  return [
    { href: fiche, libelle: 'Projet' },
    ...atelier.filter((a) => a.href).map((a) => ({ href: a.href!, libelle: LIBELLES_COURTS_ATELIER[a.segment] ?? a.segment })),
  ];
}

/* ──────────────────────────────── Textes ──────────────────────────────────── */

/**
 * La clé (stockage de l'onglet) du brouillon de l'atelier Textes, gardé à
 * travers le rechargement qui suit un conflit de version · la même que la V5,
 * un brouillon rangé par une interface est rendu par l'autre.
 */
export const cleBrouillonTextes = (projectId: string): string => `tt-studio-textes-brouillon-${projectId}`;

/* ─────────────────────────── Identités et voix ───────────────────────────── */

/** « Tenue · veste verte », mais « Cheveux bruns » (jamais « Cheveux · cheveux bruns »). */
export function libelleAttributIdentite(a: { libelle: string; libelleCategorie: string }): string {
  if (a.libelle.toLowerCase().startsWith(a.libelleCategorie.toLowerCase())) return a.libelle.charAt(0).toUpperCase() + a.libelle.slice(1);
  return `${a.libelleCategorie} · ${a.libelle}`;
}

/* ───────────────────── Rattacher une variante à un test ───────────────────── */

export interface ValeursRattachement {
  hypothese: string; variable: string; valeurVariable: string; objectif: string; protocole: string;
  periodeDebut: string; periodeFin: string; metrique: string; offreId: string; pageId: string;
}

/** Durée de la période proposée par défaut (jours) · celle du formulaire V5, modifiable avant l'envoi. */
export const PERIODE_TEST_DEFAUT_JOURS = 7;

/**
 * Les valeurs de départ du formulaire « Rattacher au test » · l'hypothèse et
 * la variable de la variante (ou du plan d'essai), le protocole de la marque,
 * une période de 7 jours à partir d'aujourd'hui (date UTC `AAAA-MM-JJ`). Une
 * variable inconnue n'est jamais reprise.
 */
export function valeursRattachement(o: { hypothese?: string | null; variable?: string | null; valeurVariable?: string | null; protocole: ProtocoleTest | null; aujourdHui: string }): ValeursRattachement {
  const debut = o.aujourdHui;
  const fin = new Date(Date.parse(`${debut}T00:00:00Z`) + PERIODE_TEST_DEFAUT_JOURS * 86_400_000).toISOString().slice(0, 10);
  const variable = o.variable && (VARIABLES_TEST as readonly string[]).includes(o.variable) ? o.variable : '';
  return {
    hypothese: o.hypothese ?? '', variable, valeurVariable: o.valeurVariable ?? '', objectif: '', protocole: o.protocole ?? 'abo_one_adset_per_ad',
    periodeDebut: debut, periodeFin: fin, metrique: 'cpa', offreId: '', pageId: '',
  };
}

/** Une variante issue d'une autre (itération) ne peut pas être le témoin (`none_control`). */
export function variablesRattachement(aUnParent: boolean): string[] {
  return VARIABLES_TEST.filter((x) => !(aUnParent && x === 'none_control'));
}

/* ───────────────────────────── Barre de la vidéo ──────────────────────────── */

/**
 * La phrase de la barre flottante du studio vidéo (`#orn`, maquette : « 2 / 3
 * variantes prêtes ») · ici les PLANS réels du storyboard dont le clip est
 * animé. Aucun plan · on le dit, sans chiffre inventé.
 */
export function infoOrnementVideo(plans: number, animes: number): string {
  if (plans <= 0) return 'Aucun plan · le storyboard d’abord';
  return `${Math.min(animes, plans)} / ${plans} plan${plans > 1 ? 's animés' : ' animé'}`;
}
