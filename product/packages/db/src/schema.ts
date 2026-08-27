import {
  pgTable, pgEnum, uuid, text, integer, doublePrecision, boolean,
  timestamp, jsonb, date, primaryKey, unique, vector, index,
} from 'drizzle-orm/pg-core';

/* ============================ ENUMS ============================ */
export const platformEnum = pgEnum('platform', ['tiktok', 'meta']);
export const roleEnum = pgEnum('member_role', ['owner', 'admin', 'member', 'client_viewer']);
export const creativeTypeEnum = pgEnum('creative_type', ['video', 'image', 'carousel']);
export const tagSourceEnum = pgEnum('tag_source', ['ai', 'human']);
export const bucketEnum = pgEnum('radar_bucket', ['winner', 'high_potential', 'iteration', 'kill_candidate', 'fatigued', 'insufficient']);
export const librarySourceEnum = pgEnum('library_source', ['trendtrack', 'tiktok_cc', 'tiktok_ccl', 'meta_al', 'chrome_ext']);
export const insightTypeEnum = pgEnum('insight_type', ['pain', 'desire', 'objection', 'language', 'usage']);
export const generationKindEnum = pgEnum('generation_kind', ['script', 'copy', 'image', 'video', 'ad']);
export const channelEnum = pgEnum('agent_channel', ['web', 'slack', 'whatsapp']);

/* ============================ CORE ============================ */
export const accountKindEnum = pgEnum('account_kind', ['normal', 'beta', 'staff']);
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  plan: text('plan').notNull().default('starter'),
  creditsBalance: integer('credits_balance').notNull().default(0),
  whiteLabel: jsonb('white_label_json'),
  accountKind: accountKindEnum('account_kind').notNull().default('normal'), // normal / beta / staff
  trialCredits: integer('trial_credits').notNull().default(0),               // crédits de test accordés
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),           // fin de la période d'essai
  driveRefreshToken: text('drive_refresh_token_enc'),                         // Google Drive OAuth (chiffré)
  driveFolderId: text('drive_folder_id'),                                     // dossier Drive synchronisé
  driveFolderName: text('drive_folder_name'),
  driveSyncedAt: timestamp('drive_synced_at', { withTimezone: true }),
  onboarding: jsonb('onboarding_json'),                                       // réponses d'onboarding (profil, niveau IA, objectifs…)
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),            // date de fin d'onboarding (null = à faire)
  stripeCustomerId: text('stripe_customer_id'),                              // client Stripe (paiement)
  stripeSubscriptionId: text('stripe_subscription_id'),                      // abonnement Stripe en cours
  subscriptionStatus: text('subscription_status'),                           // active / trialing / past_due / canceled…
  lastPlanCredits: integer('last_plan_credits').notNull().default(0),        // dernière allocation d'abonnement accordée
                                                                              // (permet de renouveler SANS effacer les crédits achetés)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  passwordHash: text('password_hash'),
  avatarUrl: text('avatar_url'),                                  // photo de profil (URL)
  hidePersonalInfo: boolean('hide_personal_info').notNull().default(false), // masquer les infos perso
  locale: text('locale').notNull().default('fr'),                // langue d'affichage
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable('workspace_members', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: roleEnum('role').notNull().default('member'),
}, (t) => ({ pk: primaryKey({ columns: [t.workspaceId, t.userId] }) }));

export const brands = pgTable('brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  url: text('url'),
  logoUrl: text('logo_url'),                        // logo par défaut (celui posé sur les créas)
  logos: text('logos').array(),                     // variantes de logo (clair, foncé, icône…)
  shopifyDomain: text('shopify_domain'),
  shopifyToken: text('shopify_token_enc'),          // token Admin API Shopify (chiffré)
  metaToken: text('meta_token_enc'),                // token Meta Marketing API (chiffré)
  metaAdAccountId: text('meta_ad_account_id'),       // ex : act_1234567890
  metaAdAccounts: jsonb('meta_ad_accounts_json'),    // comptes pub accessibles (choix par l'utilisateur)
  commerceInsights: jsonb('commerce_insights_json'), // KPIs Shopify synchronisés
  adsInsights: jsonb('ads_insights_json'),           // KPIs Meta Ads synchronisés
  insightsSyncedAt: timestamp('insights_synced_at', { withTimezone: true }),
  palette: jsonb('palette_json'),
  tone: text('tone'),
  industry: text('industry'),
  languages: text('languages').array(),
  brandKit: jsonb('brand_kit_json'),
  description: text('description'),
  usp: text('usp'),
  audience: text('audience'),
  category: text('category'),
  categoryNeeds: text('category_needs'),
  moreAbout: text('more_about'),
  industryTags: text('industry_tags').array(),
  colors: text('colors').array(),
  fonts: text('fonts').array(),
  preferredWords: text('preferred_words').array(),
  avoidWords: text('avoid_words').array(),
  competitors: text('competitors').array(),
  creativeRules: text('creative_rules'), // Règles maison Jarvis, injectées dans chaque génération.
  jarvisLearnings: text('jarvis_learnings'), // Patterns gagnants distillés (entraînement Jarvis sur la veille).
  jarvisTrainedAt: timestamp('jarvis_trained_at', { withTimezone: true }), // dernier entraînement
  driveRefreshToken: text('drive_refresh_token_enc'), // Google Drive OAuth (chiffré) · par marque
  driveFolderId: text('drive_folder_id'),             // dossier Drive synchronisé pour la marque
  driveFolderName: text('drive_folder_name'),
  driveSyncedAt: timestamp('drive_synced_at', { withTimezone: true }),
  // ADSMAP · cf. docs/adsmap/STACK.md
  vertical: text('vertical'),                          // FASHION, BEAUTY, HOME… (priors de portefeuille)
  namingPattern: text('naming_pattern'),               // {brand}_B{batch}_{concept}_{variant}_{variable}
  portfolioOptIn: boolean('portfolio_opt_in').notNull().default(false),
  adsmapSyncedAt: timestamp('adsmap_synced_at', { withTimezone: true }), // dernière mesure de la carte
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Scénarios d'usage d'une marque (contexte d'utilisation ciblé par les créas). */
export const scenarios = pgTable('scenarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  context: text('context'),
  imageUrl: text('image_url'),                      // vignette d'illustration (générée par l'IA)
});

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  usp: text('usp'),
  price: doublePrecision('price'),
  url: text('url'),
  imageUrl: text('image_url'),
  imageUrls: text('image_urls').array(),
});

