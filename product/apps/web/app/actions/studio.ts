'use server';

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { FEATURES, canAccess } from '../../lib/rbac';
import { anthropicFromEnv, generateCreative, type CreativeOutput } from '@tiktrends/ai';
import { costFor } from '@tiktrends/core';
import { unlimitedCredits } from '../../lib/credits';

const feature = FEATURES.find((f) => f.key === 'studio')!;
const norm = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');

export interface StudioState {
  error?: string;
  output?: CreativeOutput;
}

export async function generateAction(_prev: StudioState, formData: FormData): Promise<StudioState> {
  const s = await getSession();
  if (!s) return { error: 'Session expirée, reconnecte-toi.' };
  if (!canAccess({ role: s.role, plan: s.plan }, feature)) {
    return { error: "Le Studio IA nécessite l'abonnement Core et un rôle Membre minimum." };
  }

  const product = norm(formData.get('product'));
  if (!product) return { error: 'Indique au moins un produit ou une marque.' };

  const client = anthropicFromEnv();
  if (!client) return { error: "L'IA n'est pas configurée sur le serveur (ANTHROPIC_API_KEY manquante)." };

  // Vérification des crédits (une génération = coût d'un script).
  const cost = costFor('script');
  const unlimited = unlimitedCredits(s.user.email);
  if (db && !unlimited) {
    const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
    if ((w?.c ?? 0) < cost) return { error: `Crédits insuffisants (${cost} requis). Recharge depuis Crédits.` };
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
    // Débit des crédits + trace (best-effort, ne bloque pas la sortie).
    if (db && !unlimited) {
      try {
        const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
        await db.update(schema.workspaces).set({ creditsBalance: Math.max(0, (w?.c ?? 0) - cost) }).where(eq(schema.workspaces.id, s.workspaceId));
        await db.insert(schema.creditLedger).values({ workspaceId: s.workspaceId, delta: -cost, reason: 'Studio — génération créative' });
      } catch { /* la génération reste livrée même si le débit échoue */ }
    }
    return { output };
  } catch (e) {
    return { error: 'Échec de la génération : ' + (e as Error).message };
  }
}
