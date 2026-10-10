/**
 * Studios · le BRIEF canonique d'un projet (cahier 01 §2.1, §4.2, §4.3,
 * contrat `brief_build_output` de 03-CONTRATS).
 *
 * Pur · ni base, ni réseau, ni modèle.
 *
 * Le contenu `brief` d'une version de projet EST le `result` du contrat
 * `brief_build_output` : treize champs, ni plus ni moins. Ce module en donne :
 *
 *  · les TYPES (les autres lots les importent, aucun type concurrent) ;
 *  · la validation de FORME (le contrat, sans Ajv · utilisable côté client) ;
 *  · la validation RELATIONNELLE : chaque fait cite une source ou un produit
 *    du projet ; l'hypothèse citée existe et la variable testée lui correspond ;
 *    une observation n'affirme pas de narration sans transcription (FLOW-02) ;
 *    aucun champ importable ne reprend l'annonceur source (§4.2 point 5) ;
 *  · la COMPLÉTUDE : ce qui manque, sans bloquer la consultation (§4.1) ;
 *  · la COMPOSITION déterministe depuis sources, hypothèse et produit
 *    (aucun appel modèle : le brief se construit même sans IA) ;
 *  · l'EXPORT lisible (Markdown) et machine (JSON), pour produire ailleurs
 *    sans rien acheter (FLOW-10).
 *
 * ── L'hypothèse vit DANS le brief ────────────────────────────────────────────
 *
 * Le contrat ne porte que `hypothesisId` et `testedVariable`. Le reste du
 * protocole (énoncé, témoin, traitement, mesure, règle de décision, limites)
 * est rangé en FAITS de nature `hypothesis` dont l'identifiant dérive de celui
 * de l'hypothèse (`hyp_1`, `hyp_1.temoin`, …). Le brief reste ainsi conforme au
 * contrat ET autosuffisant : l'exporter suffit à reprendre le test ailleurs.
 */

import type { SourceReferenceStudio } from './sources/reference';
import { LIBELLES_STATUT_SOURCE, LIBELLES_TYPE_SOURCE } from './sources/reference';
import { LIBELLES_ELEMENT, LIBELLES_MODALITE, controlerNarrationObservee } from './sources/modalites';
import { structureImportable, fuitesConcurrent, type ChampImportable } from './sources/import';
import { idSourceProduit, type ReferenceProduitStudio } from './sources/produit';
import type { HypotheseTest } from './sources/hypotheses';

/* ─────────────────────────────── Types ───────────────────────────────────── */

export type NatureFait = 'observed' | 'measured' | 'declared' | 'hypothesis';
export type ConfianceFait = 'low' | 'medium' | 'high';

export interface FaitBrief {
  id: string;
  claim: string;
  sourceIds: string[];
  kind: NatureFait;
  confidence: ConfianceFait;
}

export type RoleReference = 'product' | 'identity' | 'style' | 'composition' | 'logo' | 'integrate';
export type PorteeReference = 'product' | 'subject' | 'background' | 'global';

export interface ReferenceBrief {
  assetId: string;
  assetVersion: string;
  sha256: string;
  role: RoleReference;
  scope: PorteeReference;
  allowedChanges: string[];
  requiredComponents: string[];
}

/** Le `result` de `brief_build_output`. */
export interface BriefCanonique {
  objective: string;
  audience: string;
  hypothesisId: string | null;
  testedVariable: string;
  facts: FaitBrief[];
  invariants: string[];
  variables: string[];
  references: ReferenceBrief[];
  composition: string;
  styleIntent: string;
  texts: string[];
  formats: string[];
  exclusions: string[];
}

export const CLES_BRIEF = ['objective', 'audience', 'hypothesisId', 'testedVariable', 'facts', 'invariants', 'variables', 'references', 'composition', 'styleIntent', 'texts', 'formats', 'exclusions'] as const;

export interface ViolationBrief { chemin: string; raison: string }

/* ─────────────────────────────── Forme ───────────────────────────────────── */