// Bibliothèque d'assets (rushs, images, vidéos, audio, imports Drive) · alimente l'IA.
export const assetKindEnum = pgEnum('asset_kind', ['image', 'video', 'audio', 'other']);
export const assetSourceEnum = pgEnum('asset_source', ['upload', 'url', 'drive']);
export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'set null' }), // null = commun à l'espace
  uploaderUserId: uuid('uploader_user_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  kind: assetKindEnum('kind').notNull().default('image'),
  source: assetSourceEnum('source').notNull().default('upload'),
  url: text('url').notNull(),                 // data URI (image téléversée) ou URL externe
  externalId: text('external_id'),            // id source (ex : fichier Google Drive) pour dédup
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes'),
  tags: text('tags').array(),                 // tags IA (à venir)
  useForAi: boolean('use_for_ai').notNull().default(true), // l'IA s'en sert par défaut
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ wsIdx: index('assets_ws_idx').on(t.workspaceId), brandIdx: index('assets_brand_idx').on(t.brandId) }));

/**
 * Persona · c'est le modèle « Avatar » du cahier des charges ADSMAP, champ pour
 * champ (décision D2). On l'étend plutôt que d'en créer un second.
 */
export const personas = pgTable('personas', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  pains: text('pains').array(),
  desires: text('desires').array(),
  objections: text('objections').array(),              // ADSMAP
  sources: jsonb('sources_json'),                      // ADSMAP · avis, veille, entretien
  status: text('status').notNull().default('validated'), // proposed | validated | rejected | archived
});

/* ======================= AD ACCOUNTS / DATA ======================= */
export const adAccounts = pgTable('ad_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  platform: platformEnum('platform').notNull(),
  externalId: text('external_id').notNull(),
  accessTokenEnc: text('access_token_enc'),
  status: text('status').notNull().default('active'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
});

export const creatives = pgTable('creatives', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  adAccountId: uuid('ad_account_id').references(() => adAccounts.id, { onDelete: 'set null' }),
  fingerprintHash: text('fingerprint_hash').notNull(),
  type: creativeTypeEnum('type').notNull(),
  storageUrl: text('storage_url'),
  thumbUrl: text('thumb_url'),
  durationS: doublePrecision('duration_s'),
  transcript: text('transcript'),
  ocrText: text('ocr_text'),
  embedding: vector('embedding', { dimensions: 1536 }),
  // ADSMAP · analyse d'asset produite par l'agent A0, corrigeable à la main.
  analysis: jsonb('analysis_json'),                    // hook_spoken, claims[], proof_elements[], frames[]…
  hookType: text('hook_type'),                         // question | statement | callout | number | negative…
  openingType: text('opening_type'),                   // face_talking | product | problem_scene…
  talent: text('talent'),                              // ugc_creator | founder | actor | voice_over_only | none
  productFirstSec: doublePrecision('product_first_sec'),
  ctaFirstSec: doublePrecision('cta_first_sec'),
  cutsFirst10s: integer('cuts_first_10s'),
  hasCaptions: boolean('has_captions'),
  analysisModel: text('analysis_model'),
  analysisConfidence: doublePrecision('analysis_confidence'),
  analyzedAt: timestamp('analyzed_at', { withTimezone: true }),
}, (t) => ({ fpIdx: index('creatives_fp_idx').on(t.brandId, t.fingerprintHash) }));

/**
 * Face plateforme d'une annonce (l'objet côté régie). Déclarée lors d'un sprint
 * antérieur et restée inutilisée : ADSMAP la réveille plutôt que d'en créer une
 * jumelle (décision D1). `nameDims` reçoit la sortie du parser de nommage (§8.6),
 * les colonnes ad set / campagne servent au contrôle de protocole (§6.2).
 */
export const adInstances = pgTable('ad_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  creativeId: uuid('creative_id').notNull().references(() => creatives.id, { onDelete: 'cascade' }),
  externalAdId: text('external_ad_id').notNull(),
  campaignName: text('campaign_name'),
  adsetName: text('adset_name'),
  nameDims: jsonb('name_dims_json'),
  status: text('status'),
  // ADSMAP
  externalAdsetId: text('external_adset_id'),
  externalCampaignId: text('external_campaign_id'),
  adsetDailyBudget: doublePrecision('adset_daily_budget'),
  platform: platformEnum('platform').notNull().default('meta'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  extIdx: index('ad_instances_external_idx').on(t.externalAdId),
  // Clé de l'upsert quotidien · sans elle, chaque passage créerait un doublon.
  extUk: unique('ad_instances_external_uk').on(t.platform, t.externalAdId),
}));

