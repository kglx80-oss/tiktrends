/**
 * Pourquoi Jarvis a proposé ça.
 *
 * ── Ce qui manquait ──────────────────────────────────────────────────────────
 *
 * Chaque génération consigne déjà ce que la mémoire lui a donné (`memoryUse`) ·
 * c'est ce qui alimente l'attribution. Mais l'utilisateur, au moment où il lit
 * une proposition, ne voit rien. Pour comprendre, il doit aller sur un autre
 * écran, et personne ne fait ça.
 *
 * Or une proposition muette **se subit ou s'ignore**. Une proposition qui
 * s'explique se juge · et surtout, elle se conteste en connaissance de cause.
 *
 * ── La décision qui gouverne ce fichier ──────────────────────────────────────
 *
 * On aurait pu demander au modèle de rédiger sa propre justification dans le
 * même appel · c'était gratuit et immédiat.
 *
 * **Une justification produite par le modèle est une affirmation. Une
 * justification calculée depuis la mémoire est un fait.** Un modèle à qui l'on
 * demande de se justifier trouvera toujours une raison, y compris quand il n'en
 * avait pas · et il écrira « 3 gagnantes sur 8 » sans avoir compté.
 *
 * Tout le produit repose sur « cite tes chiffres ou admets que tu n'en as pas ».
 * La justification est donc **recalculée à partir des mêmes données que celles
 * qui ont été injectées**. Elle ne peut pas mentir, et quand il n'y a rien à
 * dire, elle le dit.
 *
 * ── Le rapport avec le brief de pré-lancement ────────────────────────────────
 *
 * `prelaunchBrief` répond « faut-il lancer ça ? » avant de dépenser. Ce fichier
 * répond « d'où vient cette proposition ? » au moment de la lire. Même mémoire,
 * deux questions · l'un arbitre, l'autre rend des comptes.
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

import type { StatRow } from './brand-stats';
import { findHookMatch } from './prelaunch';
import type { HookEntry } from './hook-library';
import { significantRows, type MarketRow } from './market-stats';

export type RationaleKind =
  | 'hook_avoided'   // une accroche réfutée a été écartée · la ligne la plus utile
  | 'hook_reused'    // une accroche gagnante a été reprise
  | 'measured'       // une dimension mesurée au-dessus de la moyenne
  | 'market'         // une mécanique éprouvée sur le marché
  | 'none';          // rien de mesuré ne guide cette proposition

export interface RationaleLine { kind: RationaleKind; text: string }

export interface RationaleInput {
  /** L'accroche réellement écrite · c'est elle qui porte le signal le plus fort. */
  headline?: string | null;
  mechanism?: string | null;
  hookType?: string | null;
  openingType?: string | null;
  format?: string | null;
}

export interface RationaleContext {
  stats: StatRow[];
  globalRate: number | null;
  hooks?: HookEntry[];
  market?: MarketRow[];
}

/** Au-delà, ce n'est plus une explication mais un rapport · on en perd le fil. */
const MAX_LIGNES = 3;

/** Même seuil que partout · sous trois tests tranchés, on ne cite pas de taux. */
const MIN_N = 3;

const pct = (x: number) => `${Math.round(x * 100)} %`;

/**
 * Ce qu'il y a à dire d'une proposition.
 *
 * L'ordre n'est pas cosmétique : ce qui a été **écarté** passe devant ce qui a
 * été repris. Savoir qu'une accroche a été évitée parce qu'elle avait perdu
 * apprend quelque chose · savoir qu'un mécanisme moyen a été suivi n'apprend
 * rien.
 */
