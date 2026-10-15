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

/* ─────────────────────── Défilement du rail (correctifs V5) ─────────────────────── */

/**
 * Le rail ne tient pas en entier à 720 de haut · mesuré sur le banc (owner,
 * marque Neva, Chromium) · la liste fait 512 px de contenu pour 361 px visibles
 * en déplié à 1440 / 1280 × 720, 457 pour 428 en replié, 512 pour 421 dans le
 * tiroir à 390 × 780. Les entrées du bas (« Neva », « Réglages », « Aide »)
 * étaient coupées net au ras du pied, sans aucun indice, et l'entrée active
 * (« Réglages » sur /settings, à 584 px pour une liste qui s'arrête à 546)
 * restait hors de la vue au chargement.
 *
 * La liste défile AU-DESSUS du pied (jamais dessous) · un fondu de fin dit
 * qu'il reste du contenu, et l'entrée active est ramenée dans la vue.
 *
 * Hauteur du fondu · une rangée de rail fait 46 px, 44 au plus serré (cible
 * tactile) · un fondu de 22 px n'en voile jamais plus de la moitié, et se lit
 * encore comme « ça continue ». L'entrée active est ramenée AU-DESSUS du fondu
 * (marge = sa hauteur) · il ne voile jamais l'entrée où l'on est.
 */
export const FONDU_RAIL = 22;

/** Ce que la liste du rail laisse hors de la vue, en haut et en bas. */
export interface FenetreDefilement { scrollTop: number; scrollHeight: number; clientHeight: number }

/** Tolérance de mesure · les arrondis de sous-pixel ne valent pas « il reste du contenu ». */
const TOLERANCE_PX = 1;

/** Reste-t-il du contenu au-dessus (`haut`) ou au-dessous (`bas`) de la vue ? */
export function indicesDefilementRail(f: FenetreDefilement): { haut: boolean; bas: boolean } {
  if (f.scrollHeight - f.clientHeight <= TOLERANCE_PX) return { haut: false, bas: false };
  return {
    haut: f.scrollTop > TOLERANCE_PX,
    bas: f.scrollTop + f.clientHeight < f.scrollHeight - TOLERANCE_PX,
  };
}

/**
 * Le masque de fondu de la liste (`mask-image`) · un fondu de `fondu` px au
 * bord où il reste du contenu, rien quand tout est visible. Le masque ne lit
 * que l'opacité · la couleur opaque est un jeton (`var(--rail)`), pas une
 * couleur littérale. `null` · aucun masque.
 */
export function masqueDefilementRail(i: { haut: boolean; bas: boolean }, fondu: number = FONDU_RAIL): string | null {
  if (!i.haut && !i.bas) return null;
  const debut = i.haut ? `transparent 0, var(--rail) ${fondu}px` : 'var(--rail) 0';
  const fin = i.bas ? `var(--rail) calc(100% - ${fondu}px), transparent 100%` : 'var(--rail) 100%';
  return `linear-gradient(to bottom, ${debut}, ${fin})`;
}

/**
 * Le défilement qui ramène l'entrée active dans la vue, hors des fondus.
 * `entree` · ses bords, en px, depuis le HAUT DU CONTENU de la liste. Renvoie
 * le nouveau `scrollTop`, ou `null` quand l'entrée est déjà entièrement
 * visible (on ne bouge rien · pas de saut gratuit). Une entrée plus haute que
 * la vue s'aligne sur son haut.
 */
export function defilementVersEntree(
  vue: FenetreDefilement,
  entree: { haut: number; bas: number },
  marge: number = FONDU_RAIL,
): number | null {
  const hautVisible = vue.scrollTop + marge;
  const basVisible = vue.scrollTop + vue.clientHeight - marge;
  if (entree.haut >= hautVisible && entree.bas <= basVisible) return null;
  const max = Math.max(0, vue.scrollHeight - vue.clientHeight);
  const cible = entree.haut < hautVisible || entree.bas - entree.haut > basVisible - hautVisible
    ? entree.haut - marge
    : entree.bas - vue.clientHeight + marge;
  const borne = Math.min(max, Math.max(0, Math.round(cible)));
  // Déjà au plus près (haut ou bas de la liste, sans fondu de ce côté) · rien ne bouge.
  return borne === vue.scrollTop ? null : borne;
}

/**
 * Le menu de recharge (ouvert par le « + » de la pastille) prenait la largeur
 * de la pastille · 159 px en déplié, 250 en replié. Mesuré sur le banc
 * (Chromium, 1440 et 390, largeur `max-content` de chaque rangée) :
 *
 *   | rangée                          | largeur naturelle |
 *   | ------------------------------- | ----------------- |
 *   | +1 000 crédits · 19 € · Acheter | 232,2             |
 *   | +5 000 crédits · 79 € · Acheter | 232,2             |
 *   | +20 000 crédits · 279 € · Acheter | 246,4           |
 *   | Voir mon utilisation détaillée  | 196,9             |
 *
 * Panneau = rangée la plus large (246,4) + padding 2 × 12 + bord 2 × 1 = 272,4 ·
 * à 159 le prix était rogné et « Acheter » hors du panneau, à 250 « 279 € »
 * passait sur deux lignes. On retient 288 (marge de 15 px pour une police de
 * repli plus large) · à 390, ancré à 12 px du bord, le panneau finit à 300.
 */
export const MENU_RECHARGE_LARGEUR_MIN = 288;

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
  rail: { rangeeMin: 46, paddingY: 13, paddingX: 12, rayon: 8, gapIcone: 12, gapEntrees: 5, barre: { largeur: 3, hauteur: 23 }, fondu: FONDU_RAIL },
  credits: { rayon: 12, icone: 28, plus: 24, barre: 4, menuLargeurMin: MENU_RECHARGE_LARGEUR_MIN },
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
