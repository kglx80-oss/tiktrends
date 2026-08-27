import Anthropic from '@anthropic-ai/sdk';
import { GEN_MODEL } from './generation';
import type { AdTemplate } from './ads';

/** Contexte marque pour scorer une créa comme le ferait un DA performance. */
export interface CritiqueCtx {
  brand?: string; tone?: string; usp?: string; audience?: string; category?: string;
  objective?: string;
  creativeRules?: string;     // règles maison Jarvis
  winningPatterns?: string;   // patterns gagnants distillés (entraînement veille/perf)
}
export interface CreativeInput {
  template?: AdTemplate | string;
  kicker?: string; headline: string; subhead?: string; cta?: string; badge?: string;
}
export interface CreativeScore {
  score: number;          // 0-100 · potentiel de performance global
  verdict: string;        // 1 phrase, cash
  hook: number;           // 0-100 · force de l'accroche / scroll-stop
  clarity: number;        // 0-100 · clarté du message
  relevance: number;      // 0-100 · adéquation marque/cible/offre
  strengths: string[];    // ce qui marche
  fix: string;            // LA correction la plus rentable
}

const SCORE_TOOL = {
  name: 'return_score',
  description: 'Renvoie un scoring de performance créative, honnête et actionnable.',
  input_schema: {
    type: 'object',
    properties: {
      score: { type: 'integer', description: 'Potentiel de performance global 0-100 (sois exigeant · 100 = créa qui scale).' },
      verdict: { type: 'string', description: 'Verdict cash en 1 phrase (FR), sans langue de bois.' },
      hook: { type: 'integer', description: "Force de l'accroche / capacité à stopper le scroll, 0-100." },
      clarity: { type: 'integer', description: 'Clarté du message en < 2s, 0-100.' },
      relevance: { type: 'integer', description: 'Adéquation marque / cible / offre, 0-100.' },
      strengths: { type: 'array', items: { type: 'string' }, description: '1 à 3 points forts, très courts.' },
      fix: { type: 'string', description: "LA modification la plus rentable à faire (concrète, 1 phrase)." },
    },
    required: ['score', 'verdict', 'hook', 'clarity', 'relevance', 'fix'],
  },
} as const;

/**
 * « Score Jarvis » · évalue une créa comme un directeur créatif data-driven.
 * S'appuie sur les règles maison + les patterns gagnants appris (veille/perf) pour
 * juger le potentiel réel de performance, pas l'esthétique.
 */
export async function scoreCreative(client: Anthropic, ctx: CritiqueCtx, creative: CreativeInput): Promise<CreativeScore | null> {
  const sys = [
    "Tu es Jarvis, directeur créatif PERFORMANCE (niveau Atria/Motion) spécialiste des pubs qui SCALENT en paid social (Meta/TikTok).",
    "Tu notes le POTENTIEL DE PERFORMANCE réel d'une créa (scroll-stop, clarté, promesse, adéquation cible/offre), pas la beauté.",
    "Sois EXIGEANT et honnête : la plupart des créas moyennes sont entre 40 et 65. Une note ≥ 80 est réservée aux créas prêtes à scaler.",
    ctx.winningPatterns ? "Appuie-toi sur les PATTERNS GAGNANTS appris pour cette marque (fournis) : récompense ce qui s'en rapproche." : '',
    ctx.creativeRules ? "Respecte les RÈGLES MAISON de la marque (fournies)." : '',
    "Rends via l'outil return_score. Français, zéro tiret cadratin.",
  ].filter(Boolean).join(' ');

  const user = [
    ctx.brand ? `Marque : ${ctx.brand}.` : '',
    ctx.category ? `Catégorie : ${ctx.category}.` : '',
    ctx.audience ? `Cible : ${ctx.audience}.` : '',
    ctx.tone ? `Ton : ${ctx.tone}.` : '',
    ctx.usp ? `USP : ${ctx.usp}.` : '',
    ctx.objective ? `Objectif de la campagne : ${ctx.objective}.` : '',
    ctx.creativeRules ? `\nRègles maison :\n${ctx.creativeRules.slice(0, 800)}` : '',
    ctx.winningPatterns ? `\nPatterns gagnants appris :\n${ctx.winningPatterns.slice(0, 1000)}` : '',
    `\nCréa à noter (gabarit : ${creative.template || 'n/a'}) :`,
    creative.kicker ? `Kicker : ${creative.kicker}` : '',
    `Accroche : ${creative.headline}`,
    creative.subhead ? `Sous-titre : ${creative.subhead}` : '',
    creative.cta ? `CTA : ${creative.cta}` : '',
    creative.badge ? `Badge/offre : ${creative.badge}` : '',
  ].filter(Boolean).join('\n');

  const res = await client.messages.create({
    model: GEN_MODEL, max_tokens: 700, system: sys,
    tools: [SCORE_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: 'return_score' },
    messages: [{ role: 'user', content: user }],
  });
  const tool = res.content.find((c) => c.type === 'tool_use') as { input?: CreativeScore } | undefined;
  const s = tool?.input;
  if (!s) return null;
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n || 0)));
  return {
    score: clamp(s.score), hook: clamp(s.hook), clarity: clamp(s.clarity), relevance: clamp(s.relevance),
    verdict: (s.verdict || '').replace(/[—–]/g, ',').trim(),
    strengths: Array.isArray(s.strengths) ? s.strengths.slice(0, 3) : [],
    fix: (s.fix || '').replace(/[—–]/g, ',').trim(),
  };
}
