'use server';

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { DEFAULT_VERDICT_CONFIG, type VerdictConfig } from '@tiktrends/core';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { roleAtLeast } from '../../lib/rbac';
import { logAndTranslate } from '../../lib/error-log';

/**
 * ADSMAP · protocole de test et seuils de verdict, par marque.
 *
 * L'assistant de réglage (§6.3) est le point clé : des seuils sortis d'un modèle
 * générique produisent des verdicts que l'équipe ne reconnaît pas et cesse de
 * lire. On les propose donc à partir des performances réelles des 30 derniers
 * jours, en expliquant chaque valeur.
 */

export interface ProtocolSettings {
  structure: 'abo_one_adset_per_ad' | 'abo_single_adset' | 'cbo_tolerated';
  dailyBudgetPerAd: number;
  durationDays: number;
  audienceRule: string;
  campaignNamePattern: string;
  budgetVarianceTolerance: number;
}

export interface SettingsBundle {
  protocol: ProtocolSettings;
  verdict: VerdictConfig;
  namingPattern: string;
  /** Vrai tant que rien n'a été enregistré : on affiche alors les valeurs proposées. */
  isDefault: boolean;
}

const DEFAULT_PROTOCOL: ProtocolSettings = {
  structure: 'abo_one_adset_per_ad',
  dailyBudgetPerAd: 20,
  durationDays: 7,
  audienceRule: 'broad, même audience pour toutes les ads du lot',
  campaignNamePattern: '[ADSMAP] TEST {brand} B{batch}',
  budgetVarianceTolerance: 0.2,
};

async function guard(min: 'member' | 'admin' = 'member') {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' as const };
  if (!roleAtLeast(s.role, min)) return { error: 'Réservé aux administrateurs de l’espace.' as const };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Sélectionne une marque active.' as const };
  return { s, brand };
}

export async function getSettingsAction(): Promise<{ settings?: SettingsBundle; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  try {
    const [[p], [v], [b]] = await Promise.all([
      db!.select().from(schema.testProtocols).where(eq(schema.testProtocols.brandId, g.brand.id)).limit(1),
      db!.select().from(schema.verdictConfigs).where(eq(schema.verdictConfigs.brandId, g.brand.id)).limit(1),
      db!.select({ np: schema.brands.namingPattern }).from(schema.brands).where(eq(schema.brands.id, g.brand.id)).limit(1),
    ]);
    return {
      settings: {
        protocol: p ? {
          structure: p.structure, dailyBudgetPerAd: p.dailyBudgetPerAd, durationDays: p.durationDays,
          audienceRule: p.audienceRule, campaignNamePattern: p.campaignNamePattern,
          budgetVarianceTolerance: p.budgetVarianceTolerance,
        } : DEFAULT_PROTOCOL,
        verdict: (v?.config as VerdictConfig) ?? DEFAULT_VERDICT_CONFIG,
        namingPattern: b?.np ?? '{brand}_B{batch}_{concept}_{variant}_{variable}',
        isDefault: !p && !v,
      },
    };
  } catch (e) {
    return { error: logAndTranslate('adsmap:settings', e, { subject: 'la lecture des réglages', workspaceId: g.s.workspaceId }) };
  }
}

export async function saveSettingsAction(input: SettingsBundle): Promise<{ ok?: true; error?: string }> {
  const g = await guard('admin');
  if ('error' in g) return { error: g.error };

  // Garde-fous : des seuils absurdes rendraient tous les verdicts faux en silence.
  const p = input.protocol, v = input.verdict;
  if (!(p.dailyBudgetPerAd > 0)) return { error: 'Le budget quotidien par ad doit être supérieur à zéro.' };
  if (!(p.durationDays >= 1 && p.durationDays <= 30)) return { error: 'La durée de test doit tenir entre 1 et 30 jours.' };
  if (!(v.targetCpa > 0)) return { error: 'Le CPA cible doit être supérieur à zéro.' };
  if (!(v.ciLevelOneSided >= 0.5 && v.ciLevelOneSided < 1)) {
    return { error: 'Le niveau de confiance doit rester entre 50 % et 99 %. Au-delà, plus aucune ad ne serait jamais concluante.' };
  }
  if (!(v.minSpendMultiple >= 1)) return { error: 'Il faut dépenser au moins une fois le CPA cible avant de conclure.' };

  try {
    await db!.insert(schema.testProtocols).values({
      brandId: g.brand.id, workspaceId: g.s.workspaceId,
      structure: p.structure, dailyBudgetPerAd: p.dailyBudgetPerAd, durationDays: p.durationDays,
      audienceRule: p.audienceRule, campaignNamePattern: p.campaignNamePattern,
      budgetVarianceTolerance: p.budgetVarianceTolerance,
    }).onConflictDoUpdate({
      target: schema.testProtocols.brandId,
      set: {
        structure: p.structure, dailyBudgetPerAd: p.dailyBudgetPerAd, durationDays: p.durationDays,
        audienceRule: p.audienceRule, campaignNamePattern: p.campaignNamePattern,
        budgetVarianceTolerance: p.budgetVarianceTolerance,
      },
    });
    await db!.insert(schema.verdictConfigs)
      .values({ brandId: g.brand.id, workspaceId: g.s.workspaceId, config: v })
      .onConflictDoUpdate({ target: schema.verdictConfigs.brandId, set: { config: v, updatedAt: new Date() } });
    await db!.update(schema.brands).set({ namingPattern: input.namingPattern }).where(eq(schema.brands.id, g.brand.id));
    return { ok: true };
  } catch (e) {
    return { error: logAndTranslate('adsmap:settings-save', e, { subject: 'l’enregistrement des réglages', workspaceId: g.s.workspaceId }) };
  }
}