const TEXTE_MAX = 12_000;
const LISTE_MAX = 100;
const ID_MAX = 160;
const NATURES: readonly NatureFait[] = ['observed', 'measured', 'declared', 'hypothesis'];
const CONFIANCES: readonly ConfianceFait[] = ['low', 'medium', 'high'];
const ROLES: readonly RoleReference[] = ['product', 'identity', 'style', 'composition', 'logo', 'integrate'];
const PORTEES: readonly PorteeReference[] = ['product', 'subject', 'background', 'global'];

const estObjet = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const estId = (x: unknown): x is string => typeof x === 'string' && x.length >= 1 && x.length <= ID_MAX;

function cles(v: ViolationBrief[], o: Record<string, unknown>, chemin: string, attendues: readonly string[]) {
  for (const k of Object.keys(o)) if (!attendues.includes(k)) v.push({ chemin: `${chemin}/${k}`, raison: 'champ inconnu' });
  for (const k of attendues) if (!(k in o)) v.push({ chemin: `${chemin}/${k}`, raison: 'champ requis' });
}
function texte(v: ViolationBrief[], x: unknown, chemin: string) {
  if (typeof x !== 'string' || x.length > TEXTE_MAX) v.push({ chemin, raison: `texte attendu (${TEXTE_MAX} caractères au plus)` });
}
function textes(v: ViolationBrief[], x: unknown, chemin: string) {
  if (!Array.isArray(x) || x.length > LISTE_MAX) { v.push({ chemin, raison: `liste de textes attendue (${LISTE_MAX} au plus)` }); return; }
  x.forEach((t, i) => texte(v, t, `${chemin}/${i}`));
}

/** Forme du contrat `brief_build_output.result` · une liste vide = conforme. */
export function validerFormeBrief(x: unknown, chemin = '/brief'): ViolationBrief[] {
  const v: ViolationBrief[] = [];
  if (!estObjet(x)) return [{ chemin, raison: 'brief attendu' }];
  cles(v, x, chemin, CLES_BRIEF);
  for (const k of ['objective', 'audience', 'testedVariable', 'composition', 'styleIntent'] as const) texte(v, x[k], `${chemin}/${k}`);
  if (x.hypothesisId !== null && typeof x.hypothesisId !== 'string') v.push({ chemin: `${chemin}/hypothesisId`, raison: 'identifiant ou null attendu' });
  for (const k of ['invariants', 'variables', 'texts', 'formats', 'exclusions'] as const) textes(v, x[k], `${chemin}/${k}`);
  if (!Array.isArray(x.facts) || x.facts.length > LISTE_MAX) v.push({ chemin: `${chemin}/facts`, raison: `liste de faits attendue (${LISTE_MAX} au plus)` });
  else x.facts.forEach((f, i) => {
    const c = `${chemin}/facts/${i}`;
    if (!estObjet(f)) { v.push({ chemin: c, raison: 'fait attendu' }); return; }
    cles(v, f, c, ['id', 'claim', 'sourceIds', 'kind', 'confidence']);
    if (!estId(f.id)) v.push({ chemin: `${c}/id`, raison: 'identifiant attendu' });
    texte(v, f.claim, `${c}/claim`);
    if (!Array.isArray(f.sourceIds) || f.sourceIds.length > LISTE_MAX || !f.sourceIds.every(estId)) v.push({ chemin: `${c}/sourceIds`, raison: 'liste d’identifiants attendue' });
    if (!NATURES.includes(f.kind as NatureFait)) v.push({ chemin: `${c}/kind`, raison: 'nature observed, measured, declared ou hypothesis' });
    if (!CONFIANCES.includes(f.confidence as ConfianceFait)) v.push({ chemin: `${c}/confidence`, raison: 'confiance low, medium ou high' });
  });
  if (!Array.isArray(x.references) || x.references.length > LISTE_MAX) v.push({ chemin: `${chemin}/references`, raison: `liste de références attendue (${LISTE_MAX} au plus)` });
  else x.references.forEach((r, i) => {
    const c = `${chemin}/references/${i}`;
    if (!estObjet(r)) { v.push({ chemin: c, raison: 'référence attendue' }); return; }
    cles(v, r, c, ['assetId', 'assetVersion', 'sha256', 'role', 'scope', 'allowedChanges', 'requiredComponents']);
    if (!estId(r.assetId)) v.push({ chemin: `${c}/assetId`, raison: 'identifiant de média attendu' });
    if (!estId(r.assetVersion)) v.push({ chemin: `${c}/assetVersion`, raison: 'version de média attendue' });
    if (typeof r.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(r.sha256)) v.push({ chemin: `${c}/sha256`, raison: 'empreinte SHA-256 attendue' });
    if (!ROLES.includes(r.role as RoleReference)) v.push({ chemin: `${c}/role`, raison: 'rôle de référence inconnu' });
    if (!PORTEES.includes(r.scope as PorteeReference)) v.push({ chemin: `${c}/scope`, raison: 'portée de référence inconnue' });
    textes(v, r.allowedChanges, `${c}/allowedChanges`);
    textes(v, r.requiredComponents, `${c}/requiredComponents`);
  });
  return v;
}

