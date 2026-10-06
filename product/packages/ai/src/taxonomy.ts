import { z } from 'zod';
import { IDS_FORMATS_CREATIFS } from '@tiktrends/core';

/** Taxonomie de tags · contrat de sortie de l'IA (CDC §5.5). JSON strict. */
/**
 * Formats créatifs · la liste UNIQUE vit au noyau (`@tiktrends/core`,
 * `formats-creatifs.ts` · lot 19C). Plus de seconde énumération ici · les 18
 * anciennes valeurs y sont reprises (17) ou retirées (`ai_generated`, un mode de
 * fabrication, pas une composition) · voir `ANCIENNES_VALEURS_FORMAT`.
 */
export const FORMAT = IDS_FORMATS_CREATIFS;
export const HOOK_TYPE = ['question','bold_claim','pattern_interrupt','curiosity_gap','problem_callout','result_first','social_proof','controversy','direct_address','visual_shock','text_overlay_statement'] as const;
export const CORE_DESIRE = ['save_time','save_money','look_better','feel_better','status','belonging','safety','convenience','pleasure','mastery'] as const;
export const EMOTION = ['curiosity','fear','relief','joy','pride','frustration','surprise','trust','desire','humor'] as const;
export const ANGLE = ['problem_solution','transformation','ingredient_mechanism','us_vs_them','myth_busting','offer_led','lifestyle','education','urgency_scarcity','founder_story'] as const;
export const CTA_TYPE = ['shop_now','learn_more','try_risk_free','limited_offer','link_in_bio','none'] as const;
export const VISUAL_STYLE = ['raw_phone','polished_studio','text_heavy','minimal','colorful','dark','lifestyle','product_macro'] as const;
export const AWARENESS = ['unaware','problem_aware','solution_aware','product_aware','most_aware'] as const;

export const TagTaxonomy = z.object({
  format: z.array(z.enum(FORMAT)),
  hook_type: z.array(z.enum(HOOK_TYPE)),
  hook_verbatim: z.string(),
  persona: z.string(),
  core_desire: z.array(z.enum(CORE_DESIRE)),
  emotion: z.array(z.enum(EMOTION)),
  angle: z.array(z.enum(ANGLE)),
  usp_claims: z.array(z.string()),
  key_message: z.string(),
  cta_type: z.array(z.enum(CTA_TYPE)),
  visual_style: z.array(z.enum(VISUAL_STYLE)),
  has_voiceover: z.boolean(),
  has_music: z.boolean(),
  has_captions: z.boolean(),
  has_face: z.boolean(),
  product_shown_at_s: z.number().nullable(),
  language: z.string(),
  awareness_level: z.array(z.enum(AWARENESS)),
  offer: z.string().nullable(),
  confidence: z.record(z.string(), z.number().min(0).max(1)),
});
export type TagTaxonomy = z.infer<typeof TagTaxonomy>;
