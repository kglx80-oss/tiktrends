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
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  plan: text('plan').notNull().default('starter'),
  creditsBalance: integer('credits_balance').notNull().default(0),
  whiteLabel: jsonb('white_label_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  passwordHash: text('password_hash'),
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
  logoUrl: text('logo_url'),
  shopifyDomain: text('shopify_domain'),
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
  creativeRules: text('creative_rules'), // Règles maison EDEN, injectées dans chaque génération.
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Scénarios d'usage d'une marque (contexte d'utilisation ciblé par les créas). */
export const scenarios = pgTable('scenarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  context: text('context'),
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

export const personas = pgTable('personas', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  pains: text('pains').array(),
  desires: text('desires').array(),
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
}, (t) => ({ fpIdx: index('creatives_fp_idx').on(t.brandId, t.fingerprintHash) }));

export const adInstances = pgTable('ad_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  creativeId: uuid('creative_id').notNull().references(() => creatives.id, { onDelete: 'cascade' }),
  externalAdId: text('external_ad_id').notNull(),
  campaignName: text('campaign_name'),
  adsetName: text('adset_name'),
  nameDims: jsonb('name_dims_json'),
  status: text('status'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uniq: unique().on(t.workspaceId, t.platform, t.name) }));
