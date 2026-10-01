/**
 * Le logo d'un outil tiers · QUEL logo afficher pour un nom d'outil, et sur
 * quel fond (lot A · #120).
 *
 * ── Le défaut que ce module ferme ────────────────────────────────────────────
 *
 * Les tuiles d'intégrations affichaient des pastilles génériques (une initiale
 * teintée) là où le vrai logo existe, et la correspondance « nom → logo »
 * vivait dans une liste d'expressions du composant · « Google Analytics »,
 * « Gmail » ou « Search Console » tombaient tous sur le « G » générique de
 * Google, pas sur leur propre logo. Ce module tranche, pur et testable ·
 *  · `cleLogoOutil` · le logo d'un nom, le plus SPÉCIFIQUE d'abord, `null`
 *    quand aucun tracé officiel n'est disponible (repli explicite) ;
 *  · la marque blanche · un fournisseur interne n'a JAMAIS de logo ;
 *  · `pastilleLogo` · un logo monochrome trop pâle pour un fond blanc
 *    (Snapchat, Mailchimp, Intercom) passe sur une pastille de sa teinte.
 *
 * Les tracés eux-mêmes (SVG) vivent côté interface, dans
 * `apps/web/components/logos-outils.ts` · ici, uniquement la règle.
 */

/** Les logos dont un tracé officiel (ou de référence reconnue) est embarqué. */
export const CLES_LOGO_OUTIL = [
  'meta', 'facebook', 'instagram', 'shopify', 'tiktok', 'youtube', 'linkedin', 'x',
  'snapchat', 'pinterest', 'reddit',
  'google', 'googledrive', 'googleads', 'googleanalytics', 'googlesearchconsole', 'googlebigquery',
  'googlesheets', 'googledocs', 'gmail',
  'slack', 'notion', 'stripe', 'dropbox', 'figma',
  'snowflake', 'hubspot', 'intercom', 'mailchimp', 'zendesk', 'confluence', 'anthropic',
] as const;
export type CleLogoOutil = (typeof CLES_LOGO_OUTIL)[number];

