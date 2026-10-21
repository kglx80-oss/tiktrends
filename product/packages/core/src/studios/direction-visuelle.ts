/** Direction dérivée relue par la personne ; jamais un média ni un droit publicitaire. */
export interface DirectionVisuelleRelue { composition: string; styleIntent: string; formats: string[] }
export function lireDirectionVisuelleRelue(x: unknown): DirectionVisuelleRelue | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const d = x as Record<string, unknown>;
  if (Object.keys(d).some(k => !['composition', 'styleIntent', 'formats'].includes(k))) return null;
  if (typeof d.composition !== 'string' || !d.composition.trim() || d.composition.length > 2000) return null;
  if (typeof d.styleIntent !== 'string' || d.styleIntent.length > 2000) return null;
  if (!Array.isArray(d.formats) || d.formats.length < 1 || d.formats.length > 3 || !d.formats.every(f => typeof f === 'string' && ['1:1', '4:5', '9:16', '16:9'].includes(f))) return null;
  return { composition: d.composition.trim(), styleIntent: d.styleIntent.trim(), formats: [...new Set(d.formats as string[])] };
}
