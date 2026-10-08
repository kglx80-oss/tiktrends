/**
 * Studios · L5 · TEXTES IA liés au brief (cahier 01 §2.2 « Textes IA », §4.7 ;
 * contrats `text_write_input` / `text_write_output` ; FLOW-10, SEC-04).
 *
 * Pur · ni base, ni réseau, ni modèle.
 *
 * Hooks, corps, CTA et scripts partagent le MÊME brief, les mêmes faits et la
 * même hypothèse que les studios : la tâche `text.write` reçoit le brief de la
 * version courante (document résolu), ses faits (seuls citables par une
 * allégation) et ses invariants ; chaque variante cite ses faits et dit la
 * variable qu'elle change.
 *
 * ── Où vivent les textes retenus ─────────────────────────────────────────────
 *
 * Dans `brief.texts` (le champ du contrat), une ligne lisible par texte :
 * « Hook (fr) · Tes lunettes tiennent enfin · sources : produit.promesse ».
 * Lisible dans l'export du brief, relu ici sans perte (type, langue, texte,
 * sources). Un texte d'une autre forme reste un texte « libre », jamais perdu.
 * Les variantes proposées par le modèle ne sont PAS écrites tant qu'on ne les
 * retient pas : rien n'entre dans le projet sans un geste explicite.
 */

import type { BriefCanonique } from '../brief';
import type { SourceReferenceStudio } from '../sources/reference';
import { idSourceProduit, type FaitProduit } from '../sources/produit';
import { hypotheseDuBrief } from '../brief';
import type { ContenuVersion, ViolationStudio } from '../document';
import type { ChangementPatch } from '../patch';
import { jsonCanonique, sha256Hex } from '../version';
import { HEADLINE_FLOOR } from '../../copy-budget';
import { costOfTokens } from '../../spend-guard';
import { JETONS_ENTREE_MAX_PROPOSITION, JETONS_SORTIE_MAX_PROPOSITION } from '../bornes-taches';

/* ─────────────────────────────── Types ───────────────────────────────────── */

export const TYPES_TEXTE = ['hook', 'ad_copy', 'cta', 'script'] as const;
export type TypeTexte = typeof TYPES_TEXTE[number];
export const estTypeTexte = (x: unknown): x is TypeTexte => typeof x === 'string' && (TYPES_TEXTE as readonly string[]).includes(x);

export const LIBELLES_TYPE_TEXTE: Readonly<Record<TypeTexte, string>> = { hook: 'Hook', ad_copy: 'Corps', cta: 'CTA', script: 'Script' };
export const LIBELLES_TYPE_TEXTE_PLURIEL: Readonly<Record<TypeTexte, string>> = { hook: 'hooks', ad_copy: 'corps de texte', cta: 'CTA', script: 'scripts' };

/** Plafond d'un texte dans le contrat (`maxLength` de `text_write_output`). */
export const TEXTE_MAX_CONTRAT = 12_000;

/**
 * Limite de caractères proposée par type. Seule celle du hook est MESURÉE :
 * le palier où la police de l'accroche atteint son plancher (`HEADLINE_FLOOR`,
 * `copy-budget.ts`). Pour les autres, aucune mesure n'existe dans le dépôt :
 * on n'en invente pas, la limite par défaut est celle du contrat, et
 * l'utilisateur la resserre à l'écran.
 */
export const LIMITE_CARACTERES: Readonly<Record<TypeTexte, number>> = {
  hook: HEADLINE_FLOOR,
  ad_copy: TEXTE_MAX_CONTRAT,
  cta: TEXTE_MAX_CONTRAT,
  script: TEXTE_MAX_CONTRAT,
};
export const LIMITE_MESUREE: Readonly<Record<TypeTexte, boolean>> = { hook: true, ad_copy: false, cta: false, script: false };

/** Bornes du contrat `text_write_input`. */
export const VARIANTES_MAX = 6;
export const VARIANTES_DEFAUT = 3;