export function estBriefCanonique(x: unknown): x is BriefCanonique {
  return validerFormeBrief(x).length === 0;
}

/* ─────────────────────────── Hypothèse ↔ faits ───────────────────────────── */

const SUFFIXES_PROTOCOLE = { temoin: 'Témoin', traitement: 'Traitement', mesure: 'Mesure', decision: 'Règle de décision' } as const;
type SuffixeProtocole = keyof typeof SUFFIXES_PROTOCOLE;
const LIMITE = 'limite';

/** Les faits qui portent l'hypothèse et son protocole. */
export function faitsHypothese(h: HypotheseTest): FaitBrief[] {
  const out: FaitBrief[] = [{ id: h.id, claim: h.statement, sourceIds: [...h.sourceIds], kind: 'hypothesis', confidence: 'low' }];
  const valeurs: Record<SuffixeProtocole, string> = { temoin: h.control, traitement: h.treatment, mesure: h.metric, decision: h.decisionRule };
  for (const s of Object.keys(SUFFIXES_PROTOCOLE) as SuffixeProtocole[]) {
    if (valeurs[s].trim()) out.push({ id: `${h.id}.${s}`, claim: `${SUFFIXES_PROTOCOLE[s]} : ${valeurs[s].trim()}`, sourceIds: [...h.sourceIds], kind: 'hypothesis', confidence: 'low' });
  }
  h.limitations.filter((l) => l.trim()).slice(0, 20).forEach((l, i) => {
    out.push({ id: `${h.id}.${LIMITE}.${i + 1}`, claim: `Limite : ${l.trim()}`, sourceIds: [...h.sourceIds], kind: 'hypothesis', confidence: 'low' });
  });
  return out;
}

/** Reconstruit l'hypothèse depuis le brief · `null` sans hypothèse citée. */
export function hypotheseDuBrief(b: BriefCanonique): HypotheseTest | null {
  if (!b.hypothesisId) return null;
  const id = b.hypothesisId;
  const fait = b.facts.find((f) => f.id === id && f.kind === 'hypothesis');
  if (!fait) return null;
  const valeur = (s: SuffixeProtocole) => {
    const f = b.facts.find((x) => x.id === `${id}.${s}`);
    const prefixe = `${SUFFIXES_PROTOCOLE[s]} : `;
    return f ? (f.claim.startsWith(prefixe) ? f.claim.slice(prefixe.length) : f.claim) : '';
  };
  const limites = b.facts.filter((f) => f.id.startsWith(`${id}.${LIMITE}.`)).map((f) => f.claim.replace(/^Limite : /, ''));
  return {
    id,
    statement: fait.claim,
    sourceIds: [...fait.sourceIds],
    variable: b.testedVariable,
    control: valeur('temoin'),
    treatment: valeur('traitement'),
    invariants: [],
    metric: valeur('mesure'),
    decisionRule: valeur('decision'),
    limitations: limites,
  };
}