function norm(nom: string): string {
  return nom.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Marque blanche · le fournisseur de données dont le produit est la marque
 * blanche n'apparaît jamais à l'écran · ni son nom, ni son logo. Aucun tracé
 * n'est embarqué pour lui, et ce garde-fou empêche qu'un nom qui le contient
 * emprunte par accident le logo d'un autre outil.
 */
const FOURNISSEURS_INTERNES: readonly RegExp[] = [/trend\s*track/];

/**
 * Correspondance nom → logo · ordonnée du plus SPÉCIFIQUE au plus général. Un
 * produit Google a son propre logo · le « G » générique ne sert qu'à « Google »
 * seul. On compare des noms normalisés (casse, espaces).
 */
const CORRESPONDANCES: ReadonlyArray<readonly [RegExp, CleLogoOutil]> = [
  [/^meta( ads)?$/, 'meta'],
  [/^facebook( ads)?$/, 'facebook'],
  [/^instagram( ads)?$/, 'instagram'],
  [/^shopify\b/, 'shopify'],
  [/^tiktok( ads)?$/, 'tiktok'],
  [/^youtube( ads)?$/, 'youtube'],
  [/^linkedin( ads)?$/, 'linkedin'],
  [/^(x|x \(twitter\)|twitter)$/, 'x'],
  [/^snapchat( ads)?$/, 'snapchat'],
  [/^pinterest( ads)?$/, 'pinterest'],
  [/^reddit( ads)?$/, 'reddit'],
  [/^google drive$/, 'googledrive'],
  [/^google ads$/, 'googleads'],
  [/^google analytics( 4)?$/, 'googleanalytics'],
  [/^(google )?search console$/, 'googlesearchconsole'],
  [/^(google )?bigquery$/, 'googlebigquery'],
  [/^google sheets$/, 'googlesheets'],
  [/^google docs$/, 'googledocs'],
  [/^gmail$/, 'gmail'],
  [/^google$/, 'google'],
  [/^slack$/, 'slack'],
  [/^notion$/, 'notion'],
  [/^stripe$/, 'stripe'],
  [/^dropbox$/, 'dropbox'],
  [/^figma$/, 'figma'],
  [/^snowflake$/, 'snowflake'],
  [/^hubspot$/, 'hubspot'],
  [/^intercom$/, 'intercom'],
  [/^mailchimp$/, 'mailchimp'],
  [/^zendesk$/, 'zendesk'],
  [/^confluence$/, 'confluence'],
  [/^anthropic( \(claude\))?$/, 'anthropic'],
];

/**
 * Le logo d'un outil d'après son nom affiché, ou `null` · le composant pose
 * alors un repli EXPLICITE (monogramme teinté), jamais un logo approchant.
 */
export function cleLogoOutil(nom: string | null | undefined): CleLogoOutil | null {
  if (!nom) return null;
  const n = norm(nom);
  if (FOURNISSEURS_INTERNES.some((re) => re.test(n))) return null;
  const hit = CORRESPONDANCES.find(([re]) => re.test(n));
  return hit ? hit[1] : null;
}

/* ── Contraste · sur quel fond poser le logo ───────────────────────────────── */

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Le rapport de contraste WCAG 2 entre deux couleurs `#RRGGBB` (1 à 21). */
export function contrasteWcag(a: string, b: string): number {
  if (!HEX.test(a) || !HEX.test(b)) return 1;
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/**
 * Le seuil sous lequel une teinte de marque ne se lit plus sur du blanc.
 *
 * MESURÉ (contraste contre #FFFFFF, teintes officielles des logos embarqués et
 * des monogrammes du catalogue) ·
 *
 *   Snapchat  #FFFC00  1,10   ← invisible sur blanc
 *   Intercom  #6AFDEF  1,24   ← invisible sur blanc
 *   Mailchimp #FFE01B  1,32   ← invisible sur blanc
 *   ─────────────── trou ───────────────
 *   Canva     #00C4CC  2,15   (monogramme)
 *   Snowflake #29B5E8  2,37
 *   Shopify   #7AB55C  2,44
 *   HubSpot   #FF7A59  2,57
 *   …toutes les autres teintes ≥ 2,72
 *
 * Le trou sépare nettement les trois teintes pâles du reste · on coupe au
 * milieu, avec marge des deux côtés (1,32 → 1,8 → 2,15). Ce n'est pas le
 * 3:1 de WCAG 1.4.11 · un logo en est exempté, et l'appliquer ferait basculer
 * Shopify ou Snowflake hors de leur présentation officielle sur fond blanc.
 */
export const SEUIL_CONTRASTE_PASTILLE = 1.8;

const BLANC = '#FFFFFF';
const ENCRE = '#111111';

/**
 * Le fond et le trait d'une pastille de logo monochrome · le logo dans sa
 * teinte officielle sur blanc, sauf teinte trop pâle · la pastille prend alors
 * la teinte et le logo passe en encre sombre (la présentation officielle de
 * Snapchat · fantôme sur jaune).
 */
export function pastilleLogo(hex: string): { fond: string; trait: string } {
  const teinte = HEX.test(hex) ? hex.toUpperCase() : ENCRE;
  return contrasteWcag(teinte, BLANC) >= SEUIL_CONTRASTE_PASTILLE
    ? { fond: BLANC, trait: teinte }
    : { fond: teinte, trait: ENCRE };
}

/**
 * L'encre du monogramme de repli posé sur la teinte de l'outil · blanche, sauf
 * teinte trop pâle (même seuil mesuré que `pastilleLogo`).
 */
export function encreMonogramme(hex: string): string {
  return HEX.test(hex) && contrasteWcag(hex, BLANC) < SEUIL_CONTRASTE_PASTILLE ? ENCRE : '#fff';
}