export interface TexteStudio {
  id: string;
  type: TypeTexte | 'libre';
  langue: string;
  texte: string;
  /** Identifiants des faits du brief qui fondent les allégations du texte. */
  sources: string[];
}

/* ─────────────────────── Lignes de `brief.texts` ─────────────────────────── */

const SEP_SOURCES = ' · sources : ';
const LIGNE = /^(Hook|Corps|CTA|Script) \(([a-z]{2})\) · ([\s\S]+)$/;
const PAR_LIBELLE = new Map<string, TypeTexte>(TYPES_TEXTE.map((t) => [LIBELLES_TYPE_TEXTE[t], t]));

export function idTexte(ligne: string): string {
  return `tx_${sha256Hex(ligne).slice(0, 16)}`;
}

/** La ligne écrite dans `brief.texts`. */
export function ligneTexte(t: Pick<TexteStudio, 'type' | 'langue' | 'texte' | 'sources'>): string {
  if (t.type === 'libre') return t.texte;
  const sources = t.sources.length ? `${SEP_SOURCES}${t.sources.join(', ')}` : '';
  return `${LIBELLES_TYPE_TEXTE[t.type]} (${t.langue}) · ${t.texte}${sources}`;
}

export function lireLigneTexte(ligne: string): TexteStudio {
  const m = LIGNE.exec(ligne);
  if (!m) return { id: idTexte(ligne), type: 'libre', langue: '', texte: ligne, sources: [] };
  let corps = m[3]!;
  let sources: string[] = [];
  const i = corps.lastIndexOf(SEP_SOURCES);
  if (i >= 0) {
    const ids = corps.slice(i + SEP_SOURCES.length).split(',').map((s) => s.trim());
    if (ids.length && ids.every((s) => /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(s))) { sources = ids; corps = corps.slice(0, i); }
  }
  return { id: idTexte(ligne), type: PAR_LIBELLE.get(m[1]!)!, langue: m[2]!, texte: corps, sources };
}

export function lireTextesBrief(b: BriefCanonique | null): TexteStudio[] {
  if (!b) return [];
  const vus = new Set<string>();
  return b.texts.map(lireLigneTexte).filter((t) => (vus.has(t.id) ? false : (vus.add(t.id), true)));
}

/* ───────────────────────────── Validation ────────────────────────────────── */

export interface SaisieTexte { type: unknown; langue?: unknown; texte: unknown; sources?: unknown }

/**
 * Un texte saisi ou édité · type connu, langue (2 lettres), texte non vide
 * dans la borne du contrat, sources = faits DU brief seulement. Une allégation
 * ne peut pas citer un fait inventé.
 */
export function validerSaisieTexte(s: SaisieTexte, b: BriefCanonique, chemin = 'texte'): { ok: true; texte: TexteStudio } | { ok: false; violations: ViolationStudio[] } {
  const v: ViolationStudio[] = [];
  if (!estTypeTexte(s.type)) v.push({ chemin: `${chemin}/type`, raison: 'type hook, ad_copy, cta ou script attendu' });
  const langue = s.langue === undefined ? 'fr' : s.langue;
  if (typeof langue !== 'string' || !/^[a-z]{2}$/.test(langue)) v.push({ chemin: `${chemin}/langue`, raison: 'langue en deux lettres attendue' });
  const texte = typeof s.texte === 'string' ? s.texte.replace(/\r\n?/g, '\n').trim() : '';
  if (!texte) v.push({ chemin: `${chemin}/texte`, raison: 'texte vide' });
  else if ([...texte].length > TEXTE_MAX_CONTRAT) v.push({ chemin: `${chemin}/texte`, raison: `${TEXTE_MAX_CONTRAT} caractères au plus` });
  const faits = new Set(b.facts.map((f) => f.id));
  const sources = s.sources === undefined ? [] : s.sources;
  if (!Array.isArray(sources) || !sources.every((x) => typeof x === 'string')) v.push({ chemin: `${chemin}/sources`, raison: 'liste d’identifiants de faits attendue' });
  else sources.forEach((x, i) => { if (!faits.has(x)) v.push({ chemin: `${chemin}/sources/${i}`, raison: 'fait absent du brief · une allégation cite un fait du brief' }); });
  if (v.length) return { ok: false, violations: v };
  const t = { type: s.type as TypeTexte, langue: langue as string, texte, sources: [...new Set(sources as string[])] };
  return { ok: true, texte: { ...t, id: idTexte(ligneTexte(t)) } };
}