/* ───────────────────────────── Composition ───────────────────────────────── */

export interface EntreeCompositionBrief {
  sources: readonly SourceReferenceStudio[];
  hypothese: HypotheseTest | null;
  produit: ReferenceProduitStudio | null;
  audience: string;
  objectif?: string;
}

const borne = (x: string, max = TEXTE_MAX) => x.slice(0, max);

/**
 * Le brief, composé SANS modèle · observations des sources, faits produit,
 * hypothèse et protocole, structure importée, exclusions. Ce qui n'est pas
 * connu reste vide (la complétude le dit), rien n'est inventé.
 */
export function composerBrief(e: EntreeCompositionBrief): BriefCanonique {
  const structure = structureImportable(e.sources);
  const facts: FaitBrief[] = [];
  for (const s of e.sources) {
    for (const o of s.observations) facts.push({ id: o.id, claim: borne(o.claim), sourceIds: [...o.sourceIds], kind: o.kind, confidence: o.confidence });
  }
  if (e.produit) {
    const src = idSourceProduit(e.produit.productId);
    for (const f of e.produit.faits) facts.push({ id: `produit.${f.cle}`, claim: borne(`${f.libelle} : ${f.valeur}`), sourceIds: [src], kind: 'declared', confidence: 'high' });
  }
  if (e.hypothese) facts.push(...faitsHypothese(e.hypothese));
  const h = e.hypothese;
  // Un invariant qui nomme l'annonceur source est en réalité une EXCLUSION ·
  // il y est rangé, jamais laissé dans les champs écrits pour la marque cible.
  const invariants = [...new Set([...(h?.invariants ?? []), ...structure.contraintes])];
  const fuyants = new Set(fuitesConcurrent(invariants.map((t, i) => ({ chemin: String(i), texte: t })), e.sources).map((f) => Number(f.chemin)));
  const objectif = (e.objectif ?? '').trim() || (h?.statement ? `Vérifier : ${h.statement}` : '');
  return {
    objective: borne(objectif),
    audience: borne(e.audience.trim()),
    hypothesisId: h ? h.id : null,
    testedVariable: h ? borne(h.variable) : '',
    facts: facts.slice(0, LISTE_MAX),
    invariants: invariants.filter((_, i) => !fuyants.has(i)).slice(0, LISTE_MAX),
    variables: h && h.variable ? [borne(h.variable)] : [],
    references: [],
    composition: borne(structure.composition),
    styleIntent: '',
    texts: [],
    formats: structure.formats.slice(0, LISTE_MAX),
    exclusions: [...structure.exclusions, ...invariants.filter((_, i) => fuyants.has(i))].slice(0, LISTE_MAX),
  };
}

/* ─────────────────────────── Relations ───────────────────────────────────── */

export interface ContexteRelationsBrief {
  sources: readonly SourceReferenceStudio[];
  /** Le produit de la version (`productRef.productId`), ou `null`. */
  productId: string | null;
}

/** Les champs que l'on écrit POUR la marque cible · ceux qu'une fuite contaminerait. */
export function champsImportables(b: BriefCanonique): ChampImportable[] {
  return [
    { chemin: '/brief/objective', texte: b.objective },
    { chemin: '/brief/audience', texte: b.audience },
    { chemin: '/brief/testedVariable', texte: b.testedVariable },
    { chemin: '/brief/composition', texte: b.composition },
    { chemin: '/brief/styleIntent', texte: b.styleIntent },
    ...b.variables.map((t, i) => ({ chemin: `/brief/variables/${i}`, texte: t })),
    ...b.invariants.map((t, i) => ({ chemin: `/brief/invariants/${i}`, texte: t })),
    ...b.texts.map((t, i) => ({ chemin: `/brief/texts/${i}`, texte: t })),
    ...b.formats.map((t, i) => ({ chemin: `/brief/formats/${i}`, texte: t })),
  ];
}

