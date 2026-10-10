/**
 * Studios · la direction artistique de la marque, déjà saisie dans l'outil,
 * transmise aux tâches Studios.
 *
 * Pur · ni base, ni réseau, ni modèle.
 *
 * ── Le défaut réparé ─────────────────────────────────────────────────────────
 *
 * Pubs IA et Image IA injectent les règles maison (`creativeRules`), la DA
 * visuelle (`brandKit`), la description, la promesse et le ton dans chaque
 * génération. Les tâches Studios, elles, ne recevaient RIEN de la marque : une
 * consigne image ou un brief Studios ignorait ce que l'équipe avait déjà écrit.
 *
 * ── Ce que ce module tranche ─────────────────────────────────────────────────
 *
 *  · QUELS champs : ceux de `brands` qui disent la DA (règles créatives, DA
 *    visuelle, description, promesse, audience, ton, catégorie, couleurs,
 *    polices, mots à privilégier, mots à éviter). Les jetons, connecteurs et
 *    indicateurs n'en font pas partie.
 *  · Un champ VIDE (absent, blanc, liste vide) est ignoré · aucune ligne
 *    « Ton : » sans valeur. Rien du tout → `null` : la tâche ne reçoit pas un
 *    bloc creux.
 *  · L'ORDRE est une priorité : les règles créatives d'abord (ce que l'équipe
 *    impose), puis la DA visuelle, puis le reste. Si le total dépasse la borne,
 *    c'est la fin qui est coupée, en le disant.
 *  · Le texte part comme DONNÉE (`untrusted_data`, extrait de connaissance),
 *    jamais comme consigne : le contrat des gabarits ne change pas (aucune
 *    variable nouvelle).
 *
 * ── Les bornes, et d'où elles viennent ──────────────────────────────────────
 *
 *  · `DA_REGLES_MAX = 4000` : la borne d'ÉCRITURE des règles maison
 *    (`saveJarvisRulesAction`, `slice(0, 4000)`) · des règles enregistrées ne
 *    sont donc jamais coupées ici.
 *  · `DA_LISTE_MAX = 20` : la borne d'écriture des listes de la fiche marque
 *    (`brand-detail.ts`, `slice(0, 20)`).
 *  · `DA_CHAMP_MAX = 600` : un champ libre (description, promesse…) n'a pas de
 *    borne d'écriture · 600 caractères tiennent quatre à cinq phrases, ce que la
 *    fiche montre ; au-delà, c'est un document, pas une DA.
 *  · `DA_TOTAL_MAX = 6000` : la moitié de `LONGUEUR_MAX_TEXTE` (12 000, la
 *    borne du schéma d'un extrait) · la DA ne prend jamais toute la place des
 *    connaissances publiées, et la somme des bornes ci-dessus (4000 + 10 × 600
 *    + listes) peut la dépasser : la coupe est alors visible.
 */

import { normaliserDaVisuelle, type DaVisuelleMarque } from '../../da-visuelle';
import { empreinteContenu } from '../version';

export const DA_REGLES_MAX = 4000;
export const DA_CHAMP_MAX = 600;
export const DA_LISTE_MAX = 20;
export const DA_TOTAL_MAX = 6000;
export const MARQUE_DA_TRONQUEE = ' [… DA coupée · la suite dépasse la borne]';

/** Ce que la base dit d'une marque · sous-ensemble de la table `brands`. */
export interface MarqueDaBrute {
  name?: string | null;
  creativeRules?: string | null;
  brandKit?: unknown;
  description?: string | null;
  usp?: string | null;
  audience?: string | null;
  tone?: string | null;
  category?: string | null;
  colors?: readonly string[] | null;
  fonts?: readonly string[] | null;
  preferredWords?: readonly string[] | null;
  avoidWords?: readonly string[] | null;
}

export interface ExtraitDaMarque {
  /** Identifiant stable de l'extrait · un par marque. */
  sourceId: string;
  /** Version · empreinte du texte transmis (change dès que la DA change). */
  version: string;
  titre: string;
  text: string;
}

const ligne = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const borne = (t: string, max: number): string => ([...t].length <= max ? t : `${[...t].slice(0, max - 1).join('').trim()}…`);
const liste = (v: unknown): string => (Array.isArray(v) ? v.map(ligne).filter(Boolean).slice(0, DA_LISTE_MAX).map((x) => borne(x, 80)).join(', ') : '');

/** Les règles gardent leurs retours à la ligne (une règle par ligne), sans lignes vides en série. */
function regles(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
}

/**
 * Le texte de DA d'une marque · `null` quand aucun champ n'est renseigné.
 * Chaque champ est borné, puis le total.
 */
export function texteDaMarque(m: MarqueDaBrute): string | null {
  const da = normaliserDaVisuelle((m.brandKit ?? null) as DaVisuelleMarque | null);
  const champs: Array<[string, string]> = [
    ['Règles créatives de la marque', borne(regles(m.creativeRules), DA_REGLES_MAX)],
    ['Style visuel', borne(ligne(da.style), DA_CHAMP_MAX)],
    ['Photographie', borne(ligne(da.photo), DA_CHAMP_MAX)],
    ['Ambiance', borne(ligne(da.ambiance), DA_CHAMP_MAX)],
    ['Lumière', borne(ligne(da.lumiere), DA_CHAMP_MAX)],
    ['Palette en mots', borne(ligne(da.couleurs), DA_CHAMP_MAX)],
    ['À proscrire visuellement', liste(da.aEviter)],
    ['Description', borne(ligne(m.description), DA_CHAMP_MAX)],
    ['Promesse (USP)', borne(ligne(m.usp), DA_CHAMP_MAX)],
    ['Audience', borne(ligne(m.audience), DA_CHAMP_MAX)],
    ['Ton', borne(ligne(m.tone), DA_CHAMP_MAX)],
    ['Catégorie', borne(ligne(m.category), DA_CHAMP_MAX)],
    ['Couleurs', liste(m.colors)],
    ['Polices', liste(m.fonts)],
    ['Mots à privilégier', liste(m.preferredWords)],
    ['Mots à éviter', liste(m.avoidWords)],
  ];
  const lignes = champs.filter(([, v]) => v).map(([k, v]) => (v.includes('\n') ? `${k} :\n${v}` : `${k} : ${v}`));
  if (!lignes.length) return null;
  const nom = ligne(m.name);
  const texte = [`Direction artistique${nom ? ` de « ${borne(nom, 120)} »` : ''}, saisie par l’équipe dans l’outil :`, ...lignes].join('\n');
  const car = [...texte];
  if (car.length <= DA_TOTAL_MAX) return texte;
  return car.slice(0, DA_TOTAL_MAX - [...MARQUE_DA_TRONQUEE].length).join('') + MARQUE_DA_TRONQUEE;
}

/** Identifiant de l'extrait de DA d'une marque · stable, sans URL. */
export const idExtraitDaMarque = (brandId: string): string => `marque_da_${brandId}`;

/**
 * L'extrait de DA prêt à joindre au contexte d'une tâche · `null` sans DA.
 * La version est l'empreinte du texte : la trace dit quelle DA a été lue.
 */
export function extraitDaMarque(brandId: string, m: MarqueDaBrute): ExtraitDaMarque | null {
  const text = texteDaMarque(m);
  if (!text) return null;
  return { sourceId: idExtraitDaMarque(brandId), version: `da-${empreinteContenu({ text }).slice(0, 16)}`, titre: 'Direction artistique de la marque', text };
}
