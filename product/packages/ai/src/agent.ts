/** Agent Tess · définitions d'outils (function calling) et prompt système (CDC §F11). */
export const TESS_SYSTEM = [
  "Tu es Tess, la copilote créative de TikTrends (TikTok-first, FR).",
  "Tu es proactive : tu analyses, recommandes (scale/iterate/kill) et expliques toujours pourquoi.",
  "Règles: réponds en français; affiche le coût crédits avant toute génération lourde;",
  "n'écris jamais sur un compte publicitaire sans confirmation explicite; découpe les tâches longues en jobs.",
].join(' ');

export interface ToolDef { name: string; description: string; input_schema: Record<string, unknown>; }

export const TESS_TOOLS: ToolDef[] = [
  { name: 'get_account_metrics', description: 'KPIs agrégés du compte', input_schema: { type: 'object', properties: { brandId: { type: 'string' }, period: { type: 'string' } }, required: ['brandId'] } },
  { name: 'list_creatives', description: 'Liste des créas filtrées', input_schema: { type: 'object', properties: { brandId: { type: 'string' }, filters: { type: 'object' } }, required: ['brandId'] } },
  { name: 'get_radar', description: 'Fiche Radar d’une créa', input_schema: { type: 'object', properties: { creativeId: { type: 'string' } }, required: ['creativeId'] } },
  { name: 'search_inspo', description: 'Recherche dans la bibliothèque concurrents', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'get_brand_playbook', description: 'Playbook d’une marque concurrente', input_schema: { type: 'object', properties: { libraryBrandId: { type: 'string' } }, required: ['libraryBrandId'] } },
  { name: 'get_reviews_insights', description: 'Insights issus des avis', input_schema: { type: 'object', properties: { brandId: { type: 'string' } }, required: ['brandId'] } },
  { name: 'generate_brief', description: 'Génère un brief', input_schema: { type: 'object', properties: { brandId: { type: 'string' }, origin: { type: 'string' } }, required: ['brandId'] } },
  { name: 'generate_script', description: 'Génère un script', input_schema: { type: 'object', properties: { brandId: { type: 'string' }, format: { type: 'string' } }, required: ['brandId'] } },
  { name: 'generate_images', description: 'Lance une génération d’images (job)', input_schema: { type: 'object', properties: { brandId: { type: 'string' }, kind: { type: 'string' } }, required: ['brandId'] } },
  { name: 'create_report', description: 'Crée un rapport', input_schema: { type: 'object', properties: { brandId: { type: 'string' }, period: { type: 'string' } }, required: ['brandId'] } },
  { name: 'save_to_board', description: 'Sauvegarde une créa dans un board', input_schema: { type: 'object', properties: { boardId: { type: 'string' }, adId: { type: 'string' } }, required: ['boardId', 'adId'] } },
  { name: 'tag_creatives', description: 'Tag des créas', input_schema: { type: 'object', properties: { creativeIds: { type: 'array' } }, required: ['creativeIds'] } },
  { name: 'schedule_job', description: 'Planifie un job proactif', input_schema: { type: 'object', properties: { type: { type: 'string' }, cron: { type: 'string' } }, required: ['type', 'cron'] } },
];
