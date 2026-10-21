/** Direction dérivée relue par la personne ; jamais un média ni un droit publicitaire. */
export interface DirectionVisuelleRelue { composition: string; styleIntent: string; formats: string[]; texts?: string[] }
export function lireDirectionVisuelleRelue(x: unknown): DirectionVisuelleRelue | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const d = x as Record<string, unknown>;
  if (Object.keys(d).some(k => !['composition', 'styleIntent', 'formats', 'texts'].includes(k))) return null;
  if (typeof d.composition !== 'string' || !d.composition.trim() || d.composition.length > 2000) return null;
  if (typeof d.styleIntent !== 'string' || d.styleIntent.length > 2000) return null;
  if (!Array.isArray(d.formats) || d.formats.length < 1 || d.formats.length > 3 || !d.formats.every(f => typeof f === 'string' && ['1:1', '4:5', '9:16', '16:9'].includes(f))) return null;
  if (d.texts !== undefined && (!Array.isArray(d.texts) || d.texts.length > 10 || !d.texts.every(t => typeof t === 'string' && t.trim().length > 0 && t.length <= 500))) return null;
  return { ...(d.texts !== undefined ? { texts: (d.texts as string[]).map(t => t.trim()) } : {}), composition: d.composition.trim(), styleIntent: d.styleIntent.trim(), formats: [...new Set(d.formats as string[])] };
}