export interface Suggestion {
  verdict: VerdictConfig;
  protocol: ProtocolSettings;
  /** Ce sur quoi chaque valeur s'appuie · affiché à côté du champ. */
  notes: string[];
  /** Faux quand aucune donnée Meta n'est disponible : on le dit au lieu de bluffer. */
  fromRealData: boolean;
}

/**
 * Assistant de réglage · propose des seuils à partir des 30 derniers jours.
 *
 * Sans données, on renvoie les valeurs par défaut EN LE DISANT. Un assistant qui
 * présente un modèle générique comme une mesure est pire qu'un formulaire vide :
 * il fait croire que les seuils sont calibrés.
 */
export async function suggestSettingsAction(): Promise<{ suggestion?: Suggestion; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };

  try {
    const [b] = await db!.select({ insights: schema.brands.adsInsights })
      .from(schema.brands).where(eq(schema.brands.id, g.brand.id)).limit(1);

    const ads = ((b?.insights as { ads?: Array<{ spend: number; impressions: number; ctr: number; hookRate: number; holdRate: number; cpa: number; purchases: number }> } | null)?.ads) ?? [];
    const utiles = ads.filter((a) => a.spend > 0 && a.impressions > 500);

    if (utiles.length < 3) {
      return {
        suggestion: {
          verdict: DEFAULT_VERDICT_CONFIG, protocol: DEFAULT_PROTOCOL, fromRealData: false,
          notes: [
            'Aucune donnée Meta exploitable sur 30 jours : ce sont les valeurs par défaut, pas une mesure.',
            'Connecte le compte publicitaire, puis relance l’assistant : les seuils seront calés sur tes vraies médianes.',
            'À défaut, règle au moins le CPA cible à la main · tout le moteur en dépend.',
          ],
        },
      };
    }

    const med = (xs: number[]) => {
      const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
      if (!v.length) return null;
      const m = Math.floor(v.length / 2);
      return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
    };
    const pct = (x: number) => x / 100;   // les insights stockent des pourcentages

    const cpaMed = med(utiles.filter((a) => a.purchases > 0).map((a) => a.cpa));
    const hookMed = med(utiles.map((a) => pct(a.hookRate)).filter((x) => x > 0));
    const holdMed = med(utiles.map((a) => pct(a.holdRate)).filter((x) => x > 0));
    const ctrMed = med(utiles.map((a) => pct(a.ctr)).filter((x) => x > 0));
    const spendMed = med(utiles.map((a) => a.spend));

    const notes: string[] = [`Calé sur ${utiles.length} annonce(s) des 30 derniers jours.`];
    const verdict: VerdictConfig = { ...DEFAULT_VERDICT_CONFIG };

    if (cpaMed) {
      // On vise mieux que la médiane, sans quoi la moitié des ads seraient « gagnantes ».
      verdict.targetCpa = Math.round(cpaMed * 0.9);
      notes.push(`CPA cible ${verdict.targetCpa} € · 10 % sous ta médiane observée (${Math.round(cpaMed)} €), pour que « gagnante » veuille dire mieux que d’habitude.`);
    } else {
      notes.push('Aucun achat attribué sur la période : le CPA cible reste à régler à la main.');
    }
    if (hookMed) { verdict.leadingIndicators.hookRate = Math.round(hookMed * 1.2 * 1000) / 1000; notes.push(`Seuil d’accroche ${(verdict.leadingIndicators.hookRate * 100).toFixed(1)} % · 1,2 × ta médiane (${(hookMed * 100).toFixed(1)} %).`); }
    if (holdMed) { verdict.leadingIndicators.holdRate = Math.round(holdMed * 1.2 * 1000) / 1000; notes.push(`Seuil de rétention ${(verdict.leadingIndicators.holdRate * 100).toFixed(1)} %.`); }
    if (ctrMed) { verdict.leadingIndicators.ctr = Math.round(ctrMed * 1.2 * 10000) / 10000; notes.push(`Seuil de clic ${(verdict.leadingIndicators.ctr * 100).toFixed(2)} %.`); }

    const protocol = { ...DEFAULT_PROTOCOL };
    if (spendMed) {
      // Une ad doit pouvoir atteindre 3 × le CPA cible dans la fenêtre, sinon
      // tous les verdicts sortiront « non concluant » et personne ne lira l'outil.
      const requis = (verdict.targetCpa * verdict.minSpendMultiple) / protocol.durationDays;
      protocol.dailyBudgetPerAd = Math.max(5, Math.ceil(requis));
      notes.push(`Budget ${protocol.dailyBudgetPerAd} €/jour/ad · le minimum pour atteindre ${verdict.minSpendMultiple} × le CPA cible en ${protocol.durationDays} jours et pouvoir conclure.`);
    }

    return { suggestion: { verdict, protocol, notes, fromRealData: true } };
  } catch (e) {
    return { error: logAndTranslate('adsmap:suggest', e, { subject: 'la proposition de réglages', workspaceId: g.s.workspaceId }) };
  }
}