export const metricsDaily = pgTable('metrics_daily', {
  adInstanceId: uuid('ad_instance_id').notNull().references(() => adInstances.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  spend: doublePrecision('spend').default(0),
  impressions: integer('impressions').default(0),
  reach: integer('reach').default(0),
  clicks: integer('clicks').default(0),
  conv: integer('conv').default(0),
  revenue: doublePrecision('revenue').default(0),
  v2s: integer('v2s').default(0),
  v3s: integer('v3s').default(0),
  v6s: integer('v6s').default(0),
  v15s: integer('v15s').default(0),
  p25: integer('p25').default(0),
  p50: integer('p50').default(0),
  p75: integer('p75').default(0),
  p100: integer('p100').default(0),
  avgWatch: doublePrecision('avg_watch').default(0),
  likes: integer('likes').default(0),
  comments: integer('comments').default(0),
  shares: integer('shares').default(0),
  // ADSMAP · nécessaires au funnel (§2.2) et au diagnostic CONVERT (§8.4).
  thruplays: integer('thruplays').default(0),
  linkClicks: integer('link_clicks').default(0),
  landingViews: integer('landing_views').default(0),
  addToCart: integer('add_to_cart').default(0),
  // NB: table à partitionner par mois (RANGE sur date) via migration SQL.
}, (t) => ({ pk: primaryKey({ columns: [t.adInstanceId, t.date] }) }));

export const creativeTags = pgTable('creative_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  creativeId: uuid('creative_id').notNull().references(() => creatives.id, { onDelete: 'cascade' }),
  dimension: text('dimension').notNull(),
  value: text('value').notNull(),
  confidence: doublePrecision('confidence'),
  source: tagSourceEnum('source').notNull().default('ai'),
}, (t) => ({ cIdx: index('creative_tags_creative_idx').on(t.creativeId) }));

export const radarScores = pgTable('radar_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  creativeId: uuid('creative_id').notNull().references(() => creatives.id, { onDelete: 'cascade' }),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  gradeHook: text('grade_hook'),
  gradeHold: text('grade_hold'),
  gradeCtr: text('grade_ctr'),
  gradeConv: text('grade_conv'),
  gradeOverall: text('grade_overall'),
  bucket: bucketEnum('bucket').notNull(),
  personaDetected: text('persona_detected'),
  diagnosis: jsonb('diagnosis_json'),
  recommendations: jsonb('recommendations_json'),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const alerts = pgTable('alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  creativeId: uuid('creative_id').references(() => creatives.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  payload: jsonb('payload_json'),
  sentChannels: text('sent_channels').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  ackedAt: timestamp('acked_at', { withTimezone: true }),
});

/* ======================= INSPO / BIBLIOTHÈQUE ======================= */
export const libraryBrands = pgTable('library_brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  domain: text('domain'),
  platforms: text('platforms').array(),
  industry: text('industry'),
  regions: text('regions').array(),
  activeAdsCount: integer('active_ads_count').default(0),
  velocity8w: doublePrecision('velocity_8w'),
  playbook: jsonb('playbook_json'),
  lastRefresh: timestamp('last_refresh', { withTimezone: true }),
});

export const libraryAds = pgTable('library_ads', {
  id: uuid('id').primaryKey().defaultRandom(),
  source: librarySourceEnum('source').notNull(),
  externalId: text('external_id'),
  platform: platformEnum('platform'),
  brandName: text('brand_name'),
  libraryBrandId: uuid('library_brand_id').references(() => libraryBrands.id, { onDelete: 'set null' }),
  mediaUrl: text('media_url'),
  storageUrl: text('storage_url'),
  format: text('format'),
  durationS: doublePrecision('duration_s'),
  firstSeen: date('first_seen'),
  lastSeen: date('last_seen'),
  isActive: boolean('is_active').default(true),
  landingUrl: text('landing_url'),
  copy: jsonb('copy_json'),
  transcript: text('transcript'),
  tags: jsonb('tags_json'),
  embedding: vector('embedding', { dimensions: 1536 }),
  raw: jsonb('raw_json'),
});

export const brandFollows = pgTable('brand_follows', {
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  libraryBrandId: uuid('library_brand_id').notNull().references(() => libraryBrands.id, { onDelete: 'cascade' }),
}, (t) => ({ pk: primaryKey({ columns: [t.brandId, t.libraryBrandId] }) }));

/* ======================= BOARDS / REVIEWS / BRIEFS ======================= */
export const boards = pgTable('boards', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  shareToken: text('share_token'),
  sharePasswordHash: text('share_password_hash'),
});

export const boardItems = pgTable('board_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  boardId: uuid('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
  libraryAdId: uuid('library_ad_id').references(() => libraryAds.id, { onDelete: 'set null' }),
  creativeId: uuid('creative_id').references(() => creatives.id, { onDelete: 'set null' }),
  section: text('section'),
  note: text('note'),
  order: integer('order').default(0),
});

export const reviewsSources = pgTable('reviews_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  url: text('url'),
  importedAt: timestamp('imported_at', { withTimezone: true }).defaultNow(),
});

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => reviewsSources.id, { onDelete: 'cascade' }),
  text: text('text'),
  rating: integer('rating'),
  date: date('date'),
});

