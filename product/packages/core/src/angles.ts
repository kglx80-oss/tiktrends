/**
 * Classement automatique des angles créatifs à partir du copy (CDC §F7).
 * Heuristique par mots-clés (FR), déterministe et sans coût : pas d'appel IA.
 * L'ordre de test encode une priorité (du plus spécifique au plus générique).
 */
export type AngleKey =
  | 'testimonial' | 'social_proof' | 'objection' | 'offer' | 'educational' | 'problem' | 'other';

export const ANGLE_LABEL: Record<AngleKey, string> = {
  testimonial: 'Témoignage créateur',
  social_proof: 'Preuve sociale',
  objection: "Réponse à l'objection",
  offer: 'Offre / promo',
  educational: 'Éducatif / mécanisme',
  problem: 'Problème / douleur',
  other: 'Autre',
};

export const ANGLE_KEYS: AngleKey[] = ['testimonial', 'social_proof', 'objection', 'offer', 'educational', 'problem', 'other'];

const RULES: Array<{ key: AngleKey; re: RegExp }> = [
  { key: 'offer', re: /(-\s?\d{1,3}\s?%|\b\d{1,3}\s?%|offert|gratuit|code promo|réduction|promo\b|soldes|livraison offerte|prix cassé|économise)/i },
  { key: 'social_proof', re: /(\bavis\b|\d[\d\s.,]*\s?(clients|avis|personnes|abonnés)|noté|★|⭐|recommandé|best[- ]?seller|n°\s?1|numéro un|des milliers|plus de \d)/i },
  { key: 'testimonial', re: /(\bje\b|\bj'ai\b|\bj’ai\b|\bmon\b|\bma\b|depuis que|témoignage|j'utilise|j’utilise|mon secret|je te|je vous)/i },
  { key: 'objection', re: /(sans\s+\w+|pas de\b|arrête[rz]?|contrairement|vous pensez que|oubliez|ne (marche|fonctionne) pas|marre de|fini(e|es)? les)/i },
  { key: 'educational', re: /(pourquoi|comment\b|\d+\s+(raisons|astuces|erreurs|étapes)|le secret|voici|apprends|le mécanisme|ce que personne)/i },
  { key: 'problem', re: /(fatigue|douleur|stress|problème|galère|en marre|ballonn|insomnie|manque d'énergie|manque d’énergie)/i },
];

export function classifyAngle(text?: string | null): AngleKey {
  const t = (text || '').toLowerCase();
  if (!t.trim()) return 'other';
  for (const r of RULES) if (r.re.test(t)) return r.key;
  return 'other';
}

/** Médiane robuste (pour durées de diffusion, reach…). */
export function median(values: number[]): number {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : Math.round((v[mid - 1]! + v[mid]!) / 2);
}

/**
 * Curation « swipe file » : plafonne à N créas par annonceur, en gardant les
 * plus fortes (par signal de croissance décroissant). Préserve l'ordre d'entrée
 * pour les égalités.
 */
export function capPerBrand<T>(items: T[], brandOf: (x: T) => string, growthOf: (x: T) => number, perBrand = 3): T[] {
  const sorted = [...items].sort((a, b) => growthOf(b) - growthOf(a));
  const counts = new Map<string, number>();
  const out: T[] = [];
  for (const it of sorted) {
    const b = brandOf(it) || '—';
    const c = counts.get(b) ?? 0;
    if (c >= perBrand) continue;
    counts.set(b, c + 1);
    out.push(it);
  }
  return out;
}