/** Remplace la liste ENTIÈRE (collection indexée par position : jamais `/brief/texts/0`). */
export function changementsTextes(textes: readonly TexteStudio[], raison: string): ChangementPatch[] {
  const lignes = [...new Set(textes.map(ligneTexte))].slice(0, 100);
  return [{ op: 'replace', path: '/brief/texts', newValue: lignes, reason: raison.slice(0, 2000) }];
}

/* ─────────────────────── Tâche `text.write` ──────────────────────────────── */

export function idsVariantesAlloues(n: number): Array<{ id: string; entityType: 'variant'; ordinal: number }> {
  return Array.from({ length: Math.min(Math.max(1, n), VARIANTES_MAX) }, (_, i) => ({ id: `txv_${i + 1}`, entityType: 'variant' as const, ordinal: i }));
}

/** Le brief, résumé pour la tâche · une DONNÉE (chaque champ vient du brief validé). */
export function resumeBrief(b: BriefCanonique): string {
  const h = hypotheseDuBrief(b);
  const l = (nom: string, x: string | string[]) => {
    const t = Array.isArray(x) ? x.filter(Boolean).join(' ; ') : x;
    return t.trim() ? `${nom} : ${t.trim()}` : '';
  };
  return [
    l('Objectif', b.objective), l('Audience', b.audience),
    l('Hypothèse', h?.statement ?? ''), l('Variable testée', b.testedVariable),
    l('Témoin', h?.control ?? ''), l('Traitement', h?.treatment ?? ''),
    l('Invariants', b.invariants), l('Exclusions', b.exclusions),
    l('Composition', b.composition), l('Intention de style', b.styleIntent), l('Formats', b.formats),
  ].filter(Boolean).join('\n').slice(0, TEXTE_MAX_CONTRAT);
}

/**
 * Les sources que citent les faits du brief, fournies à la tâche comme
 * DONNÉES non fiables (`untrusted_data`) · une annonce concurrente par son
 * extrait autorisé, le produit par ses faits déclarés. Un fait qui cite une
 * source absente fait bloquer la tâche par le registre (jamais inventée ici).
 */
export function sourcesCitees(b: BriefCanonique, sources: readonly SourceReferenceStudio[], produit: { productId: string; nom: string; faits: readonly FaitProduit[] } | null): Array<{ sourceId: string; version: string; text: string; titre: string }> {
  const citees = new Set(b.facts.flatMap((f) => f.sourceIds));
  const out: Array<{ sourceId: string; version: string; text: string; titre: string }> = [];
  for (const s of sources) {
    if (!citees.has(s.sourceId)) continue;
    out.push({
      sourceId: s.sourceId, version: s.empreinte, titre: s.annonceur || s.cle,
      text: [
        `Annonce ${s.plateforme} de « ${s.annonceur || 'annonceur inconnu'} », observée le ${s.observeLe.slice(0, 10)} · structure seulement, rien de cette marque ne se reprend.`,
        s.extraitAutorise ? `Extrait autorisé du texte : ${s.extraitAutorise}` : 'Aucun texte.',
      ].join('\n').slice(0, TEXTE_MAX_CONTRAT),
    });
  }
  if (produit && citees.has(idSourceProduit(produit.productId))) {
    out.push({
      sourceId: idSourceProduit(produit.productId), version: 'catalogue', titre: produit.nom || 'Produit',
      text: [`Produit de la marque : ${produit.nom}`, ...produit.faits.map((f) => `${f.libelle} : ${f.valeur}`)].join('\n').slice(0, TEXTE_MAX_CONTRAT),
    });
  }
  return out;
}

