/**
 * Budget de contexte · ce qui entre dans la requête quand la place manque.
 *
 * ── Ce que ce module tranche ─────────────────────────────────────────────────
 *
 * Cahier §8.3 : « Priorité aux faits produit/invariants/brief validé avant
 * historique conversationnel. Troncature explicite, jamais suppression
 * silencieuse d'un invariant. Si budget insuffisant pour les contraintes
 * obligatoires, bloquer et proposer simplification. » (PROMPT-11)
 *
 *  - OBLIGATOIRE, jamais tronqué : tout le contexte canonique (invariants,
 *    faits, références, documents résolus, sélection, chemins, IDs alloués,
 *    médias joints) et `taskInputs`, plus la réserve des messages fixes.
 *    S'il ne tient pas : `blocked`, avec la liste chiffrée de ce qui pèse et
 *    une proposition de simplification par poste. Rien n'est retiré à la place
 *    de l'utilisateur.
 *  - FACULTATIF, dans cet ordre de priorité : extraits de sources (dans l'ordre
 *    de pertinence fourni par le ContextResolver), extraits de connaissances,
 *    puis résumé d'historique. Chaque élément entre entier, tronqué (avec une
 *    marque visible dans le texte) ou est écarté · chaque décision est
 *    consignée dans le rapport, aucune n'est silencieuse.
 *  - L'historique garde sa FIN (le plus récent) ; un extrait garde son DÉBUT.
 *
 * ── Les seuils ───────────────────────────────────────────────────────────────
 *
 *  - `CARACTERES_PAR_JETON = 3.5` : la conversion déjà en vigueur dans
 *    `spend-guard.ts` (`estimateCallCost`), reprise telle quelle plutôt qu'une
 *    nouvelle valeur posée de tête. Le serveur peut injecter le vrai compteur
 *    du modèle (`compter`) ; le défaut surestime le texte français, ce qui
 *    tronque un peu tôt plutôt que de dépasser.
 *  - `LONGUEUR_MAX_TEXTE = 12000` : `maxLength` du schéma de contrats pour
 *    `historySummary` et le `text` des extraits (vérifié par un test). Au-delà,
 *    la requête serait rejetée par le schéma : on tronque d'abord, en le disant.
 */

import { jsonCanonique } from './empreinte';
import { constat, type Constat, type ContexteTache, type EntreeTache, type Extrait } from './types';

export const CARACTERES_PAR_JETON = 3.5;
export const LONGUEUR_MAX_TEXTE = 12000;
export const MARQUE_FIN_TRONQUEE = ' [… tronqué · la suite n’a pas tenu dans le budget de contexte]';
export const MARQUE_DEBUT_OMIS = '[… début omis · seul le plus récent a tenu dans le budget de contexte] ';

export function compterJetonsParDefaut(texte: string): number {
  return Math.ceil(texte.length / CARACTERES_PAR_JETON);
}

export type ChampFacultatif = 'sourceExcerpts' | 'knowledgeExcerpts' | 'historySummary';

export interface DecisionInclusion {
  champ: ChampFacultatif;
  /** `sourceId@version` pour un extrait, `historySummary` pour l'historique. */
  id: string;
  statut: 'complet' | 'tronque' | 'exclu';
  caracteresOmis: number;
}

export interface PosteObligatoire {
  champ: string;
  jetons: number;
  proposition: string;
}

export interface RapportBudget {
  budgetJetons: number;
  reserveJetons: number;
  jetonsObligatoires: number;
  jetonsUtilises: number;
  decisions: DecisionInclusion[];
  /** Vrai dès qu'un élément facultatif est tronqué ou écarté. */
  troncature: boolean;
}

export type ResultatBudget =
  | { ok: true; entree: EntreeTache; rapport: RapportBudget }
  | { ok: false; statut: 'blocked'; code: 'CONTEXT_BUDGET_INSUFFICIENT'; constats: Constat[]; manqueJetons: number; postes: PosteObligatoire[] };

