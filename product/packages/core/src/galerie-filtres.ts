/**
 * La barre de filtres locale d'une galerie · quoi garder, dans quel ordre.
 *
 * Une galerie de plusieurs dizaines de pubs sans filtre local oblige à tout
 * balayer à l'œil · on ne retrouve pas « la prête au format témoignage », on la
 * cherche. La règle — quels critères filtrent, comment on trie, ce que le résumé
 * annonce — est une DÉCISION pure · elle vit au noyau, éprouvable sans rendu.
 *
 * Le noyau ne connaît NI `AdItem`, NI le rendu · il reçoit des items déjà
 * réduits à leurs axes discrets (titre, format, date, état qualité, état
 * performance) et rend l'ordre filtré. L'écran dérive ces axes (via
 * `qualiteCarte`, le verdict) et réaffiche ses cartes dans cet ordre.
 */

export type CritereQualite = 'toutes' | 'prete' | 'a_verifier' | 'a_revoir' | 'non_verifiee';
export type CriterePerf = 'toutes' | 'gagnante' | 'en_mesure' | 'inconnue';
export type CritereTri = 'recent' | 'ancien' | 'titre';

export interface CriteresGalerie {
  /** Recherche libre sur le titre · vide = tout. */
  recherche: string;
  /** Un format (gabarit) précis, ou « toutes ». */
  format: string;
  qualite: CritereQualite;
  performance: CriterePerf;
  tri: CritereTri;
}

/** Un item réduit à ses axes filtrables · l'écran le dérive de sa pub. */
export interface ItemGalerie {
  id: string;
  titre: string;
  /** Le gabarit, tel qu'il sera comparé à `criteres.format`. */
  format: string;
  /** Date ISO · sert au tri chronologique. */
  date: string;
  qualite: Exclude<CritereQualite, 'toutes'>;
  /** Le bucket de performance de l'item · « autre » (perdante, prometteuse…) ne
   *  correspond à aucun filtre précis, seulement à « toutes ». */
  performance: Exclude<CriterePerf, 'toutes'> | 'autre';
}

export const CRITERES_DEFAUT: CriteresGalerie = {
  recherche: '', format: 'toutes', qualite: 'toutes', performance: 'toutes', tri: 'recent',
};

function normaliser(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

/** Combien de critères sont ACTIFS · le tri par défaut (récent) ne compte pas. */
export function criteresActifs(c: CriteresGalerie): number {
  let n = 0;
  if (normaliser(c.recherche)) n++;
  if (c.format !== 'toutes') n++;
  if (c.qualite !== 'toutes') n++;
  if (c.performance !== 'toutes') n++;
  if (c.tri !== 'recent') n++;
  return n;
}

/**
 * Les items retenus par les critères, dans l'ordre du tri. Un critère à
 * « toutes » ne filtre rien · la recherche vide non plus (on ne cache rien sans
 * raison). Le tri est STABLE à valeur égale · l'ordre d'entrée est préservé.
 */
export function filtrerTriGalerie<T extends ItemGalerie>(items: readonly T[], c: CriteresGalerie): T[] {
  const q = normaliser(c.recherche);
  const gardes = items.filter((it) =>
    (!q || normaliser(it.titre).includes(q))
    && (c.format === 'toutes' || it.format === c.format)
    && (c.qualite === 'toutes' || it.qualite === c.qualite)
    && (c.performance === 'toutes' || it.performance === c.performance),
  );
  // On indexe pour un tri stable · `sort` ne l'est pas garanti sur tous les
  // moteurs à clé égale, et un ordre qui saute est pire que pas de tri.
  const avecRang = gardes.map((it, i) => ({ it, i }));
  avecRang.sort((a, b) => {
    if (c.tri === 'titre') { const t = normaliser(a.it.titre).localeCompare(normaliser(b.it.titre)); if (t !== 0) return t; }
    else { const d = a.it.date.localeCompare(b.it.date); const s = c.tri === 'ancien' ? d : -d; if (s !== 0) return s; }
    return a.i - b.i;
  });
  return avecRang.map((x) => x.it);
}

const QUALITE_LABEL: Record<Exclude<CritereQualite, 'toutes'>, string> = {
  prete: 'Prête à diffuser', a_verifier: 'À vérifier', a_revoir: 'À revoir', non_verifiee: 'Non vérifiée',
};
const PERF_LABEL: Record<Exclude<CriterePerf, 'toutes'>, string> = {
  gagnante: 'Gagnante', en_mesure: 'En mesure', inconnue: 'Performance inconnue',
};
const TRI_LABEL: Record<CritereTri, string> = {
  recent: 'Plus récentes', ancien: 'Plus anciennes', titre: 'Titre (A→Z)',
};

/**
 * Le résumé des critères ACTIFS · une phrase courte, pour qu'on voie ce qui est
 * en jeu sans relire chaque contrôle. Vide quand rien n'est actif. Le libellé de
 * format vient de l'écran (il connaît ses gabarits).
 */
export function resumeCriteres(c: CriteresGalerie, formatLabel: (f: string) => string): string {
  const bouts: string[] = [];
  if (normaliser(c.recherche)) bouts.push(`« ${c.recherche.trim()} »`);
  if (c.format !== 'toutes') bouts.push(formatLabel(c.format));
  if (c.qualite !== 'toutes') bouts.push(QUALITE_LABEL[c.qualite]);
  if (c.performance !== 'toutes') bouts.push(PERF_LABEL[c.performance]);
  if (c.tri !== 'recent') bouts.push(TRI_LABEL[c.tri]);
  return bouts.join(' · ');
}
