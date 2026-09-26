/**
 * Recette · fixtures de performance pour la RECETTE LOCALE.
 *
 * ── Ce que ce script fait, et ne fera jamais ─────────────────────────────────
 *
 * Il pose sur UNE marque locale un jeu cohérent et clairement synthétique :
 * lots d'essai, notes (Score Jarvis), relectures de copie, attribution
 * « avec / sans mémoire », tendance, et la mémoire mesurée par dimension. Ces
 * données remplissent les sections qui, base vide, ne montrent que leur état
 * « données insuffisantes » · on ne peut pas juger un rendu rempli sur un écran
 * vide.
 *
 * Ce ne sont PAS des performances réelles présentées comme telles · l'interdit
 * de la charte porte là-dessus, pas sur les données de test. La marque cible
 * doit être une marque de démonstration locale, et le script REFUSE de tourner
 * ailleurs (voir `destinationLocaleAutorisee`, éprouvée par
 * `test/seed-fixtures-garde.test.ts`).
 *
 * ── Garanties ────────────────────────────────────────────────────────────────
 *
 * · N'écrit que des INSERT idempotents (UUID fixes, ON CONFLICT DO NOTHING) ·
 *   il n'efface ni ne modifie aucune ligne existante ;
 * · aucun secret en dur · l'URL vient de l'environnement ;
 * · refuse toute destination non locale, et exige une confirmation explicite.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   DATABASE_URL='postgresql://postgres@127.0.0.1:5433/tiktrends' \
 *   SEED_FIXTURES_CONFIRM=oui-base-locale \
 *   SEED_BRAND_ID=<uuid marque démo> SEED_WORKSPACE_ID=<uuid workspace> \
 *   node scripts/seed-fixtures.mjs
 */

import { fileURLToPath } from 'node:url';
// `postgres` est importé PARESSEUSEMENT dans main() · le garde
// (`destinationLocaleAutorisee`) reste importable sans tirer le pilote base,
// pour que son test tourne dans l'app sans cette dépendance.

/* -------------------------------------------------------------------------- */
/*  Le garde de destination · éprouvé par mutation dans le test               */
/* -------------------------------------------------------------------------- */

/** Hôtes tenus pour locaux · une base de production n'y répond jamais. */
const HOTES_LOCAUX = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);

/**
 * La destination est-elle une base LOCALE autorisée ?
 *
 * Refuse tout ce qui n'est pas un hôte local · pas de socket distante, pas de
 * nom d'hôte managé (rds, ovh, supabase, neon…), pas d'URL vide. Pur · pas
 * d'accès réseau, testable en cassant volontairement chaque condition.
 *
 * @param {string | undefined} url
 * @param {string | undefined} confirm
 * @returns {{ ok: true } | { ok: false; raison: string }}
 */
