import Anthropic from '@anthropic-ai/sdk';
import { GEN_MODEL } from './generation';
import { TESS_SYSTEM } from './agent';

export interface ChatMessage { role: 'user' | 'assistant'; content: string }

/** Contexte léger injecté pour ancrer l'assistant (marque active, solde, etc.). */
export interface ChatContext {
  brandName?: string | null;
  credits?: number;
  plan?: string;
}

function contextBlock(ctx: ChatContext): string {
  const lines = [
    ctx.brandName ? `Marque active de l'utilisateur : ${ctx.brandName}.` : "Aucune marque active sélectionnée.",
    ctx.credits != null ? `Solde de crédits : ${ctx.credits}.` : '',
    ctx.plan ? `Abonnement : ${ctx.plan}.` : '',
    "Tu peux orienter vers les outils de l'app : Inspo (bibliothèques pub), Radar (diagnostic créas), Analytics (KPI), Studio IA (scripts, hooks, vidéo), fiche marque (profil, audience, concurrents).",
    "Sois concis et actionnable. N'invente pas de chiffres de performance : si tu n'as pas la donnée, dis où l'utilisateur peut la trouver dans l'app.",
  ];
  return lines.filter(Boolean).join('\n');
}

/** Réponse conversationnelle de l'assistant (non-streaming, robuste). */
export async function chatAssistant(
  client: Anthropic,
  messages: ChatMessage[],
  ctx: ChatContext = {},
): Promise<string> {
  const res = await client.messages.create({
    model: GEN_MODEL,
    max_tokens: 1200,
    system: `${TESS_SYSTEM}\n\nContexte:\n${contextBlock(ctx)}`,
    messages: messages.slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })),
  });
  return res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n').trim()
    || "Je n'ai pas de réponse pour le moment, reformule ta question.";
}