export const insights = pgTable('insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  type: insightTypeEnum('type').notNull(),
  text: text('text').notNull(),
  frequency: integer('frequency').default(1),
  verbatims: text('verbatims').array(),
  originRef: text('origin_ref'),
});

export const briefs = pgTable('briefs', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  originType: text('origin_type'),
  originId: text('origin_id'),
  content: jsonb('content_json'),
  status: text('status').default('draft'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
});

export const generations = pgTable('generations', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  kind: generationKindEnum('kind').notNull(),
  input: jsonb('input_json'),
  output: jsonb('output_json'),
  assetUrls: text('asset_urls').array(),
  creditsCost: integer('credits_cost').default(0),
  status: text('status').default('queued'),
  jobId: text('job_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ======================= AGENT / BILLING / API ======================= */
export const agentThreads = pgTable('agent_threads', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  channel: channelEnum('channel').notNull().default('web'),
  messages: jsonb('messages_jsonb'),
});

export const agentMemory = pgTable('agent_memory', {
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: jsonb('value'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.brandId, t.key] }) }));

export const agentJobs = pgTable('agent_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  scheduleCron: text('schedule_cron'),
  lastRun: timestamp('last_run', { withTimezone: true }),
  nextRun: timestamp('next_run', { withTimezone: true }),
  config: jsonb('config_json'),
});

export const creditLedger = pgTable('credit_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  delta: integer('delta').notNull(),
  reason: text('reason').notNull(),
  refId: text('ref_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Événements Stripe déjà traités · Stripe livre « au moins une fois » et rejoue en cas
 * d'erreur : cette table garantit qu'un paiement n'est jamais crédité deux fois.
 */
export const stripeEvents = pgTable('stripe_events', {
  eventId: text('event_id').primaryKey(),
  type: text('type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Journal des echecs techniques · alimente par logAndTranslate.
 *
 * Les erreurs partaient uniquement dans les logs du conteneur, que personne ne
 * lit : un fournisseur qui deraille se decouvrait par un client mecontent. On
 * garde ici de quoi voir la tendance (quelle famille, quel scope, quel espace),
 * pas de quoi rejouer : le detail technique reste tronque et purge a 30 jours.
 */
export const errorLog = pgTable('error_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  scope: text('scope').notNull(),                 // ex : « studio:script », « video:start »
  family: text('family').notNull(),               // famille normalisee (timeout, reseau, quota…)
  detail: text('detail').notNull(),               // message technique tronque
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  atIdx: index('error_log_at_idx').on(t.createdAt),
  famIdx: index('error_log_family_idx').on(t.family),
}));

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  keyHash: text('key_hash').notNull(),
  scopes: text('scopes').array(),
  rateLimit: integer('rate_limit').default(60),
});

/* ===================== SUPPORT : tickets & suggestions ===================== */
export const ticketTypeEnum = pgEnum('ticket_type', ['bug', 'suggestion', 'question']);
export const ticketStatusEnum = pgEnum('ticket_status', ['open', 'in_progress', 'resolved']);

export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  authorName: text('author_name'),
  type: ticketTypeEnum('type').notNull().default('suggestion'),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  status: ticketStatusEnum('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ===================== Réglages plateforme (clé/valeur global, ADMIN+) ===================== */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ===================== Messages de tickets (fil de discussion) ===================== */
export const ticketMessages = pgTable('ticket_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  authorName: text('author_name'),
  body: text('body').notNull(),
  isStaff: boolean('is_staff').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ tIdx: index('ticket_messages_ticket_idx').on(t.ticketId) }));

/* ===================== Notifications (cloche, temps quasi réel) ===================== */
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),          // ticket_new | ticket_reply | ticket_status | system
  title: text('title').notNull(),
  body: text('body'),
  href: text('href'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uIdx: index('notifications_user_idx').on(t.userId, t.createdAt) }));

/* ===================== Invitations (inscription sur invitation) ===================== */
export const inviteStatusEnum = pgEnum('invite_status', ['pending', 'accepted', 'revoked']);

export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: roleEnum('role').notNull().default('member'),
  token: text('token').notNull().unique(),
  invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
  status: inviteStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
});

/** Jetons de réinitialisation de mot de passe (usage unique · courte durée). */
export const passwordResets = pgTable('password_resets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

/* ============== Inspo : créas sauvegardées & marques suivies ============== */
export const savedAds = pgTable('saved_ads', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),          // meta / tiktok / google
  externalId: text('external_id').notNull(),
  snapshot: jsonb('snapshot_json').notNull(),     // champs InspoAd pour l'affichage
  note: text('note'),
  folder: text('folder'),                          // board/dossier de rangement (null = non classé)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uniq: unique().on(t.workspaceId, t.platform, t.externalId) }));

export const followedBrands = pgTable('followed_brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  name: text('name').notNull(),
  externalId: text('external_id'),
  logoUrl: text('logo_url'),
  seenAdIds: jsonb('seen_ad_ids'),                 // ids d'annonces déjà vues (baseline anti-flood)
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uniq: unique().on(t.workspaceId, t.platform, t.name) }));