export interface EntreeEcriture {
  brief: BriefCanonique;
  versionId: string;
  type: TypeTexte;
  maxCaracteres: number;
  nombre: number;
  langue: string;
}

/**
 * Ce qui part au registre · `taskInputs` conformes à `text_write_input`, le
 * brief en document résolu (`Fact` déclaré : le registre ne connaît pas encore
 * de `schemaKey` Brief), ses faits, ses invariants, les identifiants alloués.
 */
/**
 * Un document résolu `Fact` (déclaré) · le registre valide chaque document par
 * son `schemaKey` et ne connaît pas encore `Brief` : le brief part résumé dans
 * un fait déclaré, validé par la définition `Fact` du contrat.
 */
export function documentResolu(id: string, version: string, claim: string) {
  const content = { id, claim: claim.slice(0, TEXTE_MAX_CONTRAT), sourceIds: [] as string[], kind: 'declared' as const, confidence: 'high' as const };
  return { id, version, schemaKey: 'Fact', content, sha256: sha256Hex(jsonCanonique(content)) };
}

export function documentBrief(b: BriefCanonique, versionId: string) {
  return documentResolu(`brief_${versionId}`, versionId, resumeBrief(b) || 'Brief sans champ renseigné.');
}

export function entreeEcriture(e: EntreeEcriture) {
  const doc = documentBrief(e.brief, e.versionId);
  const briefId = doc.id;
  const invariants = [
    ...e.brief.invariants,
    ...e.brief.exclusions.map((x) => `Exclusion : ${x}`),
    ...(e.brief.testedVariable.trim() ? [`Seule la variable du test change : ${e.brief.testedVariable.trim()}`] : []),
  ].slice(0, 100);
  return {
    briefId,
    taskInputs: { briefId, contentType: e.type, maxCharacters: Math.min(Math.max(1, Math.floor(e.maxCaracteres)), 20_000), variantCount: Math.min(Math.max(1, Math.floor(e.nombre)), VARIANTES_MAX) },
    resolvedDocuments: [doc],
    facts: e.brief.facts.map((f) => ({ id: f.id, claim: f.claim, sourceIds: [...f.sourceIds], kind: f.kind, confidence: f.confidence })),
    invariants,
    allocatedIds: idsVariantesAlloues(e.nombre),
    language: e.langue,
  };
}

export interface VarianteTexte extends TexteStudio {
  type: TypeTexte;
  variable: string;
  /** La variante change une autre variable que celle du test · dit, pas caché. */
  horsVariable: boolean;
  longueur: number;
}

/**
 * Relit le `result` validé par le registre · seconde garde, indépendante :
 * longueur, allégations fondées sur les faits du brief, variable du test.
 * Une variante qui cite un fait absent est ÉCARTÉE (dit), jamais retenue.
 */
