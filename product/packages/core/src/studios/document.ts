/**
 * Studios · contenu d'une version, document à calques et timeline (cahier 01 §7, §11).
 *
 * Pur. Types et validateurs, rien d'autre. Le contenu est une DONNÉE : aucun
 * champ n'est du code, aucune chaîne n'est interprétée.
 *
 * ── Décisions de forme ───────────────────────────────────────────────────────
 *
 *  · Collections indexées par IDENTIFIANT stable (`byId`, `layers`, `tracks`,
 *    `items`), jamais par position : un patch vise `/shots/byId/s_ouverture`,
 *    pas `/shots/3`. L'ordre des plans vit à part (`shots.order`) ; changer
 *    l'ordre ne touche aucun plan.
 *  · Géométrie en pixels du document source, origine en haut à gauche, angle en
 *    degrés, ordre d'empilement EXPLICITE (`z`, entier unique). Le zoom et le
 *    cadrage de l'écran n'appartiennent pas au document.
 *  · Masque canonique `grayscale8` : 255 = modifier, 0 = préserver, mêmes
 *    dimensions que la source.
 *  · Timeline en unités ENTIÈRES (`timebase` ticks par seconde), fps rationnel
 *    `num/den`. Aucun flottant pour le temps.
 */

export interface ViolationStudio { chemin: string; raison: string }

/* ─────────────────────────────── Types ───────────────────────────────────── */

export type ModeParole = 'none' | 'voiceover' | 'lipsync';

/** Plan (cf. `$defs.Shot` de 03-CONTRATS) + liens vers ses médias produits. */
export interface PlanStudio {
  shotId: string;
  purpose: string;
  subject: string;
  action: string;
  framing: string;
  camera: string;
  lighting: string;
  environment: string;
  referenceIds: string[];
  narration: string;
  onScreenText: string[];
  speechMode: ModeParole;
  estimatedDurationMs: number;
  actualDurationMs?: number | null;
  keyframeAssetId?: string | null;
  clipAssetId?: string | null;
  voiceAssetId?: string | null;
}

export interface CalqueBase {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
  opacity: number;
  z: number;
}

export interface MasqueStudio {
  format: 'grayscale8';
  width: number;
  height: number;
  assetId: string;
  featherPx: number;
}

export interface CalqueImage extends CalqueBase {
  kind: 'image';
  assetId: string;
  sourceWidth: number;
  sourceHeight: number;
  mask: MasqueStudio | null;
}
export interface CalqueTexte extends CalqueBase {
  kind: 'text';
  text: string;
  fontId: string;
  fontSizePx: number;
  color: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
}
export interface CalqueForme extends CalqueBase {
  kind: 'shape';
  shape: 'rect' | 'ellipse';
  fill: string;
}
export interface CalqueLogo extends CalqueBase {
  kind: 'logo';
  assetId: string;
}
export type CalqueStudio = CalqueImage | CalqueTexte | CalqueForme | CalqueLogo;

export interface DocumentStudio {
  width: number;
  height: number;
  colorSpace: 'sRGB';
  layers: Record<string, CalqueStudio>;
  fonts: Record<string, { family: string; assetId: string | null }>;
}

export interface FpsRationnel { num: number; den: number }

export interface ElementTimeline {
  id: string;
  source: { assetId?: string; shotId?: string; text?: string };
  startTicks: number;
  inTicks: number;
  outTicks: number;
  gainDb?: number;
}
export interface PisteTimeline {
  id: string;
  kind: 'video' | 'audio' | 'subtitle' | 'overlay';
  z: number;
  muted: boolean;
  gainDb: number;
  items: Record<string, ElementTimeline>;
}
export interface TimelineStudio {
  timebase: number;
  fps: FpsRationnel;
  durationTicks: number;
  tracks: Record<string, PisteTimeline>;
  voice: { voiceId: string } | null;
  music: { assetId: string; gainDb: number } | null;
  subtitles: { enabled: boolean };
}

/** Le contenu d'une ProjectVersion · les sept clés du cahier, et elles seules. */
export interface ContenuVersion {
  brief: Record<string, unknown> | null;
  productRef: { productId: string; assetId?: string | null; [k: string]: unknown } | null;
  styleRef: Record<string, unknown> | null;
  characterRefs: Record<string, Record<string, unknown>>;
  shots: { order: string[]; byId: Record<string, PlanStudio> };
  document: DocumentStudio | null;
  timeline: TimelineStudio | null;
}

