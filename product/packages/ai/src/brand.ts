import Anthropic from '@anthropic-ai/sdk';
import { GEN_MODEL } from './generation';

/* ============ Génération de profil de marque depuis le site (CDC §F5) ============ */
export interface BrandPersonaDraft { name: string; description: string; pains: string[]; desires: string[] }
export interface BrandScenarioDraft { title: string; context: string }
export interface BrandProfileDraft {
  description: string;
  usp: string;
  audience: string;
  category: string;
  categoryNeeds: string;
  tone: string;
  industryTags: string[];
  preferredWords: string[];
  avoidWords: string[];
  personas: BrandPersonaDraft[];
  scenarios: BrandScenarioDraft[];
  competitors: string[];
}

const BRAND_TOOL = {
  name: 'return_brand_profile',
  description: 'Renvoie le profil de marque structuré, déduit du contenu du site.',
  input_schema: {
    type: 'object',
    properties: {
      description: { type: 'string', description: 'Description produit/service en 2 à 4 phrases' },
      usp: { type: 'string', description: 'Propositions de valeur uniques (une par ligne, 3 max)' },
      audience: { type: 'string', description: 'Audience cible principale, en une phrase' },
      category: { type: 'string', description: 'Catégorie de marché (ex : complément alimentaire)' },
      categoryNeeds: { type: 'string', description: 'Besoins clés que la catégorie doit adresser' },
      tone: { type: 'string', description: 'Ton de voix de la marque (ex : chaleureux, expert, direct)' },
      industryTags: { type: 'array', items: { type: 'string' }, description: '2 à 5 tags de secteur/vertical' },
      preferredWords: { type: 'array', items: { type: 'string' }, description: 'Mots/expressions à privilégier' },
      avoidWords: { type: 'array', items: { type: 'string' }, description: 'Mots/expressions à éviter' },
      personas: {
        type: 'array',
        description: '2 à 3 personas cibles',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: "Nom du persona (ex : L'étudiante déterminée)" },
            description: { type: 'string', description: 'Description en une à deux phrases' },
            pains: { type: 'array', items: { type: 'string' }, description: 'Frustrations/douleurs' },
            desires: { type: 'array', items: { type: 'string' }, description: 'Désirs/objectifs' },
          },
          required: ['name', 'description', 'pains', 'desires'],
        },
      },
      scenarios: {
        type: 'array',
        description: "2 à 3 scénarios d'usage",
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Titre du scénario (ex : Session de travail nocturne)' },
            context: { type: 'string', description: 'Contexte : lieu, moment, situation' },
          },
          required: ['title', 'context'],
        },
      },
      competitors: { type: 'array', items: { type: 'string' }, description: '3 à 6 marques concurrentes probables' },
    },
    required: ['description', 'usp', 'audience', 'category', 'categoryNeeds', 'tone', 'industryTags', 'preferredWords', 'avoidWords', 'personas', 'scenarios', 'competitors'],
  },
} as const;

export function buildBrandSystem(): string {
  return [
    "Tu es l'analyste de marque de TikTrends.",
    "À partir du nom, de l'URL et du contenu texte d'un site, tu déduis un profil de marque complet et exploitable pour la publicité TikTok/Meta.",
    'Tu écris en français, précis et concret, sans jargon inutile ni superlatifs vides.',
    "Si une information manque, propose une hypothèse plausible fondée sur la catégorie, sans inventer de faits chiffrés.",
    "Rends TOUJOURS ta réponse via l'outil return_brand_profile.",
  ].join(' ');
}

export function buildBrandUserPrompt(i: { name: string; url?: string; siteText?: string }): string {
  return [
    `Marque : ${i.name}.`,
    i.url ? `Site : ${i.url}.` : '',
    i.siteText ? `Contenu extrait du site (tronqué) :\n"""${i.siteText.slice(0, 8000)}"""` : '(Aucun contenu de site fourni : déduis à partir du nom et de la catégorie probable.)',
    'Déduis le profil de marque complet demandé par l’outil.',
  ].filter(Boolean).join('\n');
}

export async function generateBrandProfile(
  client: Anthropic,
  i: { name: string; url?: string; siteText?: string },
): Promise<BrandProfileDraft> {
  const res = await client.messages.create({
    model: GEN_MODEL,
    max_tokens: 3000,
    system: buildBrandSystem(),
    tools: [BRAND_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: 'return_brand_profile' },
    messages: [{ role: 'user', content: buildBrandUserPrompt(i) }],
  });
  const tool = res.content.find((c) => c.type === 'tool_use') as { input?: BrandProfileDraft } | undefined;
  if (!tool?.input) throw new Error('Profil vide (aucune sortie structurée).');
  return tool.input;
}

/* ============ Extraction de produits depuis le site (CDC §F5) ============ */
export interface ProductDraft { name: string; description: string; usp: string; category: string; url: string; price: number | null }

const PRODUCTS_TOOL = {
  name: 'return_products',
  description: 'Renvoie la liste des produits/offres détectés sur le site.',
  input_schema: {
    type: 'object',
    properties: {
      products: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nom du produit ou de l’offre' },
            description: { type: 'string', description: 'Description courte (1 à 3 phrases)' },
            usp: { type: 'string', description: 'Bénéfices clés / arguments (une par ligne)' },
            category: { type: 'string', description: 'Catégorie du produit' },
            url: { type: 'string', description: 'URL de la fiche produit si repérable, sinon vide' },
            price: { type: ['number', 'null'], description: 'Prix en devise locale si repérable, sinon null' },
          },
          required: ['name', 'description', 'usp', 'category', 'url', 'price'],
        },
      },
    },
    required: ['products'],
  },
} as const;

export async function generateProducts(
  client: Anthropic,
  i: { name: string; url?: string; siteText?: string },
): Promise<ProductDraft[]> {
  const res = await client.messages.create({
    model: GEN_MODEL,
    max_tokens: 3000,
    system: "Tu extrais les produits/offres d'une marque à partir du contenu de son site, en français. Ne renvoie que des produits réellement mentionnés. Rends TOUJOURS ta réponse via l'outil return_products.",
    tools: [PRODUCTS_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: 'return_products' },
    messages: [{ role: 'user', content: buildBrandUserPrompt(i) }],
  });
  const tool = res.content.find((c) => c.type === 'tool_use') as { input?: { products?: ProductDraft[] } } | undefined;
  return tool?.input?.products ?? [];
}

/** Récupère le texte visible d'une page (best-effort, sans dépendance). */
export async function fetchSiteText(url: string): Promise<string> {
  const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const res = await fetch(target, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; TikTrendsBot/1.0)' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Site inaccessible (${res.status}).`);
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000);
}