export function relireVariantes(result: unknown, e: Pick<EntreeEcriture, 'brief' | 'type' | 'maxCaracteres' | 'langue'>): { variantes: VarianteTexte[]; ecartees: Array<{ id: string; raison: string }> } {
  const variantes: VarianteTexte[] = [];
  const ecartees: Array<{ id: string; raison: string }> = [];
  const brutes = (result as { variants?: unknown } | null)?.variants;
  if (!Array.isArray(brutes)) return { variantes, ecartees };
  const faits = new Set(e.brief.facts.map((f) => f.id));
  const variable = e.brief.testedVariable.trim().toLocaleLowerCase('fr');
  for (const x of brutes.slice(0, VARIANTES_MAX)) {
    const o = x as { id?: unknown; text?: unknown; claimSourceIds?: unknown; changedVariable?: unknown };
    const id = typeof o.id === 'string' ? o.id : '?';
    const texte = typeof o.text === 'string' ? o.text.trim() : '';
    const sources = Array.isArray(o.claimSourceIds) ? o.claimSourceIds.filter((s): s is string => typeof s === 'string') : [];
    const n = [...texte].length;
    if (!texte) { ecartees.push({ id, raison: 'texte vide' }); continue; }
    if (n > e.maxCaracteres) { ecartees.push({ id, raison: `${n} caractères pour ${e.maxCaracteres} au plus` }); continue; }
    const inconnues = sources.filter((s) => !faits.has(s));
    if (inconnues.length) { ecartees.push({ id, raison: `allégation fondée sur ${inconnues.join(', ')}, absent des faits du brief` }); continue; }
    const changee = typeof o.changedVariable === 'string' ? o.changedVariable.trim() : '';
    const t = { type: e.type, langue: e.langue, texte, sources: [...new Set(sources)] };
    variantes.push({
      ...t, id: idTexte(ligneTexte(t)), variable: changee, longueur: n,
      horsVariable: !!variable && !!changee && changee.toLocaleLowerCase('fr') !== variable,
    });
  }
  return { variantes, ecartees };
}

/* ───────────────────────────── Coût et accès ─────────────────────────────── */

/** Coût MAXIMAL d'un appel `text.write` · bornes du résolveur, sortie pleine. Jamais « gratuit ». */
export function coutMaximalTexte(modele: string): number {
  return costOfTokens(modele, JETONS_ENTREE_MAX_PROPOSITION, JETONS_SORTIE_MAX_PROPOSITION);
}

export type MotifIndisponibiliteTextes = 'SANS_BRIEF' | 'DROIT_PROPOSER' | 'RELEASE_ACTIVE_ABSENTE' | 'FOURNISSEUR_NON_CONFIGURE' | 'PLAFOND_ATTEINT';

export interface DisponibiliteTextes {
  disponible: boolean;
  motif: MotifIndisponibiliteTextes | null;
  raison: string;
  coutMaxUsd: number;
}

/** La première cause qui empêche d'écrire avec l'IA, dite en clair · la saisie manuelle reste ouverte. */
export function disponibiliteTextes(e: { briefPresent: boolean; peutProposer: boolean; releasePubliee: boolean; fournisseurConfigure: boolean; plafondAtteint: boolean; modele: string }): DisponibiliteTextes {
  const coutMaxUsd = coutMaximalTexte(e.modele);
  const non = (motif: MotifIndisponibiliteTextes, raison: string): DisponibiliteTextes => ({ disponible: false, motif, raison, coutMaxUsd });
  if (!e.briefPresent) return non('SANS_BRIEF', 'Ce projet n’a pas encore de brief · les textes s’écrivent à partir du brief.');
  if (!e.peutProposer) return non('DROIT_PROPOSER', 'Ton rôle permet de lire les textes, pas d’en écrire.');
  if (!e.releasePubliee) return non('RELEASE_ACTIVE_ABSENTE', 'L’écriture par l’IA n’est pas encore activée (aucune version des consignes n’est publiée) · écris tes textes ci-dessous, ils se rangent de la même façon.');
  if (!e.fournisseurConfigure) return non('FOURNISSEUR_NON_CONFIGURE', 'Le fournisseur de texte n’est pas configuré sur ce serveur · écris tes textes ci-dessous.');
  if (e.plafondAtteint) return non('PLAFOND_ATTEINT', 'Le plafond de dépense est atteint · écris tes textes ci-dessous ou attends le prochain cycle.');
  return { disponible: true, motif: null, raison: '', coutMaxUsd };
}

/* ───────────────────────────── Comparaison ───────────────────────────────── */

export type SegmentComparaison = { type: 'egal' | 'retire' | 'ajoute'; texte: string };
const MOTS_COMPARES_MAX = 800;