export const SCHEMA_VERSION_CONTENU = 1;
export const CLES_CONTENU = ['brief', 'productRef', 'styleRef', 'characterRefs', 'shots', 'document', 'timeline'] as const;
/** Taille maximale d'un contenu sérialisé (octets UTF-16 ≈ caractères). */
export const TAILLE_MAX_CONTENU = 2_000_000;
const TEXTE_MAX = 12_000;
const DIMENSION_MAX = 16_384;

export function contenuVide(): ContenuVersion {
  return { brief: null, productRef: null, styleRef: null, characterRefs: {}, shots: { order: [], byId: {} }, document: null, timeline: null };
}

/* ───────────────────────────── Outils ────────────────────────────────────── */

/** Un identifiant stable · jamais purement numérique (il passerait pour un indice). */
export const ID_STABLE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
export const SEGMENTS_INTERDITS = new Set(['__proto__', 'constructor', 'prototype']);

export function estIdStable(x: unknown): x is string {
  return typeof x === 'string' && ID_STABLE.test(x) && !/^\d+$/.test(x) && !SEGMENTS_INTERDITS.has(x);
}

const estObjet = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

const entier = (x: unknown, min: number, max = Number.MAX_SAFE_INTEGER): boolean =>
  typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;

const fini = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

const COULEUR = /^#[0-9a-fA-F]{6}$/;

class Collecteur {
  readonly v: ViolationStudio[] = [];
  ajoute(chemin: string, raison: string) { this.v.push({ chemin, raison }); }
  verifie(ok: boolean, chemin: string, raison: string) { if (!ok) this.ajoute(chemin, raison); }
  cles(o: Record<string, unknown>, chemin: string, permises: readonly string[], requises: readonly string[]) {
    for (const k of Object.keys(o)) if (!permises.includes(k)) this.ajoute(`${chemin}/${k}`, 'champ inconnu');
    for (const k of requises) if (!(k in o)) this.ajoute(`${chemin}/${k}`, 'champ requis');
  }
  texte(x: unknown, chemin: string, max = TEXTE_MAX) {
    this.verifie(typeof x === 'string' && x.length <= max, chemin, `texte attendu (${max} caractères au plus)`);
  }
  listeTextes(x: unknown, chemin: string, maxItems = 100) {
    if (!Array.isArray(x) || x.length > maxItems) { this.ajoute(chemin, `liste de textes attendue (${maxItems} au plus)`); return; }
    x.forEach((t, i) => this.texte(t, `${chemin}/${i}`));
  }
  /** Collection indexée par ID · la clé est un ID stable et égale au champ `champId`. */
  collection(x: unknown, chemin: string, champId: string | null, chaque: (val: Record<string, unknown>, ch: string) => void) {
    if (!estObjet(x)) { this.ajoute(chemin, 'collection indexée par identifiant attendue'); return; }
    for (const [k, val] of Object.entries(x)) {
      const ch = `${chemin}/${k}`;
      if (!estIdStable(k)) { this.ajoute(ch, 'identifiant instable ou interdit'); continue; }
      if (!estObjet(val)) { this.ajoute(ch, 'objet attendu'); continue; }
      if (champId !== null && val[champId] !== k) this.ajoute(`${ch}/${champId}`, 'doit égaler la clé de la collection');
      chaque(val, ch);
    }
  }
}

/** Refuse en profondeur les clés qui pollueraient un prototype. */
export function clesInterditesEnProfondeur(x: unknown, chemin = ''): ViolationStudio[] {
  const out: ViolationStudio[] = [];
  const pile: Array<[unknown, string]> = [[x, chemin]];
  while (pile.length) {
    const [v, ch] = pile.pop()!;
    if (Array.isArray(v)) v.forEach((e, i) => pile.push([e, `${ch}/${i}`]));
    else if (estObjet(v)) {
      for (const k of Object.keys(v)) {
        if (SEGMENTS_INTERDITS.has(k)) out.push({ chemin: `${ch}/${k}`, raison: 'clé interdite' });
        else pile.push([v[k], `${ch}/${k}`]);
      }
    }
  }
  return out;
}