/**
 * Validation RELATIONNELLE · suppose la forme valide (`validerFormeBrief`).
 */
export function validerRelationsBrief(b: BriefCanonique, c: ContexteRelationsBrief): ViolationBrief[] {
  const v: ViolationBrief[] = [];
  const sources = new Set(c.sources.map((s) => s.sourceId));
  const permises = new Set([...sources, ...(c.productId ? [idSourceProduit(c.productId)] : [])]);
  const ids = new Set<string>();
  b.facts.forEach((f, i) => {
    if (ids.has(f.id)) v.push({ chemin: `/brief/facts/${i}/id`, raison: 'identifiant de fait en double' });
    ids.add(f.id);
    f.sourceIds.forEach((s, j) => {
      if (!permises.has(s)) v.push({ chemin: `/brief/facts/${i}/sourceIds/${j}`, raison: s.startsWith('produit:') ? 'fait d’un produit qui n’est pas celui du projet' : 'source absente du projet' });
    });
    if (f.kind !== 'hypothesis' && f.kind !== 'declared' && f.sourceIds.length === 0) v.push({ chemin: `/brief/facts/${i}/sourceIds`, raison: 'une observation ou une mesure cite sa source' });
  });
  if (b.hypothesisId !== null) {
    if (!b.facts.some((f) => f.id === b.hypothesisId && f.kind === 'hypothesis')) v.push({ chemin: '/brief/hypothesisId', raison: 'hypothèse citée absente des faits' });
    if (!b.testedVariable.trim()) v.push({ chemin: '/brief/testedVariable', raison: 'une hypothèse exige sa variable testée' });
  }
  if (b.testedVariable.trim() && !b.variables.includes(b.testedVariable)) v.push({ chemin: '/brief/variables', raison: 'la variable testée doit figurer parmi les variables' });
  if (b.testedVariable.trim() && b.hypothesisId === null) v.push({ chemin: '/brief/hypothesisId', raison: 'une variable testée sans hypothèse' });
  const refs = new Set<string>();
  b.references.forEach((r, i) => {
    if (refs.has(r.assetId)) v.push({ chemin: `/brief/references/${i}/assetId`, raison: 'référence en double' });
    refs.add(r.assetId);
  });
  v.push(...controlerNarrationObservee(b.facts.map((f, i) => ({ chemin: `/brief/facts/${i}/claim`, claim: f.claim, kind: f.kind, sourceIds: f.sourceIds })), c.sources));
  v.push(...fuitesConcurrent(champsImportables(b), c.sources));
  return v;
}

/* ───────────────────────────── Complétude ────────────────────────────────── */

export type CleManque =
  | 'sources' | 'source_inaccessible' | 'hypothese' | 'variable' | 'objectif' | 'audience'
  | 'produit' | 'photo_produit' | 'faits_produit' | 'reference_visuelle' | 'formats';

export interface ManqueProjet { cle: CleManque; libelle: string; bloquant: boolean }

export type EtapeProjet = 'brief_a_completer' | 'brief_pret' | 'production';

export const LIBELLES_ETAPE: Readonly<Record<EtapeProjet, string>> = {
  brief_a_completer: 'Brief à compléter',
  brief_pret: 'Brief prêt',
  production: 'En production',
};

export interface EntreeCompletude {
  brief: BriefCanonique | null;
  produit: ReferenceProduitStudio | null;
  sources: ReadonlyArray<Pick<SourceReferenceStudio, 'statut'>>;
  /** Le projet porte-t-il déjà des plans, un document ou une timeline ? */
  aDuContenuDeProduction?: boolean;
}

/**
 * Ce qui manque, sans bloquer la consultation · `bloquant` = empêche de dire
 * « brief prêt », pas d'ouvrir le projet.
 */
