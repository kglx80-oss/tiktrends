import { appendFileSync } from 'node:fs';
import { act } from 'react';

/**
 * Attendre un ÉTAT, jamais une durée.
 *
 * Une attente fixe (« 400 ms puis on lit la base ») parie sur la vitesse de la machine · au repos
 * elle passe, sous charge (portes complètes, suite web en parallèle) elle perd une fois de temps en
 * temps, sans rapport avec le diff. `attendreEtat` sonde la condition que le test attend vraiment,
 * à intervalle régulier, jusqu'à une borne · et, avec `stabilite`, exige qu'elle TIENNE plusieurs
 * sondages d'affilée (un état atteint puis défait n'est pas un état).
 *
 * La sonde rend une valeur · vraie, la condition est tenue · fausse, ou une exception (un `expect`
 * qui tombe, une ligne absente), elle ne l'est pas encore. Le message d'échec nomme la condition,
 * le temps écoulé, le nombre de sondages et le DERNIER constat (le message de l'`expect` ou la
 * valeur rendue) · on sait ce qui manquait, pas seulement que c'était lent.
 *
 * Borne par défaut · MESURÉE (`BORNE_ATTENTE_MS`, tableau ci-dessous), jamais posée de tête.
 */

/**
 * Délai entre le geste et l'état attendu, en ms, compté APRÈS l'`act` du clic (là où commençait
 * l'ancienne attente fixe de 400 ms), pour les trois `demander` Jarvis (envoi d'une question, réponse
 * écrite en base, fil relu · base pglite réelle) · journal de cet utilitaire (`ATTENDRE_ETAT_JOURNAL`),
 * les trois fichiers ensemble en boucle, 21/11/2026, machine de 4 cœurs :
 *
 *   régime                                           passages    n    p50   p90   p99   max
 *   au repos                                              4      56     2     6    22    26
 *   12 boucles CPU actives                                6      84     2    51    81    91
 *   suite web en parallèle + 12 boucles CPU               6      84     2    43    62    74
 *
 * Les autres états de ces fichiers, même régimes · pire mesuré : montage stable 726 ms (p99 479,
 * sous 12 boucles CPU), relectures du contexte du tiroir 120 ms, validation d'un verdict 230 ms,
 * itération créée 40 ms, question du tiroir partie 28 ms.
 *
 * Ancienne attente fixe (400 ms) · 0 échec sur 18 passages de 34 tests (4 + 6 + 6 + 2) · elle
 * passait ici avec une marge de 4, mais restait un PARI sur la machine · une route ralentie de
 * 600 ms la fait tomber à coup sûr (« Cannot read properties of undefined »), l'attente d'état non.
 * La borne ne sert qu'à CONCLURE quand l'état ne vient pas (le défaut revient) · 10 s, plus de
 * treize fois le pire délai mesuré (726 ms), sous la limite de 30 s par test (`vitest.config.mts`).
 */
export const BORNE_ATTENTE_MS = 10_000;

/** Intervalle par défaut entre deux sondages, en ms. */
export const INTERVALLE_ATTENTE_MS = 10;

/**
 * Une ABSENCE (« rien ne part tout seul ») ne se constate que dans la durée · l'état doit tenir
 * `SONDAGES_ABSENCE` sondages d'affilée à l'intervalle par défaut, soit 200 ms dans `act` (moins
 * de 1 ms près, le grain des minuteries).
 * La fenêtre couvre le délai MESURÉ du geste positif correspondant (une question envoyée jusqu'à
 * la réponse écrite et le fil relu · pire 91 ms, tableau ci-dessus) plus de deux fois.
 */
export const SONDAGES_ABSENCE = 21;

export interface OptionsAttente {
  /** Au-delà, la condition est déclarée non atteinte · défaut `BORNE_ATTENTE_MS`. */
  borneMs?: number;
  /** Entre deux sondages · défaut `INTERVALLE_ATTENTE_MS`. */
  intervalleMs?: number;
  /**
   * Nombre de sondages CONSÉCUTIFS où la condition doit tenir · défaut 1 (la première fois
   * suffit). Avec N, l'état tient au moins (N - 1) × intervalle, au grain des minuteries près
   * (moins de 1 ms en tout, mesuré dans `attendre-etat.test.ts`) · un état atteint puis défait
   * remet le compte à zéro.
   */
  stabilite?: number;
  /**
   * Comment laisser passer le temps entre deux sondages · défaut, un `setTimeout`. Pour un arbre
   * React monté, `pasDansAct` · les mises à jour en file sont rendues avant le sondage suivant.
   */
  pas?: (ms: number) => Promise<unknown>;
  /**
   * Pour une ABSENCE (« plus aucune requête », « rien ne part tout seul ») · la condition doit être
   * vraie dès le premier sondage et le rester · le premier sondage faux échoue TOUT DE SUITE
   * (« violée »), au lieu d'attendre la borne. Sans effet sur un état qu'on attend de voir venir.
   */
  echecImmediat?: boolean;
}

export interface EtatAtteint {
  /** Du premier sondage au sondage qui conclut, en ms. */
  ms: number;
  /** Sondages effectués. */
  sondages: number;
}

const dormir = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });

/** Laisse passer `ms` dans `act` · React rend ce qui est en file, effets compris, avant de rendre la main. */
export const pasDansAct = (ms: number) => act(async () => { await dormir(ms); });