/* ───────────────────────────── Document ──────────────────────────────────── */

const CLES_CALQUE_BASE = ['id', 'kind', 'name', 'visible', 'locked', 'x', 'y', 'width', 'height', 'rotationDeg', 'opacity', 'z'] as const;
const CLES_PAR_TYPE: Readonly<Record<CalqueStudio['kind'], readonly string[]>> = {
  image: ['assetId', 'sourceWidth', 'sourceHeight', 'mask'],
  text: ['text', 'fontId', 'fontSizePx', 'color', 'align', 'lineHeight'],
  shape: ['shape', 'fill'],
  logo: ['assetId'],
};

function validerCalque(c: Collecteur, l: Record<string, unknown>, ch: string, fonts: Record<string, unknown>) {
  const kind = l.kind as CalqueStudio['kind'];
  if (!(typeof kind === 'string' && kind in CLES_PAR_TYPE)) { c.ajoute(`${ch}/kind`, 'type de calque inconnu (image, text, shape, logo)'); return; }
  const specifiques = CLES_PAR_TYPE[kind];
  c.cles(l, ch, [...CLES_CALQUE_BASE, ...specifiques], [...CLES_CALQUE_BASE, ...specifiques]);
  c.texte(l.name, `${ch}/name`, 200);
  c.verifie(typeof l.visible === 'boolean', `${ch}/visible`, 'booléen attendu');
  c.verifie(typeof l.locked === 'boolean', `${ch}/locked`, 'booléen attendu');
  for (const k of ['x', 'y', 'rotationDeg'] as const) c.verifie(fini(l[k]), `${ch}/${k}`, 'nombre fini attendu');
  for (const k of ['width', 'height'] as const) c.verifie(fini(l[k]) && (l[k] as number) > 0, `${ch}/${k}`, 'dimension positive attendue');
  c.verifie(fini(l.opacity) && (l.opacity as number) >= 0 && (l.opacity as number) <= 1, `${ch}/opacity`, 'opacité entre 0 et 1');
  c.verifie(entier(l.z, -1_000_000, 1_000_000), `${ch}/z`, 'ordre d’empilement entier attendu');
  if (kind === 'image' || kind === 'logo') c.verifie(estIdStable(l.assetId), `${ch}/assetId`, 'identifiant de média attendu');
  if (kind === 'image') {
    c.verifie(entier(l.sourceWidth, 1, DIMENSION_MAX), `${ch}/sourceWidth`, 'largeur source entière attendue');
    c.verifie(entier(l.sourceHeight, 1, DIMENSION_MAX), `${ch}/sourceHeight`, 'hauteur source entière attendue');
    if (l.mask !== null) {
      const m = l.mask;
      if (!estObjet(m)) c.ajoute(`${ch}/mask`, 'masque attendu ou null');
      else {
        c.cles(m, `${ch}/mask`, ['format', 'width', 'height', 'assetId', 'featherPx'], ['format', 'width', 'height', 'assetId', 'featherPx']);
        c.verifie(m.format === 'grayscale8', `${ch}/mask/format`, 'masque grayscale8 attendu');
        c.verifie(m.width === l.sourceWidth && m.height === l.sourceHeight, `${ch}/mask`, 'le masque doit avoir les dimensions de la source');
        c.verifie(estIdStable(m.assetId), `${ch}/mask/assetId`, 'identifiant de média attendu');
        c.verifie(entier(m.featherPx, 0, 512), `${ch}/mask/featherPx`, 'fondu entier entre 0 et 512 pixels');
      }
    }
  }
  if (kind === 'text') {
    c.texte(l.text, `${ch}/text`, 5000);
    c.verifie(typeof l.fontId === 'string' && l.fontId in fonts, `${ch}/fontId`, 'police déclarée dans le document attendue');
    c.verifie(fini(l.fontSizePx) && (l.fontSizePx as number) > 0 && (l.fontSizePx as number) <= 2000, `${ch}/fontSizePx`, 'taille de police positive attendue');
    c.verifie(typeof l.color === 'string' && COULEUR.test(l.color), `${ch}/color`, 'couleur #RRGGBB attendue');
    c.verifie(l.align === 'left' || l.align === 'center' || l.align === 'right', `${ch}/align`, 'alignement left, center ou right');
    c.verifie(fini(l.lineHeight) && (l.lineHeight as number) > 0, `${ch}/lineHeight`, 'interligne positif attendu');
  }
  if (kind === 'shape') {
    c.verifie(l.shape === 'rect' || l.shape === 'ellipse', `${ch}/shape`, 'forme rect ou ellipse');
    c.verifie(typeof l.fill === 'string' && COULEUR.test(l.fill), `${ch}/fill`, 'couleur #RRGGBB attendue');
  }
}