export function destinationLocaleAutorisee(url, confirm) {
  if (!url) return { ok: false, raison: 'DATABASE_URL absente.' };
  let hote;
  try {
    hote = new URL(url).hostname;
  } catch {
    return { ok: false, raison: 'DATABASE_URL illisible.' };
  }
  if (!HOTES_LOCAUX.has(hote)) {
    return { ok: false, raison: `Hôte « ${hote} » non local · la recette ne tourne que sur une base locale dédiée.` };
  }
  if (confirm !== 'oui-base-locale') {
    return { ok: false, raison: 'Confirmation manquante · pose SEED_FIXTURES_CONFIRM=oui-base-locale pour autoriser l’écriture.' };
  }
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Construction du jeu synthétique                                            */
/* -------------------------------------------------------------------------- */

/** UUID déterministe · bloc de tête reconnaissable, index en queue. */
const U = (bloc, n) => `${bloc}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const daysAgo = (d) => new Date(Date.now() - d * 86400e3);

const MODELES = ['nano-banana-2', 'gpt-image-2'];
const TEMPLATES = ['Témoignage', 'Démo produit', 'Comparatif'];
const LAYOUTS = ['Cadre', 'Plein', 'Bandeau'];
const UNIVERS = ['Épuré', 'Vitaminé', 'Naturel'];
const HOOKS = ['question', 'statement', 'number'];
const OPENINGS = ['face_talking', 'product', 'problem_scene'];
const TALENTS = ['ugc_creator', 'founder'];
const DURS = [12, 22, 35];
const MECAS = ['demo', 'social_proof', 'comparison'];
const AWARENESS = ['problem_aware', 'solution_aware', 'product_aware'];

/**
 * Décrit chaque ad par ses attributs · le graphe (persona → désir → angle →
 * concept) est bâti À LA VOLÉE et dédupliqué par clé, pour ne pas répéter des
 * dizaines d'INSERT à la main. `conceptKey` partagé = plusieurs ads sous un
 * concept (le cas « ambigu » que l'attribution doit écarter).
 *
 * @returns {Array<object>}
 */
function specsAds() {
  /** @type {Array<object>} */
  const ads = [];
  const push = (o) => ads.push(o);

  // ── Groupe A · générées AVEC mémoire, plutôt gagnantes (9) ────────────────
  // Dont un lot d'essai « mise en page » (Cadre vs Plein) sur 3 répétitions.
  const memAvecPlein = { measured: true, market: true, hooks: 6 };
  const memAvecSobre = { measured: true, market: false, hooks: 0 };
  const mepArms = [['Cadre', 'Plein'], ['Cadre', 'Plein'], ['Cadre', 'Plein']];
  let i = 0;
  for (let g = 0; g < 3; g++) {
    for (let a = 0; a < 2; a++) {
      const gagne = a === 1; // « Plein » gagne 3 fois sur 3 · signal net
      push({
        persona: g % 2, awareness: AWARENESS[g % 3], meca: MECAS[g % 3],
        conceptKey: `A-mep-${g}-${a}`,
        verdict: gagne ? 'winner' : 'loser', status: 'validated', comparable: true,
        memory: a === 0 ? memAvecSobre : memAvecPlein,
        essai: { variable: 'mise_en_page', groupe: `mep-${g + 1}` },
        layout: mepArms[g][a], universe: UNIVERS[g % 3], template: TEMPLATES[g % 3],
        model: MODELES[i % 2], score: 70 + a * 12, defauts: [], daysAgoV: 6 + i * 2,
        hook: HOOKS[i % 3], opening: OPENINGS[i % 3], talent: TALENTS[i % 2], dur: DURS[i % 3],
        note: true, relue: true, produitFidele: a === 1, texteLisible: true, grave: false,
      });
      i++;
    }
  }
  // Trois gagnantes « avec mémoire » de plus, hors lot d'essai.
  for (let k = 0; k < 3; k++) {
    push({
      persona: k % 2, awareness: AWARENESS[k % 3], meca: MECAS[k % 3],
      conceptKey: `A-solo-${k}`,
      verdict: k === 2 ? 'baby_winner' : 'winner', status: 'validated', comparable: true,
      memory: memAvecPlein, essai: null,
      layout: LAYOUTS[k % 3], universe: UNIVERS[k % 3], template: TEMPLATES[k % 3],
      model: MODELES[k % 2], score: 78 + k * 4, defauts: [], daysAgoV: 4 + k,
      hook: HOOKS[k % 3], opening: OPENINGS[k % 3], talent: TALENTS[k % 2], dur: DURS[k % 3],
      note: true, relue: true, produitFidele: true, texteLisible: true, grave: false,
    });
  }

  // ── Groupe B · témoins SANS mémoire, plus anciens, plutôt perdants (8) ─────
  // Dont un lot d'essai « univers » (Épuré vs Vitaminé) sur 2 répétitions.
  for (let g = 0; g < 2; g++) {
    for (let a = 0; a < 2; a++) {
      const gagne = a === 0; // « Épuré » gagne · autre signal
      push({
        persona: g % 2, awareness: AWARENESS[(g + 1) % 3], meca: MECAS[(g + 1) % 3],
        conceptKey: `B-uni-${g}-${a}`,
        verdict: gagne ? 'winner' : 'loser', status: 'validated', comparable: true,
        memory: null,
        essai: { variable: 'univers', groupe: `uni-${g + 1}` },
        layout: LAYOUTS[a % 3], universe: a === 0 ? 'Épuré' : 'Vitaminé', template: TEMPLATES[g % 3],
        model: MODELES[(g + a) % 2], score: 52 + a * 6, defauts: a === 1 ? ['illisible'] : [], daysAgoV: 34 + g * 5 + a,
        hook: HOOKS[(g + a) % 3], opening: OPENINGS[(g + a) % 3], talent: TALENTS[(g + a) % 2], dur: DURS[(g + a) % 3],
        note: true, relue: true, produitFidele: a === 0 ? true : false, texteLisible: a === 0, grave: a === 1,
      });
    }
  }
  // Quatre témoins perdants de plus (rate témoin bas).
  for (let k = 0; k < 4; k++) {
    push({
      persona: k % 2, awareness: AWARENESS[k % 3], meca: MECAS[k % 3],
      conceptKey: `B-solo-${k}`,
      verdict: k === 0 ? 'winner' : 'loser', status: 'validated', comparable: true,
      memory: null, essai: null,
      layout: LAYOUTS[k % 3], universe: UNIVERS[k % 3], template: TEMPLATES[k % 3],
      model: MODELES[k % 2], score: 44 + k * 3, defauts: k === 1 ? ['produit_deforme'] : [], daysAgoV: 40 + k * 4,
      hook: HOOKS[k % 3], opening: OPENINGS[k % 3], talent: TALENTS[k % 2], dur: DURS[k % 3],
      note: true, relue: true, produitFidele: k === 0, texteLisible: k !== 1, grave: k === 1,
    });
  }

  // ── Groupe C · deux concepts partagés → lien ambigu → écartés (4) ─────────
  for (let c = 0; c < 2; c++) {
    for (let a = 0; a < 2; a++) {
      push({
        persona: c % 2, awareness: AWARENESS[c % 3], meca: MECAS[c % 3],
        conceptKey: `C-amb-${c}`, // MÊME concept pour a=0 et a=1 → ambigu
        verdict: a === 0 ? 'winner' : 'loser', status: 'validated', comparable: true,
        memory: { measured: true, market: true, hooks: 4 }, essai: null,
        layout: LAYOUTS[a % 3], universe: UNIVERS[c % 3], template: TEMPLATES[c % 3],
        model: MODELES[a % 2], score: 60 + a * 5, defauts: [], daysAgoV: 12 + c * 3 + a,
        hook: HOOKS[a % 3], opening: OPENINGS[a % 3], talent: TALENTS[a % 2], dur: DURS[a % 3],
        note: true, relue: true, produitFidele: true, texteLisible: true, grave: false,
        ambiguClone: a === 1, // la 2e ad du concept ne relie PAS sa génération à l'ad
      });
    }
  }

  // ── Groupe D · sans verdict · nourrissent notes/relectures, pas la mémoire (3)
  for (let k = 0; k < 3; k++) {
    push({
      persona: k % 2, awareness: AWARENESS[k % 3], meca: MECAS[k % 3],
      conceptKey: `D-solo-${k}`,
      verdict: null, status: null, comparable: false,
      memory: { measured: true, market: false, hooks: 0 }, essai: null,
      layout: LAYOUTS[k % 3], universe: UNIVERS[k % 3], template: TEMPLATES[k % 3],
      model: MODELES[k % 2], score: 66 + k * 4, defauts: [], daysAgoV: 3 + k,
      hook: HOOKS[k % 3], opening: OPENINGS[k % 3], talent: TALENTS[k % 2], dur: DURS[k % 3],
      note: true, relue: true, produitFidele: null, texteLisible: null, grave: false,
    });
  }

  return ads;
}

/* -------------------------------------------------------------------------- */
/*  Écriture                                                                   */
/* -------------------------------------------------------------------------- */

async function seed(sql, { workspaceId, brandId, authorId }) {
  const specs = specsAds();

  // Le graphe amont, dédupliqué par clé.
  const personaId = (p) => U('be5011a0', p);
  const personaNoms = ['Sportifs pressés', 'Parents fatigués'];
  const desireKey = new Map(); const angleKey = new Map(); const conceptKey = new Map();
  let dSeq = 0, aSeq = 0, cSeq = 0, creaSeq = 0;

  const personas = []; const desires = []; const angles = []; const concepts = [];
  const creatives = []; const ads = []; const generations = []; const verdicts = [];
  const elements = []; const adElements = [];

  // Deux personas.
  for (let p = 0; p < 2; p++) {
    personas.push({ id: personaId(p), brand_id: brandId, name: personaNoms[p], status: 'validated' });
  }

  // Trois éléments créatifs réutilisés · la dimension « éléments réutilisés ».
  const elementDefs = [
    { id: U('e1e1e100', 1), type: 'hook_text', content: 'Avant / après en 7 jours' },
    { id: U('e1e1e100', 2), type: 'proof', content: '4,8/5 sur 2 300 avis vérifiés' },
    { id: U('e1e1e100', 3), type: 'cta', content: 'J’essaie sans risque' },
  ];
  const J = sql.json; // marque une valeur comme jsonb (clés internes préservées)
  for (const e of elementDefs) {
    elements.push({
      id: e.id, workspace_id: workspaceId, brand_id: brandId, type: e.type, content: e.content,
      fingerprint: `fx-${e.id}`, origin: 'authored',
      stats_json: J({ uses: 0, conclusive: 0, winners: 0 }),
    });
  }

  specs.forEach((s, idx) => {
    // désir (persona + awareness)
    const dk = `${s.persona}|${s.awareness}`;
    if (!desireKey.has(dk)) {
      const id = U('de511e00', ++dSeq);
      desireKey.set(dk, id);
      desires.push({ id, workspace_id: workspaceId, persona_id: personaId(s.persona), awareness_stage: s.awareness, label: `Désir ${dSeq}`, type: 'gain', status: 'validated' });
    }
    // angle (désir + mécanisme)
    const ak = `${dk}|${s.meca}`;
    if (!angleKey.has(ak)) {
      const id = U('a2911e00', ++aSeq);
      angleKey.set(ak, id);
      angles.push({ id, workspace_id: workspaceId, desire_id: desireKey.get(dk), label: `Angle ${aSeq}`, mechanism: s.meca, status: 'validated' });
    }
    // concept (clé explicite · partagée pour le cas ambigu)
    if (!conceptKey.has(s.conceptKey)) {
      const id = U('c0ace700', ++cSeq);
      conceptKey.set(s.conceptKey, id);
      concepts.push({ id, workspace_id: workspaceId, angle_id: angleKey.get(ak), title: `Concept ${cSeq}`, source_ref_json: J({ generationId: U('9e2e0000', 900 + cSeq) }), status: 'validated' });
    }
    // créative (attributs de dimension)
    const creaId = U('c8ea11e0', ++creaSeq);
    creatives.push({
      id: creaId, brand_id: brandId, fingerprint_hash: `fx-crea-${creaId}`, type: 'video',
      hook_type: s.hook, opening_type: s.opening, talent: s.talent, duration_s: s.dur,
    });

    // génération (superset · pilote toutes les sections)
    const genId = U('9e2e0000', idx + 1);
    /** @type {Record<string, unknown>} */
    const input = {
      layout: s.layout, universe: s.universe, template: s.template, model: s.model,
      headline: `Accroche synthétique ${idx + 1}`,
    };
    if (s.essai) input.essai = s.essai;
    if (s.memory) input.memoryUse = s.memory;
    if (s.note) input.jarvisScore = { score: s.score, defauts: s.defauts, vu: true };
    if (s.relue) {
      input.copieConforme = { grave: s.grave, lignes: [{ etat: s.grave ? 'reecrit' : 'conforme' }] };
      input.produitFidele = s.produitFidele;
      input.texteLisible = s.texteLisible;
    }
    // Lien calibration : la génération notée pointe SON ad.
    const adId = U('ada00000', idx + 1);
    if (s.note && s.verdict) input.adsmapAdId = adId;
    generations.push({ id: genId, brand_id: brandId, kind: 'ad', input_json: J(input), status: 'done', created_at: daysAgo(s.daysAgoV) });

    // ad · relie SA génération sauf le clone ambigu (qui laisse le lien au concept)
    ads.push({
      id: adId, workspace_id: workspaceId, concept_id: conceptKey.get(s.conceptKey), creative_id: creaId,
      variant_code: `v${idx + 1}`, format: 'video_ugc', ad_type: 'ideation',
      source_ref_json: s.ambiguClone ? null : J({ generationId: genId }),
      status: 'live', created_at: daysAgo(s.daysAgoV),
    });

    if (s.verdict) {
      verdicts.push({
        ad_id: adId, workspace_id: workspaceId, computed: s.verdict, validated: s.status === 'validated' ? s.verdict : null,
        status: s.status === 'validated' ? 'validated' : 'computed', comparable: !!s.comparable,
        metrics_agg_json: J({ hookRate: 0.3 + (idx % 5) * 0.03, holdRate: 0.2, ctr: 0.012, cpa: 14 }),
      });
    }

    // rattache 1 à 2 éléments réutilisés · dimension « éléments »
    adElements.push({ ad_id: adId, element_id: elementDefs[idx % 3].id, position: 1 });
    if (idx % 2 === 0) adElements.push({ ad_id: adId, element_id: elementDefs[(idx + 1) % 3].id, position: 2 });
  });

  // Un lot Adsmap visible (essais/lots) · rattaché à la marque.
  const batch = { id: U('ba7c0000', 1), workspace_id: workspaceId, brand_id: brandId, number: 9001, author_id: authorId, goal: 'Lot de démonstration · fixtures locales', status: 'analyzed', launched_at: daysAgo(30) };

  await sql.begin(async (tx) => {
    const ins = async (table, rows, cols) => {
      for (const r of rows) {
        for (const c of cols) if (r[c] === undefined) throw new Error(`undefined · ${table}.${c} (row id=${r.id ?? r.ad_id})`);
        await tx`insert into ${tx(table)} ${tx(r, ...cols)} on conflict do nothing`;
      }
    };
    await ins('personas', personas, ['id', 'brand_id', 'name', 'status']);
    await ins('adsmap_desires', desires, ['id', 'workspace_id', 'persona_id', 'awareness_stage', 'label', 'type', 'status']);
    await ins('adsmap_angles', angles, ['id', 'workspace_id', 'desire_id', 'label', 'mechanism', 'status']);
    await ins('adsmap_concepts', concepts, ['id', 'workspace_id', 'angle_id', 'title', 'source_ref_json', 'status']);
    await ins('adsmap_batches', [batch], ['id', 'workspace_id', 'brand_id', 'number', 'author_id', 'goal', 'status', 'launched_at']);
    await ins('creatives', creatives, ['id', 'brand_id', 'fingerprint_hash', 'type', 'hook_type', 'opening_type', 'talent', 'duration_s']);
    await ins('generations', generations, ['id', 'brand_id', 'kind', 'input_json', 'status', 'created_at']);
    await ins('adsmap_ads', ads, ['id', 'workspace_id', 'concept_id', 'creative_id', 'variant_code', 'format', 'ad_type', 'source_ref_json', 'status', 'created_at']);
    await ins('adsmap_verdicts', verdicts, ['ad_id', 'workspace_id', 'computed', 'validated', 'status', 'comparable', 'metrics_agg_json']);
    await ins('adsmap_creative_elements', elements, ['id', 'workspace_id', 'brand_id', 'type', 'content', 'fingerprint', 'origin', 'stats_json']);
    await ins('adsmap_ad_elements', adElements, ['ad_id', 'element_id', 'position']);
  });

  return { personas: personas.length, desires: desires.length, angles: angles.length, concepts: concepts.length, creatives: creatives.length, ads: ads.length, verdicts: verdicts.length, generations: generations.length, elements: elements.length };
}

/* -------------------------------------------------------------------------- */

async function main() {
  const url = process.env.DATABASE_URL;
  const garde = destinationLocaleAutorisee(url, process.env.SEED_FIXTURES_CONFIRM);
  if (!garde.ok) {
    console.error(`✗ Recette refusée · ${garde.raison}`);
    process.exit(1);
  }
  const brandId = process.env.SEED_BRAND_ID;
  const workspaceId = process.env.SEED_WORKSPACE_ID;
  const authorId = process.env.SEED_AUTHOR_ID ?? null;
  if (!brandId || !workspaceId) {
    console.error('✗ SEED_BRAND_ID et SEED_WORKSPACE_ID requis · la marque de démonstration locale à remplir.');
    process.exit(1);
  }
  const { default: postgres } = await import('postgres');
  const sql = postgres(url, { prepare: false });
  try {
    const n = await seed(sql, { workspaceId, brandId, authorId });
    console.log('✓ Fixtures posées (INSERT idempotents, données existantes préservées) :');
    console.log(`  ${n.ads} ads · ${n.verdicts} verdicts · ${n.generations} générations · ${n.concepts} concepts · ${n.elements} éléments`);
  } finally {
    await sql.end();
  }
}

// N'exécute rien à l'import (le test ne charge que le garde).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