export interface OptionsBudget {
  /** Jetons disponibles pour toute l'entrée du modèle. */
  budgetJetons: number;
  /** Jetons réservés aux messages fixes (politique, consignes) et à la marge. */
  reserveJetons: number;
  compter?: (texte: string) => number;
}

const PROPOSITIONS: Record<string, string> = {
  resolvedDocuments: 'Retirer de la tâche un document résolu non indispensable, ou traiter la tâche en plusieurs fois.',
  references: 'Limiter la tâche aux références nécessaires à cette étape.',
  facts: 'Ne transmettre que les faits produit utiles à cette étape.',
  invariants: 'Reformuler les invariants plus court · un invariant ne se retire jamais sans validation.',
  mediaBindings: 'Joindre moins de médias, ou des extraits mieux ciblés.',
  taskInputs: 'Raccourcir la demande.',
  autres: 'Réduire la sélection et les chemins autorisés à ceux de cette étape.',
};

function vider(ctx: ContexteTache): ContexteTache {
  return { ...ctx, sourceExcerpts: [], knowledgeExcerpts: [], historySummary: '' };
}

/** Plus long préfixe (ou suffixe) qui tient · recherche dichotomique sur les points de code. */
function ajuster(texte: string, reste: number, cout: (t: string) => number, garderFin: boolean): string | null {
  const car = [...texte];
  const candidat = (k: number) => (garderFin ? MARQUE_DEBUT_OMIS + car.slice(car.length - k).join('') : car.slice(0, k).join('') + MARQUE_FIN_TRONQUEE);
  let bas = 0, haut = car.length - 1, meilleur = -1;
  while (bas <= haut) {
    const milieu = (bas + haut) >> 1;
    if (cout(candidat(milieu)) <= reste) { meilleur = milieu; bas = milieu + 1; } else haut = milieu - 1;
  }
  return meilleur > 0 ? candidat(meilleur) : null;
}

/** Plafonne un texte à la longueur du schéma, en le disant. */
function plafonner(texte: string, garderFin: boolean): { texte: string; omis: number } {
  const car = [...texte];
  if (car.length <= LONGUEUR_MAX_TEXTE) return { texte, omis: 0 };
  const marque = garderFin ? MARQUE_DEBUT_OMIS : MARQUE_FIN_TRONQUEE;
  const garde = LONGUEUR_MAX_TEXTE - [...marque].length;
  return garderFin
    ? { texte: marque + car.slice(car.length - garde).join(''), omis: car.length - garde }
    : { texte: car.slice(0, garde).join('') + marque, omis: car.length - garde };
}

/**
 * Alloue le budget. Ne modifie pas l'entrée reçue ; rend une entrée réduite
 * aux éléments facultatifs qui tiennent, et le rapport de chaque décision.
 */