export function validerDocument(x: unknown, chemin = '/document'): ViolationStudio[] {
  const c = new Collecteur();
  if (!estObjet(x)) { c.ajoute(chemin, 'document attendu'); return c.v; }
  c.cles(x, chemin, ['width', 'height', 'colorSpace', 'layers', 'fonts'], ['width', 'height', 'colorSpace', 'layers', 'fonts']);
  c.verifie(entier(x.width, 1, DIMENSION_MAX), `${chemin}/width`, `largeur entière entre 1 et ${DIMENSION_MAX}`);
  c.verifie(entier(x.height, 1, DIMENSION_MAX), `${chemin}/height`, `hauteur entière entre 1 et ${DIMENSION_MAX}`);
  c.verifie(x.colorSpace === 'sRGB', `${chemin}/colorSpace`, 'espace colorimétrique sRGB attendu');
  const fonts = estObjet(x.fonts) ? x.fonts : {};
  c.collection(x.fonts, `${chemin}/fonts`, null, (f, ch) => {
    c.cles(f, ch, ['family', 'assetId'], ['family', 'assetId']);
    c.texte(f.family, `${ch}/family`, 200);
    c.verifie(f.assetId === null || estIdStable(f.assetId), `${ch}/assetId`, 'identifiant de média ou null');
  });
  const z = new Map<number, string>();
  c.collection(x.layers, `${chemin}/layers`, 'id', (l, ch) => {
    validerCalque(c, l, ch, fonts);
    if (typeof l.z === 'number') {
      if (z.has(l.z)) c.ajoute(`${ch}/z`, `ordre d’empilement déjà pris par ${z.get(l.z)}`);
      else z.set(l.z, String(l.id));
    }
  });
  return c.v;
}

/* ───────────────────────────── Timeline ──────────────────────────────────── */