/** Nouveautés détectées chez une marque suivie (nouvelles pubs) · alimente le fil de veille. */
export const brandTrackerEvents = pgTable('brand_tracker_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  followedBrandId: uuid('followed_brand_id').references(() => followedBrands.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  advertiserName: text('advertiser_name').notNull(),
  kind: text('kind').notNull().default('new'),     // new (nouvelle pub) · scaling (à venir)
  snapshot: jsonb('snapshot_json').notNull(),      // InspoAd pour l'affichage
  seenAt: timestamp('seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ wsIdx: index('tracker_ws_idx').on(t.workspaceId, t.createdAt) }));

/* ========================================================================== *
 *                                  ADSMAP                                    *
 * Module de creative strategy · cf. docs/adsmap/STACK.md et DECISIONS.md.
 *
 * Le graphe est la donnée : Persona -> Desire -> Angle -> Concept -> Ad,
 * plus les arêtes d'itération, les verdicts et les apprentissages.
 *
 * Principe d'intégration (décision D1) : on ÉTEND l'existant plutôt que de le
 * doubler. `personas` est le modèle Avatar du cahier des charges ; `creatives`,
 * `ad_instances` et `metrics_daily` (déclarées mais jamais branchées) portent
 * l'analyse d'asset, la face plateforme d'une ad et ses métriques quotidiennes.
 * ========================================================================== */

export const nodeStatusEnum = pgEnum('adsmap_node_status', ['proposed', 'validated', 'rejected', 'archived']);
export const awarenessEnum = pgEnum('adsmap_awareness', ['unaware', 'problem_aware', 'solution_aware', 'product_aware', 'most_aware']);
export const desireTypeEnum = pgEnum('adsmap_desire_type', ['gain', 'pain_relief', 'status', 'control', 'belonging', 'safety']);
export const angleMechanismEnum = pgEnum('adsmap_angle_mechanism', [
  'problem_agitate', 'demo', 'social_proof', 'comparison', 'story', 'curiosity', 'authority',
  'scarcity', 'reverse', 'statistic_shock', 'diagnostic', 'us_vs_them', 'listicle',
]);
export const valenceEnum = pgEnum('adsmap_valence', ['negative', 'positive', 'neutral']);
export const adTypeEnum = pgEnum('adsmap_ad_type', ['ideation', 'iteration', 'imitation', 'new']);
export const adFormatEnum = pgEnum('adsmap_ad_format', ['video_ugc', 'video_vsl', 'video_demo', 'video_story', 'static', 'image_carousel', 'gif']);
export const adStatusEnum = pgEnum('adsmap_ad_status', ['draft', 'proposed', 'ready', 'live', 'paused', 'done']);
export const testedVariableEnum = pgEnum('adsmap_tested_variable', [
  'hook', 'opening_visual', 'body', 'length', 'cta', 'format', 'offer', 'landing',
  'avatar_on_screen', 'proof', 'audio', 'angle', 'desire', 'none_control',
]);
export const funnelStageEnum = pgEnum('adsmap_funnel_stage', ['hook', 'hold', 'click', 'convert']);
export const iterationModeEnum = pgEnum('adsmap_iteration_mode', ['more', 'better', 'new']);
export const batchStatusEnum = pgEnum('adsmap_batch_status', ['planned', 'in_production', 'ready', 'testing', 'analyzed']);
export const verdictValueEnum = pgEnum('adsmap_verdict_value', [
  'winner', 'baby_winner', 'loser', 'inconclusive', 'insufficient_delivery', 'relative_winner',
]);
export const verdictStatusEnum = pgEnum('adsmap_verdict_status', ['computed', 'validated']);
export const killReasonEnum = pgEnum('adsmap_kill_reason', ['hook', 'click', 'convert', 'cost']);
export const protocolStructureEnum = pgEnum('adsmap_protocol_structure', ['abo_one_adset_per_ad', 'abo_single_adset', 'cbo_tolerated']);
export const pageTypeEnum = pgEnum('adsmap_page_type', ['pdp', 'collection', 'advertorial', 'listicle', 'quiz', 'home']);
export const croStatusEnum = pgEnum('adsmap_cro_status', ['ok', 'to_audit', 'in_optimization']);
export const learningScopeEnum = pgEnum('adsmap_learning_scope', [
  'ad', 'concept', 'angle', 'desire', 'avatar', 'format', 'element', 'landing', 'offer',
]);
export const statDimensionEnum = pgEnum('adsmap_stat_dimension', [
  'mechanism', 'hook_type', 'format', 'length_bucket', 'awareness', 'avatar', 'talent', 'opening_type', 'element',
]);
export const elementTypeEnum = pgEnum('adsmap_element_type', ['hook_spoken', 'hook_text', 'opening_visual', 'proof', 'cta', 'offer_line', 'sound']);
export const elementOriginEnum = pgEnum('adsmap_element_origin', ['extracted', 'authored', 'ai_proposed']);
export const hookTypeEnum = pgEnum('adsmap_hook_type', ['question', 'statement', 'callout', 'number', 'negative', 'curiosity', 'command']);
export const openingTypeEnum = pgEnum('adsmap_opening_type', ['face_talking', 'product', 'problem_scene', 'text_card', 'before_after', 'pattern_interrupt']);
export const talentTypeEnum = pgEnum('adsmap_talent_type', ['ugc_creator', 'founder', 'actor', 'voice_over_only', 'none']);
export const decisionTypeEnum = pgEnum('adsmap_decision_type', [
  'validate_verdict', 'review_learning', 'accept_iteration', 'kill_suggested', 'coverage_gap',
  'unmapped_ad', 'protocol_violation', 'cro_handoff', 'prelaunch_warning', 'ai_budget_reached',
]);
export const decisionStatusEnum = pgEnum('adsmap_decision_status', ['open', 'done', 'dismissed', 'snoozed']);
export const agentNameEnum = pgEnum('adsmap_agent', ['a0_tagger', 'a1_research', 'a2_concept', 'a3_brief', 'a4_analyst', 'a5_iteration', 'a6_coverage', 'a7_prelaunch', 'a8_report']);

/* ------------------------------ Graphe ----------------------------------- */

/** Désir d'un persona, porteur du stade de conscience (Schwartz). */
export const desires = pgTable('adsmap_desires', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  personaId: uuid('persona_id').notNull().references(() => personas.id, { onDelete: 'cascade' }),
  awarenessStage: awarenessEnum('awareness_stage').notNull().default('problem_aware'),
  label: text('label').notNull(),
  type: desireTypeEnum('type').notNull().default('gain'),
  intensity: integer('intensity').notNull().default(3),   // 1 à 5
  status: nodeStatusEnum('status').notNull().default('proposed'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ personaIdx: index('adsmap_desires_persona_idx').on(t.personaId) }));

/** Angle : la manière d'attaquer un désir. `valueScore` = équation de valeur (§2.1). */
export const angles = pgTable('adsmap_angles', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  desireId: uuid('desire_id').notNull().references(() => desires.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  mechanism: angleMechanismEnum('mechanism').notNull(),
  valence: valenceEnum('valence').notNull().default('neutral'),
  valueScore: jsonb('value_score_json'),                  // { dream, probability, delay, effort, total }
  status: nodeStatusEnum('status').notNull().default('proposed'),
  lastTestedAt: timestamp('last_tested_at', { withTimezone: true }), // grisage au-delà de 60 j (§7.5)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ desireIdx: index('adsmap_angles_desire_idx').on(t.desireId) }));

/** Offre testée (prix, remise, garantie, bundle). Rend la variable OFFER testable. */
export const offers = pgTable('adsmap_offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  price: doublePrecision('price'),
  discount: text('discount'),
  guarantee: text('guarantee'),
  bundle: boolean('bundle').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ brandIdx: index('adsmap_offers_brand_idx').on(t.brandId) }));

/**
 * Page de destination. `cvr30d` est saisi à la main en v1 : l'Admin API Shopify
 * branchée lit les commandes, pas les sessions (décision D5).
 */
export const landingPages = pgTable('adsmap_landing_pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  label: text('label').notNull(),
  pageType: pageTypeEnum('page_type').notNull().default('pdp'),
  cvr30d: doublePrecision('cvr_30d'),
  aov30d: doublePrecision('aov_30d'),
  croStatus: croStatusEnum('cro_status').notNull().default('ok'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ brandIdx: index('adsmap_landing_brand_idx').on(t.brandId) }));

