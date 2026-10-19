/**
 * Studios · L5 · PROVENANCE ET DROITS d'un média (`studio_assets.rights`,
 * jsonb · DB:1406). Contrôle V5 « Provenance et droits » (select) de la pop-up
 * photo produit et de la fiche média (inventaire L14 / L54 / A19, défaut F3).
 *
 * Pur · ni base, ni réseau, ni modèle.
 *
 * ── Ce qui se saisit ─────────────────────────────────────────────────────────
 *
 *  · une LICENCE, choisie dans l'énumération DÉJÀ posée par la présentation V5
 *    (L14) : « Photo de la marque », « UGC avec accord », « Banque d'images »,
 *    « À préciser ». Rien n'est réinventé ; `a_preciser` est le défaut honnête,
 *    jamais une licence déduite.
 *  · une SOURCE libre et bornée (d'où vient le média, le contrat, l'auteur) ·
 *    facultative, nettoyée, jamais crue au-delà de `SOURCE_DROITS_MAX`.
 *
 * ── La décision d'usage qui en découle ───────────────────────────────────────
 *
 * La seule règle d'usage ici est de SAVOIR si la provenance est renseignée :
 * `a_preciser` (ou un `rights` vide) veut dire « droits à préciser », et
 * l'écran le dit. On ne bloque aucune génération sur cette base (ce serait un
 * changement de comportement, hors mandat) : on l'AFFICHE et on le TRACE.
 */

export type LicenceAsset = 'marque' | 'ugc_accord' | 'banque_images' | 'a_preciser';

export const LICENCES_ASSET: readonly LicenceAsset[] = ['marque', 'ugc_accord', 'banque_images', 'a_preciser'];

/** Le défaut honnête · aucune licence n'est jamais déduite d'un média. */
export const LICENCE_ASSET_DEFAUT: LicenceAsset = 'a_preciser';

export const LIBELLES_LICENCE_ASSET: Readonly<Record<LicenceAsset, string>> = {
  marque: 'Photo de la marque',
  ugc_accord: 'UGC avec accord',
  banque_images: 'Banque d’images',
  a_preciser: 'À préciser',
};

/** Longueur maximale de la note de source · une référence, pas une archive. */
export const SOURCE_DROITS_MAX = 500;

export const estLicenceAsset = (x: unknown): x is LicenceAsset =>
  typeof x === 'string' && (LICENCES_ASSET as readonly string[]).includes(x);

/**
 * Les droits tels qu'ils vivent dans `studio_assets.rights`. Un `rights` vide
 * (`{}`, le défaut de la colonne) se lit comme « non renseigné » (`null`),
 * jamais comme une licence `a_preciser` posée par quelqu'un.
 */
export interface DroitsAsset {
  licence: LicenceAsset;
  /** Note de provenance libre, bornée · `''` quand rien n'est précisé. */
  source: string;
  /** Qui a posé ces droits (identifiant utilisateur), ou `null`. */
  posePar: string | null;
  /** Quand (ISO 8601), ou `null`. */
  poseLe: string | null;
}

const texteBorne = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

export interface SaisieDroitsAsset { licence: unknown; source?: unknown }

export type ResultatDroitsAsset =
  | { ok: true; droits: DroitsAsset }
  | { ok: false; raison: string };

/**
 * Normalise une saisie en droits stockables · la licence doit être l'une des
 * quatre, la source est nettoyée et bornée. `posePar`/`poseLe` viennent du
 * serveur, jamais du client.
 */
export function normaliserDroitsAsset(entree: SaisieDroitsAsset, o: { posePar: string; poseLe: Date }): ResultatDroitsAsset {
  if (!estLicenceAsset(entree?.licence)) {
    return { ok: false, raison: `licence parmi ${LICENCES_ASSET.join(', ')}` };
  }
  return {
    ok: true,
    droits: {
      licence: entree.licence,
      source: texteBorne(entree.source, SOURCE_DROITS_MAX),
      posePar: o.posePar,
      poseLe: o.poseLe.toISOString(),
    },
  };
}

/**
 * Relit un `rights` stocké (jsonb) · `{}` ou toute forme sans licence valide
 * rend `null` (« non renseigné »), jamais une valeur « réparée » en silence.
 */
export function lireDroitsAsset(x: unknown): DroitsAsset | null {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null;
  const r = x as Partial<DroitsAsset>;
  if (!estLicenceAsset(r.licence)) return null;
  return {
    licence: r.licence,
    source: typeof r.source === 'string' ? r.source.slice(0, SOURCE_DROITS_MAX) : '',
    posePar: typeof r.posePar === 'string' ? r.posePar : null,
    poseLe: typeof r.poseLe === 'string' && !Number.isNaN(Date.parse(r.poseLe)) ? r.poseLe : null,
  };
}

/**
 * La provenance est-elle renseignée ? Non renseignée (`null`) ou `a_preciser`
 * ⇒ « droits à préciser ». C'est la décision d'usage portée par ce module :
 * elle sert l'affichage et la trace, elle ne bloque rien.
 */
export function provenanceRenseignee(d: DroitsAsset | null): boolean {
  return d !== null && d.licence !== 'a_preciser';
}

/** Le libellé affiché des droits d'un média · « Droits à préciser » par défaut. */
export function libelleDroitsAsset(d: DroitsAsset | null): string {
  if (!provenanceRenseignee(d)) return 'Droits à préciser';
  return LIBELLES_LICENCE_ASSET[d!.licence];
}