export function validerTimeline(x: unknown, chemin = '/timeline'): ViolationStudio[] {
  const c = new Collecteur();
  if (!estObjet(x)) { c.ajoute(chemin, 'timeline attendue'); return c.v; }
  const cles = ['timebase', 'fps', 'durationTicks', 'tracks', 'voice', 'music', 'subtitles'];
  c.cles(x, chemin, cles, cles);
  c.verifie(entier(x.timebase, 1, 1_000_000_000), `${chemin}/timebase`, 'base de temps entière (ticks par seconde) attendue');
  if (!estObjet(x.fps)) c.ajoute(`${chemin}/fps`, 'fps rationnel {num, den} attendu');
  else {
    c.cles(x.fps, `${chemin}/fps`, ['num', 'den'], ['num', 'den']);
    c.verifie(entier(x.fps.num, 1, 1_000_000) && entier(x.fps.den, 1, 1_000_000), `${chemin}/fps`, 'num et den entiers positifs');
  }
  c.verifie(entier(x.durationTicks, 0), `${chemin}/durationTicks`, 'durée entière en ticks attendue');
  const duree = typeof x.durationTicks === 'number' ? x.durationTicks : 0;
  c.collection(x.tracks, `${chemin}/tracks`, 'id', (p, ch) => {
    c.cles(p, ch, ['id', 'kind', 'z', 'muted', 'gainDb', 'items'], ['id', 'kind', 'z', 'muted', 'gainDb', 'items']);
    c.verifie(['video', 'audio', 'subtitle', 'overlay'].includes(p.kind as string), `${ch}/kind`, 'piste video, audio, subtitle ou overlay');
    c.verifie(entier(p.z, -1000, 1000), `${ch}/z`, 'ordre de piste entier');
    c.verifie(typeof p.muted === 'boolean', `${ch}/muted`, 'booléen attendu');
    c.verifie(fini(p.gainDb) && (p.gainDb as number) <= 24, `${ch}/gainDb`, 'gain en dB fini, 24 au plus');
    c.collection(p.items, `${ch}/items`, 'id', (e, che) => {
      c.cles(e, che, ['id', 'source', 'startTicks', 'inTicks', 'outTicks', 'gainDb'], ['id', 'source', 'startTicks', 'inTicks', 'outTicks']);
      if (!estObjet(e.source)) c.ajoute(`${che}/source`, 'source attendue');
      else {
        c.cles(e.source, `${che}/source`, ['assetId', 'shotId', 'text'], []);
        const n = ['assetId', 'shotId', 'text'].filter((k) => k in (e.source as object)).length;
        c.verifie(n >= 1, `${che}/source`, 'source assetId, shotId ou text attendue');
        if ('assetId' in e.source) c.verifie(estIdStable(e.source.assetId), `${che}/source/assetId`, 'identifiant de média attendu');
        if ('shotId' in e.source) c.verifie(estIdStable(e.source.shotId), `${che}/source/shotId`, 'identifiant de plan attendu');
        if ('text' in e.source) c.texte(e.source.text, `${che}/source/text`, 2000);
      }
      const ok = entier(e.startTicks, 0) && entier(e.inTicks, 0) && entier(e.outTicks, 1);
      c.verifie(ok, che, 'startTicks, inTicks, outTicks entiers attendus');
      if (ok) {
        c.verifie((e.outTicks as number) > (e.inTicks as number), che, 'outTicks doit dépasser inTicks');
        c.verifie((e.startTicks as number) + (e.outTicks as number) - (e.inTicks as number) <= duree, che, 'l’élément dépasse la durée de la timeline');
      }
      if ('gainDb' in e) c.verifie(fini(e.gainDb) && (e.gainDb as number) <= 24, `${che}/gainDb`, 'gain en dB fini, 24 au plus');
    });
  });
  if (x.voice !== null) {
    if (!estObjet(x.voice)) c.ajoute(`${chemin}/voice`, 'voix attendue ou null');
    else { c.cles(x.voice, `${chemin}/voice`, ['voiceId'], ['voiceId']); c.verifie(estIdStable(x.voice.voiceId), `${chemin}/voice/voiceId`, 'identifiant de voix attendu'); }
  }
  if (x.music !== null) {
    if (!estObjet(x.music)) c.ajoute(`${chemin}/music`, 'musique attendue ou null');
    else {
      c.cles(x.music, `${chemin}/music`, ['assetId', 'gainDb'], ['assetId', 'gainDb']);
      c.verifie(estIdStable(x.music.assetId), `${chemin}/music/assetId`, 'identifiant de média attendu');
      c.verifie(fini(x.music.gainDb) && (x.music.gainDb as number) <= 24, `${chemin}/music/gainDb`, 'gain en dB fini, 24 au plus');
    }
  }
  if (!estObjet(x.subtitles)) c.ajoute(`${chemin}/subtitles`, 'réglage des sous-titres attendu');
  else { c.cles(x.subtitles, `${chemin}/subtitles`, ['enabled'], ['enabled']); c.verifie(typeof x.subtitles.enabled === 'boolean', `${chemin}/subtitles/enabled`, 'booléen attendu'); }
  return c.v;
}

/** Ticks → numéro de frame, exact (division entière, arrondi vers le bas). */
export function ticksVersFrame(ticks: number, timebase: number, fps: FpsRationnel): number {
  // frame = ticks * num / (timebase * den), en entiers 64 bits via BigInt.
  return Number((BigInt(ticks) * BigInt(fps.num)) / (BigInt(timebase) * BigInt(fps.den)));
}

/* ───────────────────────────── Contenu ───────────────────────────────────── */

const CLES_PLAN_REQUISES = ['shotId', 'purpose', 'subject', 'action', 'framing', 'camera', 'lighting', 'environment', 'referenceIds', 'narration', 'onScreenText', 'speechMode', 'estimatedDurationMs'] as const;
const CLES_PLAN = [...CLES_PLAN_REQUISES, 'actualDurationMs', 'keyframeAssetId', 'clipAssetId', 'voiceAssetId'] as const;