export function allouerContexte(entree: EntreeTache, options: OptionsBudget): ResultatBudget {
  const compter = options.compter ?? compterJetonsParDefaut;
  const ctx = entree.context;
  const base = vider(ctx);
  const jetonsObligatoires = compter(jsonCanonique({ context: base, taskInputs: entree.taskInputs }, 'js')) + options.reserveJetons;

  if (jetonsObligatoires > options.budgetJetons) {
    const postes: PosteObligatoire[] = [];
    const comptes: Array<[string, unknown]> = [
      ['resolvedDocuments', base.resolvedDocuments], ['references', base.references], ['facts', base.facts],
      ['invariants', base.invariants], ['mediaBindings', base.mediaBindings], ['taskInputs', entree.taskInputs],
      ['autres', { selectionIds: base.selectionIds, allowedPaths: base.allowedPaths, allocatedIds: base.allocatedIds, authorizedSourceIds: base.authorizedSourceIds }],
    ];
    for (const [champ, valeur] of comptes) {
      const jetons = compter(jsonCanonique(valeur, 'js'));
      if (jetons > 0) postes.push({ champ, jetons, proposition: PROPOSITIONS[champ]! });
    }
    postes.sort((a, b) => b.jetons - a.jetons);
    const manque = jetonsObligatoires - options.budgetJetons;
    return {
      ok: false, statut: 'blocked', code: 'CONTEXT_BUDGET_INSUFFICIENT', manqueJetons: manque, postes,
      constats: [constat('CONTEXT_BUDGET_INSUFFICIENT', '/context', `Les contraintes obligatoires demandent ${jetonsObligatoires} jetons pour ${options.budgetJetons} disponibles · il manque ${manque} jetons. Simplifier : ${postes[0]?.proposition ?? 'réduire la tâche'}`)],
    };
  }

  let reste = options.budgetJetons - jetonsObligatoires;
  const decisions: DecisionInclusion[] = [];
  const retenus: { sourceExcerpts: Extrait[]; knowledgeExcerpts: Extrait[] } = { sourceExcerpts: [], knowledgeExcerpts: [] };

  for (const champ of ['sourceExcerpts', 'knowledgeExcerpts'] as const) {
    for (const x of ctx[champ]) {
      const id = `${x.sourceId}@${x.version}`;
      const cap = plafonner(x.text, false);
      const cout = (t: string) => compter(jsonCanonique({ ...x, text: t }, 'js')) + 1;
      const plein = cout(cap.texte);
      if (plein <= reste) {
        retenus[champ].push({ ...x, text: cap.texte });
        reste -= plein;
        decisions.push({ champ, id, statut: cap.omis > 0 ? 'tronque' : 'complet', caracteresOmis: cap.omis });
        continue;
      }
      const coupe = ajuster(cap.texte, reste, cout, false);
      if (coupe !== null) {
        retenus[champ].push({ ...x, text: coupe });
        reste -= cout(coupe);
        decisions.push({ champ, id, statut: 'tronque', caracteresOmis: [...x.text].length - [...coupe].length + [...MARQUE_FIN_TRONQUEE].length });
      } else {
        decisions.push({ champ, id, statut: 'exclu', caracteresOmis: [...x.text].length });
      }
    }
  }

  let historique = '';
  if (ctx.historySummary.length > 0) {
    const cap = plafonner(ctx.historySummary, true);
    const cout = (t: string) => compter(jsonCanonique(t, 'js'));
    if (cout(cap.texte) <= reste) {
      historique = cap.texte;
      reste -= cout(cap.texte);
      decisions.push({ champ: 'historySummary', id: 'historySummary', statut: cap.omis > 0 ? 'tronque' : 'complet', caracteresOmis: cap.omis });
    } else {
      const coupe = ajuster(cap.texte, reste, cout, true);
      if (coupe !== null) {
        historique = coupe;
        reste -= cout(coupe);
        decisions.push({ champ: 'historySummary', id: 'historySummary', statut: 'tronque', caracteresOmis: [...ctx.historySummary].length - [...coupe].length + [...MARQUE_DEBUT_OMIS].length });
      } else {
        decisions.push({ champ: 'historySummary', id: 'historySummary', statut: 'exclu', caracteresOmis: [...ctx.historySummary].length });
      }
    }
  }

  const reduite: EntreeTache = { context: { ...ctx, ...retenus, historySummary: historique }, taskInputs: entree.taskInputs };

  // Vérification sur la sérialisation réelle · un compteur injecté peut ne pas être additif.
  let utilises = compter(jsonCanonique(reduite, 'js')) + options.reserveJetons;
  while (utilises > options.budgetJetons) {
    const derniere = [...decisions].reverse().find((x) => x.statut !== 'exclu');
    if (!derniere) break;
    derniere.statut = 'exclu';
    if (derniere.champ === 'historySummary') reduite.context.historySummary = '';
    else reduite.context[derniere.champ] = reduite.context[derniere.champ].filter((x) => `${x.sourceId}@${x.version}` !== derniere.id);
    utilises = compter(jsonCanonique(reduite, 'js')) + options.reserveJetons;
  }

  return {
    ok: true,
    entree: reduite,
    rapport: {
      budgetJetons: options.budgetJetons, reserveJetons: options.reserveJetons, jetonsObligatoires, jetonsUtilises: utilises,
      decisions, troncature: decisions.some((x) => x.statut !== 'complet'),
    },
  };
}
