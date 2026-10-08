/**
 * Studios · L4 · ce qu'on IMPORTE d'une source (cahier 01 §4.2 point 5).
 *
 * Pur. « Importer la structure utile et les contraintes, pas le produit, la
 * marque ou les allégations du concurrent. »
 *
 *  · `structureImportable` ne lit QUE la forme : média, présence d'une accroche
 *    écrite, d'un appel à l'action, format classé. Jamais le texte, le nom, le
 *    domaine ni les chiffres de l'annonceur.
 *  · `exclusionsSource` nomme explicitement ce qui ne passe pas (l'annonceur,
 *    son produit, ses allégations, ses mots).
 *  · `fuitesConcurrent` est la GARDE : elle relit les champs importables d'un
 *    brief et signale toute trace de l'annonceur (nom, domaine) ou toute suite
 *    de mots recopiée de son texte.
 */

import type { SourceReferenceStudio } from './reference';

export interface StructureImportee {
  composition: string;
  formats: string[];
  contraintes: string[];
  exclusions: string[];
}

export const CONTRAINTES_IMPORT: readonly string[] = [
  'Produit, marque et allégations : uniquement ceux de la marque cible.',
  'Une seule variable change par rapport au témoin.',
];

/** Les exclusions d'une source · ce que le projet ne reprend jamais. */
export function exclusionsSource(s: Pick<SourceReferenceStudio, 'annonceur'>): string[] {
  const qui = s.annonceur.trim() || 'l’annonceur source';
  return [
    `Nom, logo et identité visuelle de ${qui}.`,
    `Produit et packaging de ${qui}.`,
    `Allégations, chiffres et promesses de ${qui}.`,
    'Reprise mot pour mot du texte de la source.',
  ];
}

export function structureImportable(sources: readonly SourceReferenceStudio[]): StructureImportee {
  const elements: string[] = [];
  const formats = new Set<string>();
  for (const s of sources) {
    if (s.modalites.includes('video')) formats.add('Vidéo');
    else if (s.modalites.includes('image')) formats.add('Visuel fixe');
    if (s.observations.some((o) => o.element === 'accroche')) elements.push('accroche écrite en ouverture');
    if (s.observations.some((o) => o.element === 'cta')) elements.push('appel à l’action explicite');
    if (s.format) elements.push(`format « ${s.format.libelle} »`);
  }
  const uniques = [...new Set(elements)];
  const media = [...formats];
  const composition = media.length || uniques.length
    ? `Structure observée à adapter : ${[media.join(' ou ').toLowerCase(), ...uniques].filter(Boolean).join(' · ')}.`
    : '';
  const exclusions = [...new Set(sources.flatMap((s) => exclusionsSource(s)))];
  return { composition, formats: media, contraintes: [...CONTRAINTES_IMPORT], exclusions };
}

const normaliser = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Longueur d'une suite de mots recopiée à partir de laquelle on parle de reprise. */
export const SUITE_RECOPIEE_MOTS = 6;

function suites(texte: string, n: number): Set<string> {
  const mots = normaliser(texte).split(' ').filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= mots.length; i++) out.add(mots.slice(i, i + n).join(' '));
  return out;
}

export interface ChampImportable { chemin: string; texte: string }

/**
 * Signale, dans les champs importables, le nom ou le domaine d'un annonceur
 * source et toute suite de `SUITE_RECOPIEE_MOTS` mots de son extrait.
 */
export function fuitesConcurrent(champs: readonly ChampImportable[], sources: readonly SourceReferenceStudio[]): Array<{ chemin: string; raison: string }> {
  const out: Array<{ chemin: string; raison: string }> = [];
  for (const s of sources) {
    const nom = normaliser(s.annonceur);
    const domaine = normaliser(s.observations.find((o) => o.element === 'lien')?.claim.match(/\(([^)]+)\)/)?.[1] ?? '');
    const recopie = suites(s.extraitAutorise, SUITE_RECOPIEE_MOTS);
    for (const c of champs) {
      const t = ` ${normaliser(c.texte)} `;
      if (nom.length >= 3 && t.includes(` ${nom} `)) out.push({ chemin: c.chemin, raison: 'reprend le nom de l’annonceur source' });
      else if (domaine.length >= 4 && t.includes(` ${domaine} `)) out.push({ chemin: c.chemin, raison: 'reprend le domaine de l’annonceur source' });
      else if ([...suites(c.texte, SUITE_RECOPIEE_MOTS)].some((x) => recopie.has(x))) out.push({ chemin: c.chemin, raison: 'recopie le texte de la source' });
    }
  }
  return out;
}
