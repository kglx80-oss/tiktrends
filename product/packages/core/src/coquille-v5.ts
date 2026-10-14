/**
 * La coquille V5 · ce qu'elle DÉCIDE, sans DOM ni réseau.
 *
 * Le lot V5 · B porte la présentation V5 (rail créatif, pastille de crédits,
 * en-tête, pop-up profil) sur les vrais composants. Trois décisions y vivent,
 * chacune éprouvée par un test du noyau et par le rendu de la coquille :
 *
 *  1. la géométrie V5, MESURÉE sur la couche finale du prototype (styles
 *     calculés à 1440, thème sombre) · pas de nombre posé de tête ;
 *  2. la touche qui bascule le rail (Alt B, et « [ » ajoutée en V5) ;
 *  3. les entrées de la pop-up profil, tirées des droits RÉELS (aucune n'est
 *     ajoutée ni élargie · on renomme et on range ce que la garde ouvre déjà).
 */

/* ───────────────────────────── Géométrie V5 ───────────────────────────── */

/**
 * Mesuré sur le prototype V5 (couche finale, `getComputedStyle`, 1440 × 900) :
 *
 *   | élément              | V5 mesuré                                   |
 *   | -------------------- | ------------------------------------------- |
 *   | en-tête              | 68 px, padding 0 32, fond bg 90 % + flou 10 |
 *   | recherche            | 380 × 44, rayon 10, centrée                 |
 *   | avatar d'en-tête     | 44 × 44, rond                               |
 *   | entrée de rail       | min 46, padding 13 / 12, rayon 8, gap 12    |
 *   | entre deux entrées   | 5                                           |
 *   | barre active         | 3 × 23, à −12 (bord du rail), rayon 0 3 3 0 |
 *   | pastille de crédits  | rayon 12, padding 10 / 12, icône 28, « + » 24, barre 4 |
 *   | pop-up profil        | 580 de large, entrées rayon 12, icône 36    |
 *   | contenu              | max 1500, padding 36 / 32                   |
 */
export const COQUILLE_V5 = {
  enTete: { hauteur: 68, flou: 10, opacite: 90 },
  recherche: { largeur: 'min(380px, 40vw)', hauteur: 44, rayon: 10 },
  avatar: { enTete: 44, rail: 42, popup: 52 },
  rail: { rangeeMin: 46, paddingY: 13, paddingX: 12, rayon: 8, gapIcone: 12, gapEntrees: 5, barre: { largeur: 3, hauteur: 23 } },
  credits: { rayon: 12, icone: 28, plus: 24, barre: 4 },
  popup: { largeur: 580, rayonEntree: 12, icone: 36 },
} as const;

/* ───────────────────────────── Touches du rail ───────────────────────────── */

export interface ToucheRail { key: string; code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean }

/**
 * La touche bascule-t-elle le rail (réduit ↔ déployé) ?
 *
 *  · Alt B (sans Ctrl ni Cmd) · inchangé depuis l'UX V2 ;
 *  · « [ » (V5) · le CARACTÈRE, pas la position · sur un clavier AZERTY il se
 *    tape avec AltGr (Ctrl + Alt sous Windows) ou Option + Maj (Mac), on les
 *    accepte · on refuse Cmd (Cmd [ = « page précédente » du navigateur) et Ctrl
 *    seul. Comme c'est une touche nue, elle se tait aussi quand un dialogue est
 *    ouvert (elle ne bouge pas le décor derrière une fenêtre).
 *
 * Jamais pendant une saisie, jamais sur écran étroit (le rail y est un tiroir).
 */
export function actionToucheRail(t: ToucheRail, c: { saisie: boolean; mobile: boolean; dialogue: boolean }): boolean {
  if (c.saisie || c.mobile) return false;
  if (t.altKey && !t.ctrlKey && !t.metaKey && t.code === 'KeyB') return true;
  if (t.key === '[' && !t.metaKey && !(t.ctrlKey && !t.altKey) && !c.dialogue) return true;
  return false;
}

/* ───────────────────────────── Pop-up profil ───────────────────────────── */

/** Une entrée du menu de compte telle que les droits la donnent (`sectionsCompteOuvertes`). */
export interface EntreeCompteSource { key: string; label: string; href: string; icon: string; locked?: boolean; soon?: boolean }

export type ActionProfil =
  | { genre: 'profil' }
  | { genre: 'reglages-rapides' }
  | { genre: 'lien'; href: string };

