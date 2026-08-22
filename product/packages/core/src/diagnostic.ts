import type { Grade } from './radar';

/** Règles de diagnostic Radar (CDC §5.6). Pur & testable. */
export type DiagnosisCode = 'hook_slow' | 'promise_broken' | 'cta_late' | 'offer_or_landing' | 'no_edge';

export const DIAGNOSIS_FR: Record<DiagnosisCode, string> = {
  hook_slow: 'Hook lent / non différenciant sur les 3 premières secondes.',
  promise_broken: 'Promesse non tenue après 3 s — l’attention décroche.',
  cta_late: 'CTA absent ou trop tardif malgré une bonne rétention.',
  offer_or_landing: 'Clics présents mais conversion faible : offre ou landing page (hors créa).',
  no_edge: 'Concept sans aspérité : aucun signal fort, aucun angle marqué.',
};

export function diagnose(g: { hook: Grade; hold: Grade; ctr: Grade; conv: Grade }): DiagnosisCode[] {
  const d: DiagnosisCode[] = [];
  if (g.hook === 'D') d.push('hook_slow');
  if (g.hook === 'A' && g.hold === 'D') d.push('promise_broken');
  if (g.hold === 'A' && g.ctr === 'D') d.push('cta_late');
  if (g.ctr === 'A' && g.conv === 'D') d.push('offer_or_landing');
  if (d.length === 0) d.push('no_edge');
  return d;
}
