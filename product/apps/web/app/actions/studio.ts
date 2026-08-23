'use server';

import { getSession } from '../../lib/auth';
import { FEATURES, canAccess } from '../../lib/rbac';
import { anthropicFromEnv, generateCreative, type CreativeOutput } from '@tiktrends/ai';

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
    return { error: 'Échec de la génération : ' + (e as Error).message };
  }
}