/**
 * Différence mot à mot (plus longue sous-suite commune). Au-delà de
 * `MOTS_COMPARES_MAX` mots par texte, la comparaison rend les deux textes
 * entiers (retiré / ajouté) plutôt que de bloquer l'écran.
 */
export function comparerTextes(a: string, b: string): { segments: SegmentComparaison[]; longueurA: number; longueurB: number; motsCommuns: number } {
  const ma = a.split(/(\s+)/).filter((x) => x.length);
  const mb = b.split(/(\s+)/).filter((x) => x.length);
  const longueurA = [...a].length;
  const longueurB = [...b].length;
  if (ma.length > MOTS_COMPARES_MAX || mb.length > MOTS_COMPARES_MAX) {
    return { segments: [{ type: 'retire', texte: a }, { type: 'ajoute', texte: b }], longueurA, longueurB, motsCommuns: 0 };
  }
  const n = ma.length, m = mb.length;
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i]![j] = ma[i] === mb[j] ? t[i + 1]![j + 1]! + 1 : Math.max(t[i + 1]![j]!, t[i]![j + 1]!);
  const segments: SegmentComparaison[] = [];
  const pousse = (type: SegmentComparaison['type'], x: string) => {
    const d = segments[segments.length - 1];
    if (d && d.type === type) d.texte += x; else segments.push({ type, texte: x });
  };
  let i = 0, j = 0, communs = 0;
  while (i < n && j < m) {
    if (ma[i] === mb[j]) { pousse('egal', ma[i]!); if (ma[i]!.trim()) communs++; i++; j++; }
    else if (t[i + 1]![j]! >= t[i]![j + 1]!) { pousse('retire', ma[i]!); i++; }
    else { pousse('ajoute', mb[j]!); j++; }
  }
  while (i < n) pousse('retire', ma[i++]!);
  while (j < m) pousse('ajoute', mb[j++]!);
  return { segments, longueurA, longueurB, motsCommuns: communs };
}

/* ─────────────────────────────── Export ──────────────────────────────────── */

export type FormatExportTextes = 'markdown' | 'csv' | 'json';
export interface MetaExportTextes { titre: string; marque: string; versionN: number; versionId: string; exporteLe: string; brief: BriefCanonique }

function nomFichierTextes(titre: string, n: number, ext: string): string {
  const base = titre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'projet';
  return `textes-${base}-v${n}.${ext}`;
}

const champCsv = (x: string) => `"${x.replace(/"/g, '""')}"`;

