/** Briefs structurés (CDC §F9). Squelette déterministe -> rempli par le LLM. */
export interface BriefInput {
  brandName: string;
  origin: 'radar' | 'inspo' | 'review' | 'prompt';
  persona?: string; angle?: string; hook?: string; awareness?: string;
}
export interface Brief {
  objective: string; persona: string; awareness: string; angle: string;
  hooks: string[]; structure: { t: string; s: string }[]; keyMessages: string[];
  proof: string; cta: string; format: string; references: string[]; dos: string[]; donts: string[];
}
export function buildBriefSkeleton(i: BriefInput): Brief {
  return {
    objective: 'Conversion',
    persona: i.persona ?? 'À préciser',
    awareness: i.awareness ?? 'problem_aware',
    angle: i.angle ?? 'problem_solution',
    hooks: i.hook ? [i.hook] : [],
    structure: [
      { t: '0-3 s', s: 'Accroche (hook)' },
      { t: '3-10 s', s: 'Preuve / démonstration' },
      { t: '10-15 s', s: 'Offre + CTA' },
    ],
    keyMessages: [],
    proof: '',
    cta: 'Lien en bio',
    format: '9:16',
    references: [],
    dos: ['Sous-titres', 'Plan produit tôt'],
    donts: ['Intro trop longue', 'Jamais éditer le logo'],
  };
}