export function explainProposal(
  input: RationaleInput,
  ctx: RationaleContext,
): { lines: RationaleLine[]; summary: string } {
  const lines: RationaleLine[] = [];

  // 1 · L'accroche · le seul signal qui porte des mots plutôt que des catégories.
  if (input.headline?.trim() && ctx.hooks?.length) {
    const m = findHookMatch(input.headline, ctx.hooks);
    if (m?.entry.evidence === 'proven') {
      lines.push({
        kind: 'hook_reused',
        text: `Reprend une accroche qui a gagné ici : « ${m.entry.text} ».`,
      });
    } else if (m?.entry.evidence === 'market') {
      lines.push({
        kind: 'market',
        text: `S’appuie sur une mécanique tenue par un concurrent · les mots sont réécrits, jamais recopiés.`,
      });
    }
  }

  // Une accroche réfutée qu'on a su ne PAS reproposer · c'est la ligne qui
  // justifie l'existence de la mémoire, et elle passe en premier.
  const refutees = (ctx.hooks ?? []).filter((h) => h.evidence === 'refuted');
  if (refutees.length && input.headline?.trim()) {
    const proche = findHookMatch(input.headline, refutees);
    if (!proche) {
      lines.unshift({
        kind: 'hook_avoided',
        text: refutees.length === 1
          ? `Écarte l’accroche qui avait perdu ici : « ${tronque(refutees[0]!.text)} ».`
          : `Écarte les ${refutees.length} accroches qui avaient perdu ici.`,
      });
    }
  }

  // 2 · Les dimensions mesurées AU-DESSUS de la moyenne · elles expliquent le
  // cap tenu. En dessous, il n'y a rien à revendiquer.
  if (ctx.globalRate !== null) {
    const dims: Array<[string, string | null | undefined]> = [
      ['mechanism', input.mechanism], ['hook_type', input.hookType],
      ['opening_type', input.openingType], ['format', input.format],
    ];
    for (const [dimension, cle] of dims) {
      if (!cle) continue;
      const row = ctx.stats.find((s) => s.dimension === dimension && s.key === cle);
      if (!row || row.nConclusive < MIN_N || row.hitRate === null) continue;
      if (row.hitRate <= ctx.globalRate) continue;
      lines.push({
        kind: 'measured',
        text: `${cle} · ${pct(row.hitRate)} de réussite chez toi (${row.nWinners + row.nBaby} sur ${row.nConclusive} tests tranchés), au-dessus de ta moyenne.`,
      });
    }
  }

  // 3 · Le marché, en dernier et seulement s'il reste de la place · une part
  // d'usage n'est pas un taux de réussite, elle ne justifie pas un choix.
  if (lines.length < MAX_LIGNES) {
    const fortes = significantRows(ctx.market ?? []).filter((r) => r.shareOfProven >= 0.4);
    const suit = fortes.find((r) => valeurDe(input, r.dimension) === r.key);
    if (suit) {
      lines.push({
        kind: 'market',
        text: `« ${suit.key} » · ${Math.round(suit.shareOfProven * 100)} % des créas qui tiennent sur ce marché. Une part d’usage, pas un taux de réussite.`,
      });
    }
  }

  if (!lines.length) {
    // Le dire vaut mieux que se taire · une proposition sans justification
    // affichée se lit comme une proposition justifiée dont on cache la raison.
    return {
      lines: [{
        kind: 'none',
        text: 'Rien de mesuré ne guide encore cette proposition · elle sort des règles de la marque, pas de tes résultats.',
      }],
      summary: 'Aucun chiffre derrière cette proposition pour l’instant.',
    };
  }

  const gardees = lines.slice(0, MAX_LIGNES);
  return { lines: gardees, summary: gardees[0]!.text };
}

function valeurDe(input: RationaleInput, dimension: string): string | null | undefined {
  if (dimension === 'hook_type') return input.hookType;
  if (dimension === 'opening_type') return input.openingType;
  if (dimension === 'format') return input.format;
  if (dimension === 'mechanism') return input.mechanism;
  return null;
}

function tronque(s: string, n = 60): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

export const RATIONALE_TON: Record<RationaleKind, string> = {
  hook_avoided: '#7ee8bf',
  hook_reused: '#7ee8bf',
  measured: 'var(--ink-2)',
  market: '#ffcf8f',
  none: 'var(--muted)',
};