/** Export SANS média · lecture pure, aucun appel, aucun débit (FLOW-10). */
export function exporterTextes(textes: readonly TexteStudio[], meta: MetaExportTextes, format: FormatExportTextes): { nomFichier: string; typeMime: string; contenu: string } {
  const faits = new Map(meta.brief.facts.map((f) => [f.id, f.claim]));
  const libelle = (t: TexteStudio) => (t.type === 'libre' ? 'Texte' : LIBELLES_TYPE_TEXTE[t.type]);
  if (format === 'json') {
    return {
      nomFichier: nomFichierTextes(meta.titre, meta.versionN, 'json'), typeMime: 'application/json',
      contenu: JSON.stringify({
        schema: 'tiktrends.studio.textes/1',
        projet: { titre: meta.titre, marque: meta.marque, version: meta.versionN, versionId: meta.versionId, exporteLe: meta.exporteLe },
        brief: { objectif: meta.brief.objective, hypothese: meta.brief.hypothesisId, variableTestee: meta.brief.testedVariable },
        textes: textes.map((t) => ({ id: t.id, type: t.type, langue: t.langue, texte: t.texte, sources: t.sources.map((s) => ({ id: s, fait: faits.get(s) ?? null })) })),
      }, null, 2),
    };
  }
  if (format === 'csv') {
    const lignes = [['type', 'langue', 'texte', 'sources'].join(','), ...textes.map((t) => [libelle(t), t.langue, t.texte, t.sources.join(' ')].map(champCsv).join(','))];
    return { nomFichier: nomFichierTextes(meta.titre, meta.versionN, 'csv'), typeMime: 'text/csv', contenu: `${lignes.join('\r\n')}\r\n` };
  }
  const groupes = [...TYPES_TEXTE, 'libre' as const].map((type) => ({ type, items: textes.filter((t) => t.type === type) })).filter((g) => g.items.length);
  const lignes = [
    `# Textes · ${meta.titre}`, '',
    `Marque : ${meta.marque} · Version ${meta.versionN} · Exporté le ${meta.exporteLe.slice(0, 10)}`, '',
    'Ces textes ne déclenchent aucune génération · copie-les dans l’outil de ton choix.', '',
    ...(meta.brief.testedVariable ? [`Variable testée : ${meta.brief.testedVariable}`, ''] : []),
    ...(textes.length === 0 ? ['_Aucun texte retenu._', ''] : []),
    ...groupes.flatMap((g) => [
      `## ${g.type === 'libre' ? 'Textes libres' : LIBELLES_TYPE_TEXTE[g.type]}`, '',
      ...g.items.flatMap((t) => [
        `- ${t.texte.replace(/\n/g, '\n  ')}${t.langue ? ` _(${t.langue})_` : ''}`,
        ...t.sources.map((s) => `  - Source : ${s}${faits.has(s) ? ` · ${faits.get(s)}` : ' · fait absent de cette version'}`),
      ]),
      '',
    ]),
  ];
  return { nomFichier: nomFichierTextes(meta.titre, meta.versionN, 'md'), typeMime: 'text/markdown', contenu: lignes.join('\n') };
}

/* ─────────────────────── Injection dans un calque ───────────────────────── */

export interface CalqueTexteResume { id: string; nom: string; texte: string }

export function calquesTexte(c: ContenuVersion | null): CalqueTexteResume[] {
  if (!c?.document) return [];
  return Object.values(c.document.layers)
    .filter((l) => l.kind === 'text')
    .sort((a, b) => a.z - b.z)
    .map((l) => ({ id: l.id, nom: l.name, texte: (l as { text: string }).text }));
}

const echapper = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');

/**
 * La proposition qui injecte un texte dans UN calque texte choisi · cible
 * `layer:<id>`, chemin borné au texte du calque. Rien n'est appliqué : la
 * proposition suit le chemin commun (aperçu, application, 409).
 */
export function injectionDansCalque(c: ContenuVersion, layerId: unknown, texte: string):
  | { ok: true; cible: string; allowedPaths: string[]; changes: ChangementPatch[]; explication: string }
  | { ok: false; violations: ViolationStudio[] } {
  if (typeof layerId !== 'string' || !c.document) return { ok: false, violations: [{ chemin: 'layerId', raison: 'ce projet n’a pas encore de mise en page à calques' }] };
  const l = Object.prototype.hasOwnProperty.call(c.document.layers, layerId) ? c.document.layers[layerId] : undefined;
  if (!l) return { ok: false, violations: [{ chemin: 'layerId', raison: 'calque introuvable dans la version courante' }] };
  if (l.kind !== 'text') return { ok: false, violations: [{ chemin: 'layerId', raison: 'ce calque n’est pas un calque texte' }] };
  const t = texte.trim();
  if (!t || [...t].length > TEXTE_MAX_CONTRAT) return { ok: false, violations: [{ chemin: 'texte', raison: 'texte vide ou trop long' }] };
  if (l.text === t) return { ok: false, violations: [{ chemin: 'texte', raison: 'le calque porte déjà ce texte' }] };
  const path = `/document/layers/${echapper(layerId)}/text`;
  return {
    ok: true, cible: `layer:${layerId}`, allowedPaths: [path],
    changes: [{ op: 'replace', path, newValue: t, reason: 'Texte retenu dans Textes IA' }],
    explication: `Remplacer le texte du calque « ${l.name} » par un texte retenu dans Textes IA.`,
  };
}