/** Concept : la promesse écrite (call-out / value / CTA), avant production. */
export const concepts = pgTable('adsmap_concepts', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  angleId: uuid('angle_id').notNull().references(() => angles.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  callout: text('callout'),
  valueBlock: text('value_block'),
  cta: text('cta'),
  hookOptions: text('hook_options').array(),
  adType: adTypeEnum('ad_type').notNull().default('ideation'),
  sourceRef: jsonb('source_ref_json'),                    // ad Trendtrack imitée, asset d'origine…
  prelaunchScore: jsonb('prelaunch_score_json'),          // { band, p_hook_ok, p_conclusive_win, drivers[] }
  status: nodeStatusEnum('status').notNull().default('proposed'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ angleIdx: index('adsmap_concepts_angle_idx').on(t.angleId) }));

/** Lot de test : une campagne dédiée, une fenêtre, un protocole vérifié. */
export const batches = pgTable('adsmap_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
  goal: text('goal'),
  status: batchStatusEnum('status').notNull().default('planned'),
  launchedAt: timestamp('launched_at', { withTimezone: true }),
  plannedEndAt: timestamp('planned_end_at', { withTimezone: true }),
  testCampaignIds: jsonb('test_campaign_ids_json'),
  protocolCheck: jsonb('protocol_check_json'),            // { compliant, violations[] } · §6.2
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ brandNum: unique('adsmap_batches_brand_number').on(t.brandId, t.number) }));

/**
 * Une annonce testée. `hypothesis`, `testedVariable`, `offerId` et `landingPageId`
 * sont obligatoires dès READY (invariant §2.4, décision de Kévin) · la contrainte
 * est posée en SQL plus bas.
 *
 * `creativeId` relie à la table `creatives` (asset + transcript + embedding), et
 * `ad_instances` porte la face plateforme. Rien n'est dupliqué.
 */
export const ads = pgTable('adsmap_ads', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  conceptId: uuid('concept_id').notNull().references(() => concepts.id, { onDelete: 'cascade' }),
  batchId: uuid('batch_id').references(() => batches.id, { onDelete: 'set null' }),
  creativeId: uuid('creative_id').references(() => creatives.id, { onDelete: 'set null' }),
  variantCode: text('variant_code').notNull(),            // v1, v2, h2…
  format: adFormatEnum('format').notNull().default('video_ugc'),
  adType: adTypeEnum('ad_type').notNull().default('ideation'),
  hypothesis: text('hypothesis'),
  testedVariable: testedVariableEnum('tested_variable'),
  variableValue: text('variable_value'),
  offerId: uuid('offer_id').references(() => offers.id, { onDelete: 'set null' }),
  landingPageId: uuid('landing_page_id').references(() => landingPages.id, { onDelete: 'set null' }),
  briefUrl: text('brief_url'),
  assetUrl: text('asset_url'),
  platform: platformEnum('platform').notNull().default('meta'),
  externalIds: jsonb('external_ids_json'),                // { ad_id, adset_id, campaign_id }
  generatedName: text('generated_name'),                  // nom attendu côté régie (§8.6)
  launchedAt: timestamp('launched_at', { withTimezone: true }),
  status: adStatusEnum('status').notNull().default('draft'),
  legacyFlags: text('legacy_flags').array(),              // ex : legacy_missing_hypothesis (import §13)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  variant: unique('adsmap_ads_variant').on(t.conceptId, t.batchId, t.variantCode),
  batchIdx: index('adsmap_ads_batch_idx').on(t.batchId),
  statusIdx: index('adsmap_ads_status_idx').on(t.workspaceId, t.status),
}));