export function completudeProjet(e: EntreeCompletude): { manques: ManqueProjet[]; etape: EtapeProjet; libelleEtape: string } {
  const m: ManqueProjet[] = [];
  const b = e.brief;
  if (e.sources.length === 0) m.push({ cle: 'sources', libelle: 'Aucune source liée', bloquant: false });
  const inaccessibles = e.sources.filter((s) => s.statut !== 'active').length;
  if (inaccessibles) m.push({ cle: 'source_inaccessible', libelle: `${inaccessibles} source${inaccessibles > 1 ? 's' : ''} n’${inaccessibles > 1 ? 'sont' : 'est'} plus accessible${inaccessibles > 1 ? 's' : ''} · observations conservées`, bloquant: false });
  if (!b || !b.hypothesisId) m.push({ cle: 'hypothese', libelle: 'Hypothèse à choisir ou rédiger', bloquant: true });
  if (!b || !b.testedVariable.trim()) m.push({ cle: 'variable', libelle: 'Variable testée à préciser', bloquant: true });
  if (!b || !b.objective.trim()) m.push({ cle: 'objectif', libelle: 'Objectif à préciser', bloquant: true });
  if (!e.produit) m.push({ cle: 'produit', libelle: 'Produit de la marque à choisir', bloquant: true });
  else {
    if (!e.produit.photoDisponible) m.push({ cle: 'photo_produit', libelle: 'Photo produit manquante', bloquant: false });
    const autres = e.produit.manques.filter((x) => x.cle !== 'photo');
    if (autres.length) m.push({ cle: 'faits_produit', libelle: `Faits produit manquants : ${autres.map((x) => x.libelle.toLowerCase()).join(', ')}`, bloquant: false });
  }
  if (!b || !b.audience.trim()) m.push({ cle: 'audience', libelle: 'Audience à préciser', bloquant: false });
  if (!b || b.references.length === 0) m.push({ cle: 'reference_visuelle', libelle: 'Aucune référence visuelle épinglée', bloquant: false });
  if (!b || b.formats.length === 0) m.push({ cle: 'formats', libelle: 'Format de sortie à choisir', bloquant: false });
  const etape: EtapeProjet = e.aDuContenuDeProduction ? 'production' : m.some((x) => x.bloquant) ? 'brief_a_completer' : 'brief_pret';
  return { manques: m, etape, libelleEtape: LIBELLES_ETAPE[etape] };
}

/* ─────────────────────────────── Export ──────────────────────────────────── */

export const LIBELLES_TYPE_PROJET: Readonly<Record<string, string>> = {
  ads: 'Pub statique',
  image: 'Image',
  video: 'Vidéo',
  text: 'Textes',
  campaign: 'Campagne',
};

export const LIBELLES_NATURE_FAIT: Readonly<Record<NatureFait, string>> = {
  observed: 'Observé',
  measured: 'Mesuré',
  declared: 'Déclaré',
  hypothesis: 'Hypothèse',
};

