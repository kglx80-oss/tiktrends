import { ANGLE_KEYS, ANGLE_LABEL, median, type AngleKey } from '../../angles';

/**
 * Spatial · « Ce qui scale » · les outils de l'ancien swipe file portés sur
 * l'écran de la maquette (vague 3) · RÈGLES PURES. Filtrer (type, annonceur,
 * angle, texte), trier (la DURÉE d'abord, comme la maquette · puis croissance,
 * reach, dépense estimée), relire et écrire ces critères dans l'adresse,
 * résumer la niche et proposer des requêtes à copier. Ni base, ni réseau.
 */

export type TypeOutilScale = 'all' | 'video' | 'static';
export type TriOutilScale = 'duration' | 'growth' | 'reach' | 'spend';
export interface FiltresOutilScale { type: TypeOutilScale; annonceur: string; angle: string; texte: string; tri: TriOutilScale }
export const FILTRES_OUTIL_SCALE: FiltresOutilScale = { type: 'all', annonceur: 'all', angle: 'all', texte: '', tri: 'duration' };

export const TRIS_OUTIL_SCALE: ReadonlyArray<{ cle: TriOutilScale; libelle: string }> = [
  { cle: 'duration', libelle: 'Durée de diffusion' },
  { cle: 'growth', libelle: 'Croissance reach 30 j' },
  { cle: 'reach', libelle: 'Reach' },
  { cle: 'spend', libelle: 'Dépense estimée' },
];
const TYPES: readonly TypeOutilScale[] = ['all', 'video', 'static'];

/** Ce que l'outil sait d'une ligne · tout vient de la source (jamais estimé ici). */
export interface DonneesOutilScale { video: boolean; annonceur: string; angle: AngleKey; texte: string; jours: number; croissance: number; reach: number; depense: number }

/** Relit les critères de l'adresse · une valeur hors liste retombe sur le défaut. */
export function lireOutilsScale(p: Record<string, string | string[] | undefined>, admis: { annonceurs: readonly string[]; angles: readonly string[] }): FiltresOutilScale {
  const un = (k: string) => { const v = p[k]; return typeof v === 'string' ? v : undefined; };
  const type = un('type'); const tri = un('tri'); const ann = un('annonceur'); const ang = un('angle');
  return {
    type: TYPES.includes(type as TypeOutilScale) ? type as TypeOutilScale : 'all',
    annonceur: ann && admis.annonceurs.includes(ann) ? ann : 'all',
    angle: ang && admis.angles.includes(ang) ? ang : 'all',
    texte: (un('texte') ?? '').slice(0, 200),
    tri: TRIS_OUTIL_SCALE.some((t) => t.cle === tri) ? tri as TriOutilScale : 'duration',
  };
}

/** Écrit les critères dans une recherche d'adresse · le défaut n'est pas écrit, le reste est gardé. */
export function ecrireOutilsScale(recherche: string, f: FiltresOutilScale): string {
  const p = new URLSearchParams(recherche);
  const poser = (k: string, v: string | null) => { if (v) p.set(k, v); else p.delete(k); };
  poser('type', f.type !== 'all' ? f.type : null);
  poser('annonceur', f.annonceur !== 'all' ? f.annonceur : null);
  poser('angle', f.angle !== 'all' ? f.angle : null);
  poser('texte', f.texte.trim() ? f.texte : null);
  poser('tri', f.tri !== 'duration' ? f.tri : null);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Filtre puis trie · le tri réordonne, il ne retire rien. */
export function filtrerOutilsScale<T extends { o: DonneesOutilScale }>(lignes: readonly T[], f: FiltresOutilScale): T[] {
  const q = f.texte.trim().toLowerCase();
  const garde = lignes.filter(({ o }) =>
    (f.type === 'all' || (f.type === 'video') === o.video)
    && (f.annonceur === 'all' || o.annonceur === f.annonceur)
    && (f.angle === 'all' || o.angle === f.angle)
    && (!q || `${o.texte} ${o.annonceur}`.toLowerCase().includes(q)));
  const cle: Record<TriOutilScale, (o: DonneesOutilScale) => number> = { duration: (o) => o.jours, growth: (o) => o.croissance, reach: (o) => o.reach, spend: (o) => o.depense };
  return [...garde].sort((a, b) => cle[f.tri](b.o) - cle[f.tri](a.o));
}

/** Les critères actifs (ceux qui RÉDUISENT la liste) · une puce retirable chacun. */
export function criteresOutilsScale(f: FiltresOutilScale): Array<{ cle: 'type' | 'annonceur' | 'angle' | 'texte'; libelle: string }> {
  const out: Array<{ cle: 'type' | 'annonceur' | 'angle' | 'texte'; libelle: string }> = [];
  if (f.type !== 'all') out.push({ cle: 'type', libelle: f.type === 'video' ? 'Vidéos' : 'Statiques' });
  if (f.annonceur !== 'all') out.push({ cle: 'annonceur', libelle: f.annonceur });
  if (f.angle !== 'all') out.push({ cle: 'angle', libelle: ANGLE_LABEL[f.angle as AngleKey] ?? f.angle });
  if (f.texte.trim()) out.push({ cle: 'texte', libelle: `« ${f.texte.trim()} »` });
  return out;
}

/** Les angles présents dans la niche, dans l'ordre du noyau. */
export const anglesPresentsScale = (lignes: ReadonlyArray<{ o: DonneesOutilScale }>) => {
  const s = new Set(lignes.map((l) => l.o.angle));
  return ANGLE_KEYS.filter((k) => s.has(k)).map((k) => ({ cle: k, libelle: ANGLE_LABEL[k] }));
};

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '').replace('.', ',')} k` : String(Math.round(n)));

/** Le résumé de la niche · chiffres de la source, médianes calculées ici. */
export function statsOutilsScale(lignes: ReadonlyArray<{ o: DonneesOutilScale }>): Array<{ libelle: string; valeur: string }> {
  const o = lignes.map((l) => l.o);
  return [
    { libelle: 'Créas', valeur: String(o.length) },
    { libelle: 'Vidéos', valeur: String(o.filter((x) => x.video).length) },
    { libelle: 'Annonceurs', valeur: String(new Set(o.map((x) => x.annonceur)).size) },
    { libelle: 'Dépense estimée cumulée', valeur: `${Math.round(o.reduce((n, x) => n + x.depense, 0)).toLocaleString('fr-FR')} €` },
    { libelle: 'Croissance médiane 30 j', valeur: compact(median(o.map((x) => x.croissance))) },
    { libelle: 'Durée médiane', valeur: `${median(o.map((x) => x.jours))} j` },
  ];
}

/** Six requêtes de veille prêtes à copier, pour continuer seul sur la niche. */
export function requetesOutilsScale(niche: string, pays: string): string[] {
  const n = niche.trim() || 'ma niche';
  return [
    `Montre-moi les créas ${n} en plus forte croissance de reach sur 30 jours en ${pays}, plafonnées à 3 par marque.`,
    `Classe les angles dominants des créas ${n} (témoignage, preuve sociale, réponse à l’objection…) et dis-moi lesquels personne n’exploite encore.`,
    `Donne-moi le copy intégral des 5 meilleures créas ${n} qui utilisent la preuve sociale.`,
    `Quelles marques ${n} lancent des créas depuis moins de 30 jours avec une forte croissance ? Résume leur hook.`,
    `Compare la durée de diffusion médiane par angle pour ${n} : quel angle tient le plus longtemps ?`,
    `À partir des créas ${n} qui scalent, propose-moi 3 concepts de vidéo originaux pour ma marque.`,
  ];
}