function validerPlan(c: Collecteur, p: Record<string, unknown>, ch: string) {
  c.cles(p, ch, CLES_PLAN, CLES_PLAN_REQUISES);
  for (const k of ['purpose', 'subject', 'action', 'framing', 'camera', 'lighting', 'environment', 'narration'] as const) c.texte(p[k], `${ch}/${k}`);
  if (!Array.isArray(p.referenceIds) || p.referenceIds.length > 100 || !p.referenceIds.every(estIdStable)) c.ajoute(`${ch}/referenceIds`, 'liste d’identifiants stables attendue');
  c.listeTextes(p.onScreenText, `${ch}/onScreenText`);
  c.verifie(p.speechMode === 'none' || p.speechMode === 'voiceover' || p.speechMode === 'lipsync', `${ch}/speechMode`, 'mode de parole none, voiceover ou lipsync');
  c.verifie(entier(p.estimatedDurationMs, 0, 3_600_000), `${ch}/estimatedDurationMs`, 'durée estimée entière en ms');
  if ('actualDurationMs' in p) c.verifie(p.actualDurationMs === null || entier(p.actualDurationMs, 0, 3_600_000), `${ch}/actualDurationMs`, 'durée réelle entière en ms ou null');
  for (const k of ['keyframeAssetId', 'clipAssetId', 'voiceAssetId'] as const) {
    if (k in p) c.verifie(p[k] === null || estIdStable(p[k]), `${ch}/${k}`, 'identifiant de média ou null');
  }
}

/**
 * Valide un contenu de version complet. Une liste vide = valide. Les messages
 * nomment le chemin et la règle, jamais une valeur.
 */
export function validerContenuVersion(x: unknown): ViolationStudio[] {
  const c = new Collecteur();
  if (!estObjet(x)) return [{ chemin: '', raison: 'contenu de version attendu' }];
  c.v.push(...clesInterditesEnProfondeur(x));
  c.cles(x, '', CLES_CONTENU, CLES_CONTENU);
  for (const k of ['brief', 'styleRef'] as const) c.verifie(x[k] === null || estObjet(x[k]), `/${k}`, 'objet ou null attendu');
  if (x.productRef !== null) {
    if (!estObjet(x.productRef)) c.ajoute('/productRef', 'référence produit ou null attendue');
    else {
      c.verifie(estIdStable(x.productRef.productId), '/productRef/productId', 'identifiant de produit attendu');
      if ('assetId' in x.productRef) c.verifie(x.productRef.assetId === null || estIdStable(x.productRef.assetId), '/productRef/assetId', 'identifiant de média ou null');
    }
  }
  c.collection(x.characterRefs, '/characterRefs', null, () => undefined);
  if (!estObjet(x.shots)) c.ajoute('/shots', 'plans {order, byId} attendus');
  else {
    c.cles(x.shots, '/shots', ['order', 'byId'], ['order', 'byId']);
    c.collection(x.shots.byId, '/shots/byId', 'shotId', (p, ch) => validerPlan(c, p, ch));
    const ids = estObjet(x.shots.byId) ? Object.keys(x.shots.byId) : [];
    const ordre = x.shots.order;
    if (!Array.isArray(ordre) || !ordre.every((s) => typeof s === 'string')) c.ajoute('/shots/order', 'liste d’identifiants de plans attendue');
    else {
      c.verifie(new Set(ordre).size === ordre.length, '/shots/order', 'un plan apparaît deux fois dans l’ordre');
      c.verifie(ordre.length === ids.length && ordre.every((s) => ids.includes(s)), '/shots/order', 'l’ordre doit lister chaque plan une fois, et eux seuls');
    }
  }
  if (x.document !== null) c.v.push(...validerDocument(x.document));
  if (x.timeline !== null) c.v.push(...validerTimeline(x.timeline));
  if (c.v.length === 0) {
    try {
      if (JSON.stringify(x).length > TAILLE_MAX_CONTENU) c.ajoute('', `contenu trop volumineux (${TAILLE_MAX_CONTENU} caractères au plus)`);
    } catch {
      c.ajoute('', 'contenu non sérialisable');
    }
  }
  return c.v;
}