function constat(v: unknown): string {
  if (v instanceof Error) return v.message.split('\n')[0]!;
  try { return JSON.stringify(v) ?? String(v); } catch { return String(v); }
}

/**
 * Sonde `sonde` jusqu'à ce que la condition `condition` (dite en clair, elle apparaît dans le
 * message d'échec) tienne `stabilite` sondages d'affilée, ou que `borneMs` soit écoulé.
 */
export async function attendreEtat(condition: string, sonde: () => unknown, options: OptionsAttente = {}): Promise<EtatAtteint> {
  const borne = options.borneMs ?? BORNE_ATTENTE_MS;
  const intervalle = options.intervalleMs ?? INTERVALLE_ATTENTE_MS;
  const stabilite = Math.max(1, Math.floor(options.stabilite ?? 1));
  const pas = options.pas ?? dormir;
  if ((stabilite - 1) * intervalle >= borne) throw new Error(`attendreEtat · « ${condition} » · ${stabilite} sondages toutes les ${intervalle} ms ne tiennent pas sous la borne de ${borne} ms`);
  const debut = performance.now();
  let sondages = 0;
  let tenus = 0;
  let meilleur = 0;
  let dernier: unknown = undefined;
  for (;;) {
    sondages += 1;
    let ok = false;
    try {
      const v = await sonde();
      ok = !!v;
      if (!ok) dernier = v;
    } catch (e) {
      dernier = e;
    }
    tenus = ok ? tenus + 1 : 0;
    meilleur = Math.max(meilleur, tenus);
    const ms = performance.now() - debut;
    if (!ok && options.echecImmediat) {
      throw new Error(`attendreEtat · « ${condition} » violée au sondage ${sondages}/${stabilite}, après ${Math.round(ms)} ms (toutes les ${intervalle} ms) · constat : ${constat(dernier)}`, { cause: dernier });
    }
    if (tenus >= stabilite) {
      journaliser(condition, ms, sondages);
      return { ms, sondages };
    }
    if (ms >= borne) {
      const tenue = stabilite > 1 ? ` · tenue au mieux ${meilleur}/${stabilite} sondages d’affilée` : '';
      const vu = tenus > 0 ? `tenue, pas assez longtemps${dernier === undefined ? '' : ` (perdue sur : ${constat(dernier)})`}` : constat(dernier);
      // `cause` · le dernier constat tel quel (l'erreur de l'`expect`, avec sa pile), pas seulement sa première ligne.
      throw new Error(`attendreEtat · « ${condition} » non atteinte en ${Math.round(ms)} ms (${sondages} sondages, toutes les ${intervalle} ms)${tenue} · dernier constat : ${vu}`, { cause: dernier });
    }
    await pas(intervalle);
  }
}

/**
 * Sonde « le DOM est rendu et n'a pas bougé depuis le sondage précédent » · pour un montage, l'état
 * attendu est un arbre RENDU (non vide) qui ne change plus · avec `stabilite: n`, il doit rester
 * identique sur n + 1 lectures. Un rendu tardif (une réponse qui arrive, un effet qui réécrit)
 * remet le compte à zéro. Chaque appel rend une sonde neuve, qui garde sa propre lecture précédente.
 */
export function sondeDomInchange(racine: () => Element | null = () => document.body) {
  let avant: string | null = null;
  return () => {
    const html = racine()?.innerHTML ?? '';
    const ok = html !== '' && html === avant;
    avant = html;
    return ok;
  };
}

/** Le montage d'une page · rendu, puis inchangé sur `SONDAGES_MONTAGE` sondages dans `act`. */
export const SONDAGES_MONTAGE = 3;
/**
 * Le montage dans `#app` · `#app` doit porter un rendu (un composant qui rend `null` n'est pas
 * « monté »), puis tout le document (`#app` et les surcouches portées ailleurs, `#orn`) ne doit
 * plus bouger. `document.body` seul ne suffit pas · il n'est jamais vide (`#app`, `#orn`).
 */
export function attendreMontageStable(racine: () => Element | null = () => document.getElementById('app'), borneMs = BORNE_ATTENTE_MS) {
  const inchange = sondeDomInchange();
  return attendreEtat('la page montée est rendue (#app non vide) et ne bouge plus', () => {
    const rendu = !!racine()?.innerHTML;
    const stable = inchange();
    return rendu && stable;
  }, { pas: pasDansAct, stabilite: SONDAGES_MONTAGE, borneMs });
}

/** Une ABSENCE · vraie d'emblée, tenue `SONDAGES_ABSENCE` sondages dans `act`, violée ⇒ échec immédiat. */
export const attendreAbsence = (condition: string, sonde: () => unknown) => attendreEtat(condition, sonde, { pas: pasDansAct, stabilite: SONDAGES_ABSENCE, echecImmediat: true });

/**
 * Mesure · si `ATTENDRE_ETAT_JOURNAL` nomme un fichier, chaque état atteint y ajoute une ligne
 * « délai en ms <TAB> sondages <TAB> condition ». Sert à écrire les tableaux mesurés · inerte sinon.
 */
function journaliser(condition: string, ms: number, sondages: number) {
  const f = process.env.ATTENDRE_ETAT_JOURNAL;
  if (!f) return;
  try { appendFileSync(f, `${ms.toFixed(1)}\t${sondages}\t${condition}\n`); } catch { /* la mesure ne casse jamais un test */ }
}