/** Filiation : une itération pointe toujours vers son parent (invariant §2.4). */
export const iterationEdges = pgTable('adsmap_iteration_edges', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  childAdId: uuid('child_ad_id').notNull().references(() => ads.id, { onDelete: 'cascade' }),
  parentAdId: uuid('parent_ad_id').notNull().references(() => ads.id, { onDelete: 'cascade' }),
  mode: iterationModeEnum('mode').notNull().default('better'),
  changedVariable: testedVariableEnum('changed_variable').notNull(),
  stageTargeted: funnelStageEnum('stage_targeted'),
  rationale: text('rationale'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  child: unique('adsmap_iteration_child').on(t.childAdId),
  parentIdx: index('adsmap_iteration_parent_idx').on(t.parentAdId),
}));

/* --------------------------- Test et verdict ------------------------------ */

/** Protocole de test par marque · rend les verdicts comparables (§6.2). */
export const testProtocols = pgTable('adsmap_test_protocols', {
  brandId: uuid('brand_id').primaryKey().references(() => brands.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  structure: protocolStructureEnum('structure').notNull().default('abo_one_adset_per_ad'),
  dailyBudgetPerAd: doublePrecision('daily_budget_per_ad').notNull().default(20),
  durationDays: integer('duration_days').notNull().default(7),
  audienceRule: text('audience_rule').notNull().default('broad, même audience pour toutes les ads du batch'),
  campaignNamePattern: text('campaign_name_pattern').notNull().default('[ADSMAP] TEST {brand} B{batch}'),
  budgetVarianceTolerance: doublePrecision('budget_variance_tolerance').notNull().default(0.2),
});

/** Seuils de verdict par marque (§6.3). Réglés par l'assistant à la création. */
export const verdictConfigs = pgTable('adsmap_verdict_configs', {
  brandId: uuid('brand_id').primaryKey().references(() => brands.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  config: jsonb('config_json').notNull(),                 // cf. VerdictConfig, validé par schéma en code
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Verdict calculé, éventuellement corrigé à la main avec motif obligatoire. */
export const verdicts = pgTable('adsmap_verdicts', {
  adId: uuid('ad_id').primaryKey().references(() => ads.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  // Nullable : le §13 importe des verdicts HUMAINS (colonne « Résultats ») sans
  // qu'aucun calcul n'ait eu lieu · `computed` reste vide jusqu'au premier passage
  // du moteur sur des métriques réelles.
  computed: verdictValueEnum('computed'),
  validated: verdictValueEnum('validated'),
  status: verdictStatusEnum('status').notNull().default('computed'),
  comparable: boolean('comparable').notNull().default(false),
  metricsAgg: jsonb('metrics_agg_json'),                  // agrégats, intervalles, rangs, seuils appliqués
  failedStage: funnelStageEnum('failed_stage'),
  killFlag: killReasonEnum('kill_flag'),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  validatedBy: uuid('validated_by').references(() => users.id, { onDelete: 'set null' }),
  overrideReason: text('override_reason'),
}, (t) => ({ wsIdx: index('adsmap_verdicts_ws_idx').on(t.workspaceId, t.computed) }));

/** Apprentissage validé · un verdict validé en exige au moins un (invariant §2.4). */
export const learnings = pgTable('adsmap_learnings', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  adId: uuid('ad_id').references(() => ads.id, { onDelete: 'set null' }),
  conceptId: uuid('concept_id').references(() => concepts.id, { onDelete: 'set null' }),
  angleId: uuid('angle_id').references(() => angles.id, { onDelete: 'set null' }),
  elementId: uuid('element_id').references(() => creativeElements.id, { onDelete: 'set null' }),
  scope: learningScopeEnum('scope').notNull(),
  stage: funnelStageEnum('stage'),
  statement: text('statement').notNull(),
  evidence: jsonb('evidence_json'),                       // chiffre obligatoire (§8.3 A4)
  confidence: integer('confidence').notNull().default(3), // 1 à 5
  refuted: boolean('refuted').notNull().default(false),   // ne pas reproposer sur la même étape
  status: nodeStatusEnum('status').notNull().default('proposed'),
  embedding: vector('embedding', { dimensions: 1536 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ brandIdx: index('adsmap_learnings_brand_idx').on(t.brandId, t.scope) }));

/* --------------------- Mémoire calculée et bibliothèque ------------------- */

/** Statistiques recalculées chaque nuit · mémoire principale des agents (§8.1). */
export const brandStats = pgTable('adsmap_brand_stats', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  dimension: statDimensionEnum('dimension').notNull(),
  key: text('key').notNull(),
  nAds: integer('n_ads').notNull().default(0),
  nConclusive: integer('n_conclusive').notNull().default(0),
  nWinners: integer('n_winners').notNull().default(0),
  nBaby: integer('n_baby').notNull().default(0),
  hitRate: doublePrecision('hit_rate'),
  hookRateMedian: doublePrecision('hook_rate_median'),
  holdRateMedian: doublePrecision('hold_rate_median'),
  ctrMedian: doublePrecision('ctr_median'),
  cpaMedian: doublePrecision('cpa_median'),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uniq: unique('adsmap_brand_stats_key').on(t.brandId, t.dimension, t.key) }));

/** Élément créatif réutilisable (hook, ouverture, preuve, CTA…) · §9. */
export const creativeElements = pgTable('adsmap_creative_elements', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  type: elementTypeEnum('type').notNull(),
  content: text('content').notNull(),
  fingerprint: text('fingerprint').notNull(),             // hash du contenu normalisé (dédup)
  origin: elementOriginEnum('origin').notNull().default('extracted'),
  embedding: vector('embedding', { dimensions: 1536 }),   // pgvector actif depuis la migration 0000
  stats: jsonb('stats_json'),                             // { uses, conclusive, winners, hit_rate, … }
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uniq: unique('adsmap_elements_fingerprint').on(t.brandId, t.type, t.fingerprint) }));

/** Rattachement d'un élément à une ad (permet de mesurer ce qui marche). */
export const adElements = pgTable('adsmap_ad_elements', {
  adId: uuid('ad_id').notNull().references(() => ads.id, { onDelete: 'cascade' }),
  elementId: uuid('element_id').notNull().references(() => creativeElements.id, { onDelete: 'cascade' }),
  position: integer('position'),
}, (t) => ({ pk: primaryKey({ columns: [t.adId, t.elementId] }) }));

/** Prior anonymisé, jamais rattaché à une marque (§11). */
export const portfolioInsights = pgTable('adsmap_portfolio_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  vertical: text('vertical'),
  dimension: statDimensionEnum('dimension').notNull(),
  key: text('key').notNull(),
  nBrands: integer('n_brands').notNull(),
  nAds: integer('n_ads').notNull(),
  hitRate: doublePrecision('hit_rate'),
  hookRateMedian: doublePrecision('hook_rate_median'),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uniq: unique('adsmap_portfolio_key').on(t.vertical, t.dimension, t.key) }));