/** JJ/MM/AAAA en UTC · déterministe, sans fuseau du serveur. */
export function dateCourteUtc(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export interface MetaExportBrief {
  titre: string;
  marque: string;
  type: string;
  versionN: number;
  versionId: string;
  exporteLe: string;
  sources: readonly SourceReferenceStudio[];
  produit: ReferenceProduitStudio | null;
}

export type FormatExportBrief = 'markdown' | 'json';

export interface ExportBrief { nomFichier: string; typeMime: string; contenu: string }

function nomFichier(titre: string, n: number, ext: string): string {
  const base = titre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'projet';
  return `brief-${base}-v${n}.${ext}`;
}

const puce = (t: string) => `- ${t}`;
const section = (titre: string, lignes: string[]) => (lignes.length ? [`## ${titre}`, '', ...lignes, ''] : [`## ${titre}`, '', '_Non renseigné._', '']);

export function exporterBrief(b: BriefCanonique, meta: MetaExportBrief, format: FormatExportBrief): ExportBrief {
  if (format === 'json') {
    const contenu = JSON.stringify({
      schema: 'tiktrends.studio.brief/1',
      projet: { titre: meta.titre, marque: meta.marque, type: meta.type, version: meta.versionN, versionId: meta.versionId, exporteLe: meta.exporteLe },
      brief: b,
      produit: meta.produit,
      sources: meta.sources.map((s) => ({
        sourceId: s.sourceId, type: s.type, cle: s.cle, annonceur: s.annonceur, plateforme: s.plateforme, droit: s.droit,
        observeLe: s.observeLe, statut: s.statut, revoqueeLe: s.revoqueeLe, empreinte: s.empreinte,
        extraitAutorise: s.extraitAutorise, modalites: s.modalites, absents: s.absents,
      })),
    }, null, 2);
    return { nomFichier: nomFichier(meta.titre, meta.versionN, 'json'), typeMime: 'application/json', contenu };
  }

  const h = hypotheseDuBrief(b);
  const faitsPar = (k: NatureFait) => b.facts.filter((f) => f.kind === k && !(h && (f.id === h.id || f.id.startsWith(`${h.id}.`))))
    .map((f) => puce(`${f.claim}${f.sourceIds.length ? ` (source : ${f.sourceIds.join(', ')})` : ''}`));
  const lignes: string[] = [
    `# ${meta.titre}`,
    '',
    `Marque : ${meta.marque} · Type : ${LIBELLES_TYPE_PROJET[meta.type] ?? meta.type} · Version ${meta.versionN} · Exporté le ${dateCourteUtc(meta.exporteLe)}`,
    '',
    'Ce brief ne déclenche aucune génération et ne coûte rien · il se produit avec l’outil de ton choix.',
    '',
    ...section('Objectif', b.objective ? [b.objective] : []),
    ...section('Audience', b.audience ? [b.audience] : []),
    ...section('Hypothèse', h ? [
      h.statement,
      '',
      puce(`Variable testée : ${b.testedVariable || 'à préciser'}`),
      ...(h.control ? [puce(`Témoin : ${h.control}`)] : []),
      ...(h.treatment ? [puce(`Traitement : ${h.treatment}`)] : []),
      ...(h.metric ? [puce(`Mesure : ${h.metric}`)] : []),
      ...(h.decisionRule ? [puce(`Règle de décision : ${h.decisionRule}`)] : []),
      ...h.limitations.map((l) => puce(`Limite : ${l}`)),
    ] : []),
    ...section('Invariants', b.invariants.map(puce)),
    ...section('Produit', meta.produit ? [
      `**${meta.produit.nom}**`,
      ...meta.produit.faits.map((f) => puce(`${f.libelle} : ${f.valeur}`)),
      ...meta.produit.manques.map((f) => puce(`${f.libelle} : manquant`)),
    ] : []),
    ...section('Faits observés', faitsPar('observed')),
    ...section('Mesures publiques', faitsPar('measured')),
    ...section('Faits déclarés', faitsPar('declared')),
    ...section('Composition', b.composition ? [b.composition] : []),
    ...section('Intention de style', b.styleIntent ? [b.styleIntent] : []),
    ...section('Textes', b.texts.map(puce)),
    ...section('Formats', b.formats.map(puce)),
    ...section('Exclusions', b.exclusions.map(puce)),
    ...section('Sources', meta.sources.flatMap((s) => [
      puce(`${LIBELLES_TYPE_SOURCE[s.type]} · ${s.annonceur || 'annonceur inconnu'} · ${s.plateforme} · observée le ${dateCourteUtc(s.observeLe)} · droit : observation publique, structure seulement · ${LIBELLES_STATUT_SOURCE[s.statut]}${s.revoqueeLe ? ` le ${dateCourteUtc(s.revoqueeLe)}` : ''} · empreinte ${s.empreinte.slice(0, 12)}`),
      `  - Ressources disponibles : ${s.modalites.length ? s.modalites.map((x) => LIBELLES_MODALITE[x]).join(', ') : 'aucune'}`,
      ...s.absents.map((a) => `  - ${LIBELLES_ELEMENT[a.element]} non observable : ${a.raison}`),
    ])),
  ];
  return { nomFichier: nomFichier(meta.titre, meta.versionN, 'md'), typeMime: 'text/markdown', contenu: lignes.join('\n') };
}
