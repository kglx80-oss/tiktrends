'use server';

import { getSession } from '../../lib/auth';
import { FEATURES, canAccess } from '../../lib/rbac';
import { anthropicFromEnv, generateCreative, type CreativeOutput } from '@tiktrends/ai';
import { costFor } from '@tiktrends/core';
import { unlimitedCredits, reserveCredits, refundCredits } from '../../lib/credits';
import { logAndTranslate } from '../../lib/error-log';
import { effectiveAccess } from '../../lib/access';

const feature = FEATURES.find((f) => f.key === 'studio')!;
const norm = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');

export interface StudioState {
  error?: string;
  output?: CreativeOutput;
}

export async function generateAction(_prev: StudioState, formData: FormData): Promise<StudioState> {
  const s = await getSession();
  if (!s) return { error: 'Session expirée, reconnecte-toi.' };
  if (!canAccess(effectiveAccess(s), feature)) {
    return { error: "Le Studio IA nécessite l'abonnement Core et un rôle Membre minimum." };
  }

  const product = norm(formData.get('product'));
  if (!product) return { error: 'Indique au moins un produit ou une marque.' };

  const client = anthropicFromEnv();
  if (!client) return { error: "L'IA n'est pas configurée sur le serveur (ANTHROPIC_API_KEY manquante)." };

  // Débit atomique AVANT la génération : un seul UPDATE conditionnel, donc deux
  // requêtes lancées en même temps ne peuvent pas passer la même vérification de
  // solde et générer gratuitement. Remboursé si la génération échoue.
  const cost = costFor('script');
  const unlimited = unlimitedCredits(s.user.email);
  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Studio · génération créative'))) {
    return { error: `Crédits insuffisants (${cost} requis). Recharge depuis Crédits.` };
  }

  try {
    const output = await generateCreative(client, {
      product,
      audience: norm(formData.get('audience')) || undefined,
      angle: norm(formData.get('angle')) || undefined,
      tone: norm(formData.get('tone')) || undefined,
      platform: norm(formData.get('platform')) === 'meta' ? 'meta' : 'tiktok',
      language: 'fr',
      inspiration: norm(formData.get('inspiration')) || undefined,
    });
    return { output };
  } catch (e) {
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · génération créative');
    return { error: logAndTranslate('studio:script', e, { subject: 'la génération', workspaceId: s.workspaceId }) };
  }
}