/* ------------------------ Décisions et exécution -------------------------- */

/** File de décisions produite chaque nuit · l'humain arbitre, il ne lance pas (§10). */
export const decisionItems = pgTable('adsmap_decision_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  type: decisionTypeEnum('type').notNull(),
  priority: integer('priority').notNull().default(3),     // 1 = argent qui brûle
  payload: jsonb('payload_json'),
  spendAtStake: doublePrecision('spend_at_stake'),        // tri secondaire de l'inbox
  status: decisionStatusEnum('status').notNull().default('open'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ inbox: index('adsmap_decisions_inbox_idx').on(t.brandId, t.status, t.priority) }));

/** Trace d'un appel d'agent · coût rattaché au grand livre de crédits (décision D7). */
export const agentRuns = pgTable('adsmap_agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'set null' }),
  agent: agentNameEnum('agent').notNull(),
  inputRef: jsonb('input_ref_json'),
  output: jsonb('output_json'),
  model: text('model'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  credits: integer('credits').notNull().default(0),
  costEur: doublePrecision('cost_eur'),                   // coût réel, d'après les tokens renvoyés
  estimatedEur: doublePrecision('estimated_eur'),         // estimation préalable · l'écart se mesure (cible < 25 %)
  accepted: boolean('accepted'),                          // mesure du taux d'acceptation (§16)
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ wsIdx: index('adsmap_agent_runs_ws_idx').on(t.workspaceId, t.agent) }));

/**
 * Plafond de dépense IA par marque (addendum v2.1 · C2).
 *
 * L'orchestrateur tourne la nuit, sans personne devant l'écran : sans plafond,
 * une marque avec beaucoup d'assets non taggés peut consommer un mois de budget
 * en une nuit, et on l'apprend sur la facture. Les étapes déterministes
 * (verdicts, kill rules, contrôle de protocole) ne sont jamais bloquées : elles
 * ne coûtent rien et portent l'essentiel de la valeur.
 */
export const aiBudgets = pgTable('adsmap_ai_budgets', {
  brandId: uuid('brand_id').primaryKey().references(() => brands.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  monthlyCapEur: doublePrecision('monthly_cap_eur').notNull().default(40),
  nightlyCapEur: doublePrecision('nightly_cap_eur').notNull().default(3),
  softWarnRatio: doublePrecision('soft_warn_ratio').notNull().default(0.8),
  spentMonthEur: doublePrecision('spent_month_eur').notNull().default(0),   // recalculé depuis agent_runs
  spentNightEur: doublePrecision('spent_night_eur').notNull().default(0),   // remis à zéro à chaque run
  paused: boolean('paused').notNull().default(false),
  dryRun: boolean('dry_run').notNull().default(false),   // la 1re semaine d'une marque : on liste sans exécuter
  periodMonth: text('period_month'),                     // « 2026-08 » · bascule = remise à zéro du mois
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Lien de partage de la vue client en marque blanche (§12). */
export const clientShareLinks = pgTable('adsmap_client_share_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  scopes: jsonb('scopes_json'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