export interface EntreeProfil {
  id: string;
  libelle: string;
  detail: string | null;
  icone: string;
  action: ActionProfil;
  /** Verrouillée (formule) ou à venir · visible, sans lien (comme avant). */
  inerte: boolean;
}

/**
 * Le libellé V5 des entrées « Espace », dans l'ordre V5. Seuls le nom et le
 * sous-titre changent · la destination et la garde restent celles de la
 * fonctionnalité (lib/rbac). « Réglages » ouvre les réglages rapides, comme
 * l'entrée du menu d'espace qu'elle remplace (le rail garde le lien /settings).
 */
const ESPACE_V5: ReadonlyArray<{ key: string; libelle: string; detail: string; icone: string; action?: ActionProfil }> = [
  { key: 'settings', libelle: 'Espace de travail', detail: 'Nom de l’espace, réglages', icone: 'gear', action: { genre: 'reglages-rapides' } },
  { key: 'team', libelle: 'Équipe', detail: 'Membres et invitations', icone: 'users' },
  { key: 'connect', libelle: 'Connexions', detail: 'Meta, Shopify…', icone: 'plug' },
  { key: 'usage', libelle: 'Crédits & utilisation', detail: 'Solde et historique', icone: 'coin' },
  { key: 'billing', libelle: 'Abonnement & factures', detail: 'Formule et factures', icone: 'card' },
];

/**
 * Les entrées « Espace » que la pop-up ne reprend PAS, et pourquoi. Chacune
 * reste atteignable ailleurs, sous la MÊME garde · rien ne disparaît.
 */
export const ESPACE_HORS_POPUP: Readonly<Record<string, string>> = {
  brands: 'porté par le rail, bloc « Votre espace » (même source, même garde)',
};

const COMPTE_V5: Readonly<Record<string, { libelle: string; icone: string }>> = {
  support: { libelle: 'Aide & support', icone: 'help' },
};

/** L'entrée ADMIN+ · même destination et même garde (`isStaff`) que l'ancien menu. */
export const ENTREE_ADMIN_PLUS: EntreeProfil = {
  id: 'admin-plus', libelle: 'Ouvrir ADMIN+', detail: 'Piloter l’IA, les accès et les coûts', icone: 'gauge', action: { genre: 'lien', href: '/admin' }, inerte: false,
};

const versEntree = (s: EntreeCompteSource, v: { libelle: string; detail?: string | null; icone?: string; action?: ActionProfil }): EntreeProfil => ({
  id: s.key,
  libelle: v.libelle,
  detail: v.detail ?? null,
  icone: v.icone ?? s.icon,
  action: v.action ?? { genre: 'lien', href: s.href },
  inerte: !!(s.locked || s.soon),
});

/**
 * Ce que la pop-up profil montre, à partir des droits RÉELS.
 *
 *  · `reglages` · « Mon profil » (toujours, comme l'ancien menu) puis les
 *    entrées « Espace » que la garde ouvre, au nom V5, dans l'ordre V5 · une
 *    entrée inconnue de V5 n'est jamais perdue · elle suit, sous son propre nom ;
 *  · `adminPlus` · seulement pour l'équipe plateforme (`staff`), garde inchangée ;
 *  · `aide` · les entrées « Compte » (Support → « Aide & support »).
 */
export function entreesProfil(o: { compte: EntreeCompteSource[]; espace: EntreeCompteSource[]; staff: boolean }): {
  reglages: EntreeProfil[]; adminPlus: EntreeProfil | null; aide: EntreeProfil[];
} {
  const reglages: EntreeProfil[] = [{ id: 'profil', libelle: 'Mon profil', detail: 'Photo, nom, confidentialité', icone: 'user', action: { genre: 'profil' }, inerte: false }];
  for (const v of ESPACE_V5) {
    const s = o.espace.find((e) => e.key === v.key);
    if (s) reglages.push(versEntree(s, v));
  }
  for (const s of o.espace) {
    if (ESPACE_V5.some((v) => v.key === s.key) || s.key in ESPACE_HORS_POPUP) continue;
    reglages.push(versEntree(s, { libelle: s.label }));
  }
  const aide = o.compte.map((s) => versEntree(s, COMPTE_V5[s.key] ?? { libelle: s.label }));
  return { reglages, adminPlus: o.staff ? ENTREE_ADMIN_PLUS : null, aide };
}
