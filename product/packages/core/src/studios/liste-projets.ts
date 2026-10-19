import { LIBELLES_ETAPE, type EtapeProjet } from './brief';
import { ORDRE_ETAPES_PROJET } from '../accueil-v5';

/**
 * Studios · liste des projets · la règle de la rangée de filtres et de la
 * recherche, PURE (ni base, ni réseau), donc testable et jamais découverte
 * cassée en cliquant.
 *
 * ── Honnêteté des filtres ─────────────────────────────────────────────────────
 *
 * Le prototype V5 montre des filtres de « statut » (En cours / En revue /
 * Brouillons / Archivés). Dans le code réel, `studio_projects.status` ne vaut
 * que `active` ou `archived`, et la liste ne charge que les actifs · cette
 * taxonomie n'existe pas. L'axe RÉEL d'un projet est son ÉTAPE
 * (`brief_a_completer` / `brief_pret` / `production`). On copie donc la
 * STRUCTURE de la rangée (chips + compteurs), avec les étapes réelles et des
 * compteurs réels, sans inventer de statut fictif.
 */

export type CleFiltreProjet = 'tous' | EtapeProjet;

export interface OptionFiltreProjet {
  cle: CleFiltreProjet;
  libelle: string;
  /** Combien de cartes tombent dans ce filtre · 0 compris (le chip reste, honnête). */
  n: number;
}

/**
 * Forme MINIMALE d'une carte dont dépend le filtrage · le reste de la carte
 * (manques, date, sources…) n'entre pas dans la règle.
 */
export interface ProjetFiltrable {
  etape: EtapeProjet;
  title: string;
  marque: string;
  libelleType: string;
}

/**
 * Les options de la rangée de filtres · « Tous » puis chaque étape dans son
 * ordre canonique, chacune avec son compteur réel.
 */
export function compteursFiltreProjets(cartes: readonly ProjetFiltrable[]): OptionFiltreProjet[] {
  const options: OptionFiltreProjet[] = [{ cle: 'tous', libelle: 'Tous', n: cartes.length }];
  for (const e of ORDRE_ETAPES_PROJET) {
    options.push({ cle: e, libelle: LIBELLES_ETAPE[e], n: cartes.reduce((t, c) => t + (c.etape === e ? 1 : 0), 0) });
  }
  return options;
}

/** Minuscules, accents retirés, espaces resserrés · pour une recherche tolérante. */
function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Filtre client PUR · par étape (ou « tous ») ET par recherche libre sur le
 * titre, la marque et le type. L'ordre d'entrée est conservé. Ne touche à aucune
 * donnée serveur · il ne filtre que des cartes déjà chargées sous leur droit.
 */
export function filtrerProjets<T extends ProjetFiltrable>(
  cartes: readonly T[],
  f: { cle: CleFiltreProjet; recherche: string },
): T[] {
  const q = normaliser(f.recherche);
  return cartes.filter((c) => {
    if (f.cle !== 'tous' && c.etape !== f.cle) return false;
    if (!q) return true;
    return normaliser(`${c.title} ${c.marque} ${c.libelleType}`).includes(q);
  });
}
