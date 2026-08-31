'use server';

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { draftConcept } from '@tiktrends/ai';
import {
  draftPrompt, reviewDraft, isUsableDraft, explainProposal,
  type DraftOut, type DraftRequest, type StatRow, type HookEntry,
} from '@tiktrends/core';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { logAndTranslate } from '../../lib/error-log';
import { guardedAnthropic } from '../../lib/spend-guard';
import {
  jarvisFullMemory, jarvisStats, jarvisHooks, briefConceptBeforeLaunch,
} from '../../lib/jarvis-memory';
import { GUARD } from '../../lib/guard-error';

/**
 * Jarvis écrit le concept.
 *
 * ── La boucle qui fait la différence ─────────────────────────────────────────
 *
 * Rédiger, puis **se relire avec son propre brief de pré-lancement**. Si le
 * brouillon reprend une accroche qui a déjà perdu chez cette marque, Jarvis le
 * voit avant l'utilisateur et réécrit · une fois, jamais deux.
 *
 * Un outil qui ne relit pas ce qu'il propose fait porter la vérification à celui
 * qui lit · c'est exactement le travail qu'on prétendait lui enlever.
 *
 * ── Le coût, annoncé ─────────────────────────────────────────────────────────
 *
 * Un brouillon = un appel (~0,03 $). Une réécriture en ajoute un, et seulement
 * quand une accroche réfutée l'impose · le pire cas est donc 0,06 $, et il n'a
 * lieu que dans le cas où il évite un test perdu d'avance.
 */

export interface DraftView {
  draft: DraftOut;
  /** Ce que la relecture a signalé sans imposer de réécriture. */
  warning: string | null;
  /** Vrai si Jarvis s'est corrigé lui-même · on le dit, c'est ce qui le distingue. */
  rewritten: boolean;
  recommendation: string;
}

export async function draftConceptAction(req: DraftRequest): Promise<{ view?: DraftView; error?: string }> {
  const g = await adsmapGuard();
  if ('error' in g) return { error: g.error };

  if (!req.intent?.trim()) {
    return { error: 'Dis à Jarvis ce que tu cherches · sans intention, il écrira quelque chose de correct et d’inutile.' };
  }

  const client = guardedAnthropic({ workspaceId: g.s.workspaceId, action: 'adsmap-draft' });
  if (!client) return { error: GUARD.aiOff() };

  try {
    const [memoire, stats, hooks, marque] = await Promise.all([
      jarvisFullMemory(g.brand.id, g.s.workspaceId).catch(() => ''),
      jarvisStats(g.brand.id, g.s.workspaceId).catch(() => ({ stats: [], globalRate: null, nAds: 0 })),
      jarvisHooks(g.brand.id, g.s.workspaceId).catch(() => [] as HookEntry[]),
      db!.select({
        rules: schema.brands.creativeRules, description: schema.brands.description,
        usp: schema.brands.usp, audience: schema.brands.audience,
      }).from(schema.brands).where(eq(schema.brands.id, g.brand.id)).limit(1),
    ]);
    const b = marque[0];

    const system = draftPrompt(req, {
      brandName: g.brand.name,
      memory: memoire,
      rules: b?.rules ?? null,
      identity: [b?.description, b?.usp, b?.audience].filter(Boolean).join('\n') || null,
    });

    let draft = await draftConcept(client, { system });
    if (!isUsableDraft(draft)) {
      return { error: 'Jarvis n’a pas rendu un concept exploitable. Reformule ta demande en une phrase plus concrète.' };
    }

    // La relecture · c'est ici que l'outil cesse d'être un générateur.
    let brief = await briefConceptBeforeLaunch(g.brand.id, g.s.workspaceId, {
      candidateHook: draft.headline,
    });
    let verdict = reviewDraft(brief, 1);
    let rewritten = false;

    if (verdict.rewrite && verdict.instruction) {
      const second = await draftConcept(client, {
        system, rewriteOf: { previous: draft, instruction: verdict.instruction },
      });
      if (isUsableDraft(second)) {
        draft = second;
        rewritten = true;
        brief = await briefConceptBeforeLaunch(g.brand.id, g.s.workspaceId, { candidateHook: draft.headline });
        verdict = reviewDraft(brief, 2);
      }
    }

    // L'explication est CALCULÉE, jamais rédigée · même règle que partout (D72).
    const rationale = explainProposal({ headline: draft.headline }, {
      stats: stats.stats as StatRow[],
      globalRate: stats.globalRate,
      hooks,
    }).lines.map((l) => l.text);

    return {
      view: {
        draft: { ...draft, rationale },
        warning: verdict.warning,
        rewritten,
        recommendation: brief.summary,
      },
    };
  } catch (e) {
    return { error: logAndTranslate('adsmap:draft', e, { subject: 'l’écriture du concept', workspaceId: g.s.workspaceId }) };
  }
}
