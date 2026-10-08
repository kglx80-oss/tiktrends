/**
 * Dépôt du registre de prompts · `studio_prompt_versions`, `_releases`,
 * `_active`, `_evaluations`, et l'audit `studio_audit_events`.
 *
 * Les RÈGLES viennent du noyau (`packages/core/src/prompts/*`, via `noyau.ts`)
 * et de `correspondance.ts` ; ce module ne fait que lire, appeler la règle, et
 * écrire ce qu'elle autorise, dans UNE transaction avec son audit.
 *
 * ── Garanties ────────────────────────────────────────────────────────────────
 *
 *  - Import du pack : brouillons idempotents par (type, clé, version,
 *    empreinte), conflit = rien d'écrit (`planifierImport`), verrou consultatif
 *    pour que deux imports simultanés ne se croisent pas.
 *  - Versions : un brouillon se modifie par compare-and-set sur son empreinte ;
 *    une version validée est figée (déclencheur L1) et toute correction crée une
 *    version de numéro supérieur.
 *  - Releases : créées `staged` depuis des versions VALIDÉES et compatibles ;
 *    l'évaluation n'écrit que `evaluation` (et une ligne d'évaluation) ; la
 *    publication et le rollback déplacent le pointeur par compare-and-set
 *    (ligne verrouillée, `row_version` et release attendue), jamais autre chose.
 *  - Permissions : reçues dans `Acteur.octrois` (calculées par la garde),
 *    vérifiées par le noyau à chaque geste.
 *
 * Pas de `import 'server-only'` : le script d'import (tsx) charge ce module.
 * Il importe `@tiktrends/db` (pilote Postgres) : aucun bundle client ne peut
 * l'embarquer.
 */

import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  autorise, constat, controlerNouvelleVersion, controlerPublication, empreinteContenu, entreesDuPack,
  planifierImport, publierRelease as publierNoyau, resoudreReleaseEvaluation, retirerRelease as retirerNoyau,
  rollbackRelease as rollbackNoyau, sha256Texte, transitionVersion, POLITIQUE_SERVEUR,
  type Constat, type Octroi, type PackPrompts, type Pointeur, type Release, type EntreeRelease,
} from './noyau';
import {
  CLE_RENDU, CLE_SOCLE, contenuDeRelease, contenuPourBase, empreinteDeContenu, empreintesRelease, entierVersVersion,
  entreeDeLigne, lireEntrees, lireRevocation, referencesRelease, registreNoyau, releaseDeLigne, versionSuivante, versionVersEntier,
  type ContenuComplet, type EntreeServeur, type EntreesRelease, type LigneRelease, type LigneVersion, type TypeEntree,
  kindDe, typeDe,
} from './correspondance';
import { assemblerConsigneJarvis, validerPolitiqueConversation, SECTIONS_CONVERSATION } from './conversation';
import { chargerSource, validerPackSynthetique } from './source';
import type { EnvironnementPrompts } from './environnement';

/* ─────────────────────────────── Acteur ───────────────────────────────── */

export interface Acteur {
  userId: string | null;
  /** « equipe:admin/espace:owner », « script:… » · tracé dans l'audit. */
  roleEffectif: string;
  traceId: string;
  octrois: Octroi[];
}

export const ACTEUR_SCRIPT = (): Acteur => ({
  userId: null,
  roleEffectif: 'script:importer-pack-prompts',
  traceId: `st_${randomUUID()}`,
  octrois: [{ permission: 'prompt.draft', portee: { niveau: 'plateforme' } }],
});

const PLATEFORME = { niveau: 'plateforme' } as const;

export type Res<T> = ({ ok: true } & T) | { ok: false; constats: Constat[] };
const refus = (constats: Constat[]): { ok: false; constats: Constat[] } => ({ ok: false, constats });
const refusUn = (code: string, cible: string, message: string) => refus([constat(code, cible, message)]);
const interdit = (permission: string) => refusUn('FORBIDDEN', permission, `Permission ${permission} absente sur la plateforme.`);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Ex = typeof db | Tx;

/** Audit de portée PLATEFORME · aucun espace, aucune marque (le registre est global). */
async function audit(ex: Ex, a: Acteur, e: { action: string; targetType: string; targetId: string; avant?: string | null; apres?: string | null; raison?: string; details?: Record<string, unknown> }) {
  await ex.insert(schema.studioAuditEvents).values({
    actorId: a.userId, effectiveRole: a.roleEffectif, workspaceId: null, brandId: null,
    action: e.action, targetType: e.targetType, targetId: e.targetId,
    versionBefore: e.avant ?? null, versionAfter: e.apres ?? null,
    reason: (e.raison ?? '').slice(0, 2000), traceId: a.traceId, details: e.details ?? null,
  });
}

/* ─────────────────────────────── Lectures ─────────────────────────────── */

const V = schema.studioPromptVersions;
const R = schema.studioPromptReleases;
const P = schema.studioPromptActive;

export type LigneVersionBase = typeof V.$inferSelect;
export type LigneReleaseBase = typeof R.$inferSelect;
export type LignePointeur = typeof P.$inferSelect;

const plateformeV = and(eq(V.scope, 'platform'), isNull(V.workspaceId), isNull(V.brandId));

export async function listerVersions(ex: Ex = db): Promise<LigneVersionBase[]> {
  return ex.select().from(V).where(plateformeV).orderBy(V.kind, V.key, desc(V.version));
}

export async function lireVersionParId(id: string, ex: Ex = db): Promise<LigneVersionBase | null> {
  const [l] = await ex.select().from(V).where(and(eq(V.id, id), plateformeV)).limit(1);
  return l ?? null;
}

export async function listerReleases(ex: Ex = db): Promise<LigneReleaseBase[]> {
  return ex.select().from(R).where(eq(R.scope, 'platform')).orderBy(desc(R.createdAt));
}

export async function lireReleaseParId(id: string, ex: Ex = db): Promise<LigneReleaseBase | null> {
  const [l] = await ex.select().from(R).where(and(eq(R.id, id), eq(R.scope, 'platform'))).limit(1);
  return l ?? null;
}

export async function lirePointeur(ex: Ex = db, verrou = false): Promise<LignePointeur | null> {
  const q = ex.select().from(P).where(and(eq(P.scope, 'platform'), isNull(P.workspaceId), isNull(P.brandId))).limit(1);
  const [l] = verrou ? await q.for('update') : await q;
  return l ?? null;
}

export async function listerEvaluations(releaseId?: string, ex: Ex = db) {
  const t = schema.studioPromptEvaluations;
  const q = ex.select().from(t);
  return (releaseId ? q.where(eq(t.releaseId, releaseId)) : q).orderBy(desc(t.createdAt)).limit(200);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const estUuid = (x: unknown): x is string => typeof x === 'string' && UUID.test(x);

/** Contenus des versions, indexés `type:cle@version`. */
function indexContenus(lignes: ReadonlyArray<LigneVersionBase>): Map<string, unknown> {
  const m = new Map<string, unknown>();
  for (const l of lignes) {
    const t = typeDe(l.kind, l.key);
    if (t) m.set(`${t}:${l.key}@${entierVersVersion(l.version)}`, t === 'socle' ? l.content : l.content);
  }
  return m;
}

function entrees(lignes: ReadonlyArray<LigneVersionBase>): EntreeServeur[] {
  return lignes.map((l) => entreeDeLigne(l as unknown as LigneVersion)).filter((e): e is EntreeServeur => !!e);
}

/* ─────────────────────────────── Import ───────────────────────────────── */

interface EntreeImport extends EntreeServeur { contenu: Record<string, unknown>; origine: string }

function entreesImport(): EntreeImport[] {
  const s = chargerSource();
  const pack = s.pack;
  const sortie: EntreeImport[] = [];
  for (const e of entreesDuPack(pack, s.empreintes)) {
    let contenu: Record<string, unknown>;
    let origine = `${pack.origin} · ${pack.packId}@${pack.version}`;
    if (e.type === 'socle') contenu = contenuPourBase('socle', pack.commonSystemInstructions);
    else if (e.type === 'rendu') contenu = pack.rendering as unknown as Record<string, unknown>;
    else if (e.type === 'template') contenu = pack.templates.find((t) => t.key === e.cle)! as unknown as Record<string, unknown>;
    else {
      const r = pack.styleRecipes.find((x) => x.id === e.cle)!;
      contenu = r as unknown as Record<string, unknown>;
      origine = `${r.origin} · ${pack.packId}@${pack.version}`;
    }
    sortie.push({ id: '', type: e.type, cle: e.cle, version: e.version, contentHash: e.contentHash, statut: 'draft', contenu, origine });
  }
  for (const c of s.complement) {
    sortie.push({ id: '', type: 'conversation', cle: c.politique.key, version: c.politique.version, contentHash: c.contentHash, statut: 'draft', contenu: c.politique as unknown as Record<string, unknown>, origine: c.politique.origin });
  }
  return sortie;
}

export interface PlanImportServeur { aCreer: EntreeImport[]; dejaPresentes: EntreeServeur[] }

function planifier(existantes: ReadonlyArray<EntreeServeur>): Res<PlanImportServeur> {
  const s = chargerSource();
  const noyau = planifierImport(s.pack, s.empreintes, registreNoyau(existantes));
  const voulues = entreesImport();
  const conflits: Constat[] = [...noyau.conflits];
  const aCreer: EntreeImport[] = [];
  const dejaPresentes: EntreeServeur[] = [];
  for (const e of voulues) {
    const memes = existantes.filter((x) => x.type === e.type && x.cle === e.cle && x.version === e.version);
    if (e.type === 'conversation') {
      const autre = memes.find((x) => x.contentHash !== e.contentHash);
      if (autre) conflits.push(constat('IMPORT_CONFLIT_EMPREINTE', `conversation:${e.cle}@${e.version}`, 'Même clé et version, empreinte différente · créer une nouvelle version, jamais écraser.'));
      else if (memes.length) dejaPresentes.push(memes[0]!);
      else aCreer.push(e);
      continue;
    }
    if (noyau.aCreer.some((x) => x.type === e.type && x.cle === e.cle && x.version === e.version)) aCreer.push(e);
    else if (memes.length) dejaPresentes.push(memes[0]!);
  }
  // Une clé d'un autre type au même nom heurterait l'unicité (clé, version) de la table.
  for (const e of aCreer) {
    const heurt = existantes.find((x) => x.cle === e.cle && x.version === e.version && x.type !== e.type);
    if (heurt) conflits.push(constat('IMPORT_CLE_OCCUPEE', `${e.type}:${e.cle}@${e.version}`, `La clé est déjà prise par un ${heurt.type} de même version.`));
  }
  if (conflits.length) return refus(conflits);
  return { ok: true, aCreer, dejaPresentes };
}

/** Plan seul · ne lit que le registre, n'écrit rien. */
export async function planImportPack(ex: Ex = db): Promise<Res<PlanImportServeur>> {
  return planifier(entrees(await listerVersions(ex)));
}

/**
 * Importe le pack embarqué en brouillons · UNE transaction, audit compris.
 * Second passage : rien à créer, rien d'écrit. Conflit : rien d'écrit.
 */
export async function importerPack(a: Acteur): Promise<Res<{ crees: number; dejaPresentes: number }>> {
  if (!autorise(a.octrois, 'prompt.draft', PLATEFORME)) return interdit('prompt.draft');
  const s = chargerSource();
  return db.transaction(async (tx) => {
    // Deux imports simultanés se mettent en file · le second voit le premier.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('studio_prompt_import'))`);
    const plan = planifier(entrees(await listerVersions(tx)));
    if (!plan.ok) return plan;
    if (plan.aCreer.length === 0) return { ok: true as const, crees: 0, dejaPresentes: plan.dejaPresentes.length };
    const raison = `Import du pack ${s.pack.packId}@${s.pack.version} en brouillon`;
    await tx.insert(V).values(plan.aCreer.map((e) => ({
      key: e.cle, version: versionVersEntier(e.version)!, kind: kindDe(e.type), scope: 'platform' as const,
      status: 'draft' as const, content: e.contenu, contentHash: e.contentHash, origin: e.origine.slice(0, 500),
      reason: raison, createdBy: a.userId,
    })));
    await audit(tx, a, {
      action: 'prompt.import', targetType: 'prompt_pack', targetId: `${s.pack.packId}@${s.pack.version}`, raison,
      details: { crees: plan.aCreer.map((e) => `${e.type}:${e.cle}@${e.version}`), dejaPresentes: plan.dejaPresentes.length, packSha256: sha256Texte(JSON.stringify(s.empreintes)) },
    });
    return { ok: true as const, crees: plan.aCreer.length, dejaPresentes: plan.dejaPresentes.length };
  });
}

/* ─────────────────────────────── Versions ─────────────────────────────── */

/** Champs qu'un administrateur peut éditer, par type · jamais un champ de contrat. */
export const CHAMPS_EDITABLES: Readonly<Record<TypeEntree, readonly string[]>> = {
  template: ['title', 'taskInstructions', 'userTemplate'],
  recette: ['title', 'material', 'lighting', 'composition', 'invariants', 'forbiddenTransfers'],
  socle: [CLE_SOCLE],
  rendu: [],
  conversation: ['title', ...SECTIONS_CONVERSATION.map((s) => `sections.${s}`)],
};
const CHAMPS_LISTES = new Set(['invariants', 'forbiddenTransfers']);
export const LIMITE_CHAMP = 20000;

/** Applique les modifications autorisées · refuse tout champ hors liste. */
export function appliquerEdition(type: TypeEntree, base: Record<string, unknown>, champs: unknown): Res<{ contenu: Record<string, unknown> }> {
  if (typeof champs !== 'object' || champs === null || Array.isArray(champs)) return refusUn('INVALID_SCHEMA', 'champs', 'Modifications illisibles.');
  const permis = CHAMPS_EDITABLES[type];
  const contenu: Record<string, unknown> = JSON.parse(JSON.stringify(base));
  const constats: Constat[] = [];
  for (const [champ, valeur] of Object.entries(champs as Record<string, unknown>)) {
    if (!permis.includes(champ)) { constats.push(constat('CHAMP_NON_EDITABLE', champ, `« ${champ} » ne se modifie pas ici (contrat ou champ inconnu).`)); continue; }
    if (CHAMPS_LISTES.has(champ)) {
      if (!Array.isArray(valeur) || !valeur.every((x) => typeof x === 'string' && x.trim() && x.length <= 500) || valeur.length > 40) { constats.push(constat('INVALID_SCHEMA', champ, 'Liste de textes non vides attendue (40 au plus).')); continue; }
      contenu[champ] = valeur.map((x) => (x as string).trim());
      continue;
    }
    if (typeof valeur !== 'string' || !valeur.trim() || valeur.length > LIMITE_CHAMP) { constats.push(constat('INVALID_SCHEMA', champ, `Texte non vide de ${LIMITE_CHAMP} caractères au plus.`)); continue; }
    if (champ.startsWith('sections.')) (contenu.sections as Record<string, unknown>)[champ.slice(9)] = valeur;
    else contenu[champ] = valeur;
  }
  return constats.length ? refus(constats) : { ok: true, contenu };
}

function contenuAvecVersion(type: TypeEntree, contenu: Record<string, unknown>, version: string): Record<string, unknown> {
  const c = { ...contenu };
  if (type === 'template' || type === 'recette' || type === 'conversation') c.version = version;
  if (type === 'template') c.contentHash = empreinteContenu(c);
  return c;
}

/**
 * Enregistre un brouillon depuis une version de base. Base brouillon : mise à
 * jour en place, sous condition que personne ne l'ait réécrite (empreinte
 * attendue). Base validée ou retirée : NOUVELLE version, de numéro supérieur.
 */
export async function enregistrerBrouillon(a: Acteur, e: { baseId: unknown; champs: unknown; motif: unknown; empreinteAttendue?: unknown }): Promise<Res<{ id: string; version: string; nouvelle: boolean }>> {
  if (!autorise(a.octrois, 'prompt.draft', PLATEFORME)) return interdit('prompt.draft');
  if (!estUuid(e.baseId)) return refusUn('NOT_FOUND', '', 'Version introuvable.');
  const motif = typeof e.motif === 'string' ? e.motif.trim() : '';
  if (motif.length < 3) return refusUn('MOTIF_REQUIS', 'motif', 'Dis pourquoi tu modifies ce prompt (le motif entre dans l’audit).');
  return db.transaction(async (tx) => {
    const base = await lireVersionParId(e.baseId as string, tx);
    const type = base ? typeDe(base.kind, base.key) : null;
    if (!base || !type) return refusUn('NOT_FOUND', '', 'Version introuvable.');
    const ed = appliquerEdition(type, base.content as Record<string, unknown>, e.champs);
    if (!ed.ok) return ed;
    if (base.status === 'draft') {
      if (typeof e.empreinteAttendue === 'string' && e.empreinteAttendue !== base.contentHash) return refusUn('VERSION_CONFLICT', base.id, 'Ce brouillon a changé depuis ton ouverture · recharge-le.');
      const contenu = contenuAvecVersion(type, ed.contenu, entierVersVersion(base.version));
      const hash = empreinteDeContenu(type, contenu);
      const maj = await tx.update(V).set({ content: contenu, contentHash: hash, reason: motif.slice(0, 2000), updatedAt: new Date() })
        .where(and(eq(V.id, base.id), eq(V.status, 'draft'), eq(V.contentHash, base.contentHash))).returning({ id: V.id });
      if (maj.length !== 1) return refusUn('VERSION_CONFLICT', base.id, 'Ce brouillon a changé depuis ton ouverture · recharge-le.');
      await audit(tx, a, { action: 'prompt.version.brouillon', targetType: `prompt_${type}`, targetId: `${base.key}@${entierVersVersion(base.version)}`, avant: base.contentHash, apres: hash, raison: motif });
      return { ok: true as const, id: base.id, version: entierVersVersion(base.version), nouvelle: false };
    }
    const memes = await tx.select({ version: V.version }).from(V).where(and(plateformeV, eq(V.key, base.key), eq(V.kind, base.kind)));
    const versions = memes.map((m) => entierVersVersion(m.version));
    const nouvelle = versionSuivante(versions);
    const ctl = controlerNouvelleVersion(base.key, nouvelle, versions.map((v) => ({ cle: base.key, version: v })));
    if (ctl.length) return refus(ctl);
    const contenu = contenuAvecVersion(type, ed.contenu, nouvelle);
    const hash = empreinteDeContenu(type, contenu);
    const [cree] = await tx.insert(V).values({
      key: base.key, version: versionVersEntier(nouvelle)!, kind: base.kind, scope: 'platform', status: 'draft',
      content: contenu, contentHash: hash, origin: `ADMIN TikTrends · dérivée de ${base.key}@${entierVersVersion(base.version)}`, reason: motif.slice(0, 2000), createdBy: a.userId,
    }).returning({ id: V.id });
    await audit(tx, a, { action: 'prompt.version.brouillon', targetType: `prompt_${type}`, targetId: `${base.key}@${nouvelle}`, avant: `${base.key}@${entierVersVersion(base.version)}`, apres: hash, raison: motif });
    return { ok: true as const, id: cree!.id, version: nouvelle, nouvelle: true };
  });
}

/** Contrôles structurels d'une version · vide = validable. Réutilise la validation du pack. */
export function controlesStructurels(type: TypeEntree, cle: string, contenu: unknown, contentHash: string): Constat[] {
  if (empreinteDeContenu(type, contenu) !== contentHash) return [constat('EMPREINTE_FAUSSE', cle, 'Le contenu ne reproduit pas l’empreinte enregistrée.')];
  if (type === 'conversation') {
    const v = validerPolitiqueConversation(contenu);
    return v.ok ? [] : v.constats;
  }
  const pack = JSON.parse(JSON.stringify(chargerSource().pack)) as PackPrompts;
  const c = contenu as Record<string, unknown>;
  if (type === 'template') {
    const i = pack.templates.findIndex((t) => t.key === cle);
    if (i < 0) return [constat('CLE_HORS_PACK', cle, 'Clé de template inconnue du pack · aucun consommateur.')];
    pack.templates[i] = c as unknown as PackPrompts['templates'][number];
  } else if (type === 'recette') {
    const i = pack.styleRecipes.findIndex((r) => r.id === cle);
    if (i < 0) pack.styleRecipes.push(c as unknown as PackPrompts['styleRecipes'][number]);
    else pack.styleRecipes[i] = c as unknown as PackPrompts['styleRecipes'][number];
  } else if (type === 'socle') {
    pack.commonSystemInstructions = String(c[CLE_SOCLE] ?? '');
    pack.commonSystemHash = sha256Texte(pack.commonSystemInstructions);
  } else if (type === 'rendu') {
    pack.rendering = c as unknown as PackPrompts['rendering'];
  }
  const r = validerPackSynthetique(pack);
  // Une recette ajoutée change le nombre attendu · ce n'est pas un défaut de la version.
  return r.ok ? [] : r.constats.filter((x) => x.code !== 'PACK_NOMBRE_RECETTES');
}

/** Brouillon → validée · figée ensuite par la base. */
export async function validerVersion(a: Acteur, e: { id: unknown }): Promise<Res<{ id: string }>> {
  if (!estUuid(e.id)) return refusUn('NOT_FOUND', '', 'Version introuvable.');
  return db.transaction(async (tx) => {
    const l = await lireVersionParId(e.id as string, tx);
    const ent = l ? entreeDeLigne(l as unknown as LigneVersion) : null;
    if (!l || !ent) return refusUn('NOT_FOUND', '', 'Version introuvable.');
    const ctl = controlesStructurels(ent.type, l.key, l.content, l.contentHash);
    const t = transitionVersion({ entree: { type: ent.type === 'conversation' ? 'socle' : ent.type, cle: l.key, version: ent.version, statut: ent.statut }, vers: 'validated', octrois: a.octrois, controlesStructurels: ctl });
    if (!t.ok) return t;
    const maj = await tx.update(V).set({ status: 'validated', validatedBy: a.userId, validatedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(V.id, l.id), eq(V.status, 'draft'), eq(V.contentHash, l.contentHash))).returning({ id: V.id });
    if (maj.length !== 1) return refusUn('VERSION_CONFLICT', l.id, 'La version a changé pendant la validation · recharge-la.');
    await tx.insert(schema.studioPromptEvaluations).values({ promptVersionId: l.id, kind: 'structural', passed: true, result: { constats: [], contentHash: l.contentHash }, evaluatorId: a.userId });
    await audit(tx, a, { action: 'prompt.version.valider', targetType: `prompt_${ent.type}`, targetId: `${l.key}@${ent.version}`, avant: 'draft', apres: 'validated', details: { contentHash: l.contentHash } });
    return { ok: true as const, id: l.id };
  });
}

/* ─────────────────────────────── Releases ─────────────────────────────── */

/** Codes du noyau qui ne disent rien du CONTENU (droits, pointeur, évaluation). */
const CODES_HORS_CONTENU = new Set(['FORBIDDEN', 'RELEASE_NON_STAGED', 'VERSION_CONFLICT', 'PORTEE_INCOHERENTE', 'TESTS_STRUCTURELS_ABSENTS', 'BENCHMARK_NON_APPROUVE', 'RELEASE_REVOQUEE']);

/** Contrôles des politiques de conversation · ce que le noyau ne connaît pas. */
function controlerConversations(e: EntreesRelease, contenu: ContenuComplet, registre: ReadonlyArray<EntreeServeur>, releaseHash: string): Constat[] {
  const s = chargerSource();
  const sortie: Constat[] = [];
  const index = new Map(registre.filter((x) => x.type === 'conversation').map((x) => [`${x.cle}@${x.version}`, x]));
  const vues = new Set<string>();
  e.conversations.forEach((x, i) => {
    const cible = `conversation:${x.cle}@${x.version}`;
    if (vues.has(x.cle)) sortie.push(constat('CLE_DUPLIQUEE', x.cle, 'Une politique apparaît deux fois.'));
    vues.add(x.cle);
    const reg = index.get(`${x.cle}@${x.version}`);
    if (!reg) sortie.push(constat('VERSION_INCONNUE', cible, 'Entrée absente du registre.'));
    else {
      if (reg.statut !== 'validated') sortie.push(constat('VERSION_NON_VALIDEE', cible, `Statut ${reg.statut} · seule une version validée entre dans une release.`));
      if (reg.contentHash !== x.contentHash) sortie.push(constat('EMPREINTE_FAUSSE', cible, 'Empreinte de la release ≠ empreinte du registre.'));
    }
    const p = contenu.conversations[i];
    const v = validerPolitiqueConversation(p);
    if (!v.ok) sortie.push(...v.constats.map((c) => ({ ...c, cible: `${cible}${c.cible}` })));
    else if (v.contentHash !== x.contentHash) sortie.push(constat('EMPREINTE_FAUSSE', cible, 'Le contenu ne reproduit pas l’empreinte déclarée.'));
  });
  for (const cle of s.conversationsRequises) if (!vues.has(cle)) sortie.push(constat('CLE_REQUISE_ABSENTE', cle, `Le code consomme « ${cle} » · la release ne la contient pas.`));
  const { packHash, releaseHash: calcule } = empreintesRelease(contenu);
  if (packHash !== e.packHash || calcule !== releaseHash) sortie.push(constat('RELEASE_EMPREINTE_FAUSSE', 'release', 'L’empreinte de la release ne correspond pas à son contenu.'));
  return sortie;
}

interface ReleaseChargee { ligne: LigneReleaseBase; entrees: EntreesRelease; noyau: Release; contenu: ContenuComplet; versionIds: Map<string, string> }

async function chargerRelease(id: string, ex: Ex): Promise<ReleaseChargee | null> {
  const ligne = await lireReleaseParId(id, ex);
  if (!ligne) return null;
  const ent = lireEntrees(ligne.entries);
  const noyau = releaseDeLigne(ligne as unknown as LigneRelease);
  if (!ent || !noyau) return null;
  const refs = referencesRelease(ent);
  const cles = [...new Set(refs.map((r) => r.entree.cle))];
  const lignes = cles.length ? await ex.select().from(V).where(and(plateformeV, inArray(V.key, cles))) : [];
  const voulues = new Set(refs.map((r) => `${r.type}:${r.entree.cle}@${r.entree.version}`));
  const retenues = lignes.filter((l) => { const t = typeDe(l.kind, l.key); return t && voulues.has(`${t}:${l.key}@${entierVersVersion(l.version)}`); });
  const contenu = contenuDeRelease(ent, indexContenus(retenues));
  if (!contenu) return null;
  const versionIds = new Map(retenues.map((l) => [`${typeDe(l.kind, l.key)}:${l.key}@${entierVersVersion(l.version)}`, l.id]));
  return { ligne, entrees: ent, noyau, contenu, versionIds };
}

/** Cache des releases chargées · une release est immuable hors statut et évaluation (déclencheur L1). */
const cacheReleases = new Map<string, ReleaseChargee>();
export async function releaseChargee(id: string, ex: Ex = db): Promise<ReleaseChargee | null> {
  const enCache = cacheReleases.get(id);
  const ligne = await lireReleaseParId(id, ex);
  if (!ligne) return null;
  // Statut et évaluation (donc révocation) sont mobiles : le noyau est TOUJOURS
  // relu de la ligne courante, seul le contenu (immuable) vient du cache.
  if (enCache && enCache.ligne.releaseHash === ligne.releaseHash) {
    const noyau = releaseDeLigne(ligne as unknown as LigneRelease);
    if (noyau) return { ...enCache, ligne, noyau };
  }
  const c = await chargerRelease(id, ex);
  if (c) cacheReleases.set(id, c);
  return c;
}

/** Dernière version validée de chaque (type, clé) · base de la release proposée par défaut. */
export function selectionParDefaut(lignes: ReadonlyArray<LigneVersionBase>): Map<string, LigneVersionBase> {
  const m = new Map<string, LigneVersionBase>();
  for (const l of lignes) {
    const t = typeDe(l.kind, l.key);
    if (!t || l.status !== 'validated') continue;
    const k = `${t}:${l.key}`;
    const cur = m.get(k);
    if (!cur || l.version > cur.version) m.set(k, l);
  }
  return m;
}

/**
 * Crée une release `staged` · par défaut la dernière version VALIDÉE de chaque
 * clé, chaque choix pouvant être remplacé (`choix` : `type:cle` → version).
 * Refusée si une version n'est pas validée, si une clé requise manque ou si un
 * contrat diverge du code (PROMPT-09). Idempotente sur l'empreinte complète.
 */
export async function creerRelease(a: Acteur, e: { choix?: unknown; motif?: unknown }): Promise<Res<{ id: string; releaseHash: string; existante: boolean }>> {
  if (!autorise(a.octrois, 'prompt.draft', PLATEFORME)) return interdit('prompt.draft');
  const motif = typeof e.motif === 'string' ? e.motif.trim().slice(0, 2000) : '';
  const choix = (typeof e.choix === 'object' && e.choix !== null && !Array.isArray(e.choix) ? e.choix : {}) as Record<string, unknown>;
  return db.transaction(async (tx) => {
    const lignes = await listerVersions(tx);
    const defaut = selectionParDefaut(lignes);
    const retenues = new Map(defaut);
    const constats: Constat[] = [];
    for (const [k, v] of Object.entries(choix)) {
      const [type, cle] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
      const n = typeof v === 'string' ? versionVersEntier(v) : null;
      const l = lignes.find((x) => typeDe(x.kind, x.key) === type && x.key === cle && x.version === n);
      if (!l) { constats.push(constat('VERSION_INCONNUE', k, `Version « ${String(v)} » introuvable.`)); continue; }
      if (l.status !== 'validated') { constats.push(constat('VERSION_NON_VALIDEE', k, `Statut ${l.status} · seule une version validée entre dans une release.`)); continue; }
      retenues.set(k, l);
    }
    const parType = (t: TypeEntree) => [...retenues.entries()].filter(([k]) => k.startsWith(`${t}:`)).map(([, l]) => l).sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
    const versEntree = (l: LigneVersionBase): EntreeRelease => ({ cle: l.key, version: entierVersVersion(l.version), contentHash: l.contentHash });
    const socle = parType('socle').find((l) => l.key === CLE_SOCLE);
    const rendu = parType('rendu').find((l) => l.key === CLE_RENDU);
    if (!socle) constats.push(constat('CLE_REQUISE_ABSENTE', 'socle', 'Aucune version validée des consignes communes.'));
    if (!rendu) constats.push(constat('CLE_REQUISE_ABSENTE', 'rendu', 'Aucune version validée du rendu.'));
    if (constats.length || !socle || !rendu) return refus(constats);
    const ent: Omit<EntreesRelease, 'packHash'> = {
      templates: parType('template').map(versEntree), recettes: parType('recette').map(versEntree),
      socle: versEntree(socle), rendu: versEntree(rendu), conversations: parType('conversation').map(versEntree),
    };
    const choisies = [...retenues.values()];
    const contenu = contenuDeRelease({ ...ent, packHash: '0'.repeat(64) }, indexContenus(choisies));
    if (!contenu) return refusUn('CONTENU_ABSENT', 'release', 'Contenu d’une version illisible.');
    const { packHash, releaseHash } = empreintesRelease(contenu);
    const entreesCompletes: EntreesRelease = { ...ent, packHash };
    // Pré-contrôle de CONTENU par le noyau (validées, empreintes, variables, contrats consommateurs).
    const registre = entrees(lignes);
    const noyau: Release = { id: 'nouvelle', portee: PLATEFORME, statut: 'staged', hash: packHash, templates: ent.templates, recettes: ent.recettes, socle: ent.socle, rendu: ent.rendu };
    const ctl = controlerPublication({ release: noyau, contenu, registre: registreNoyau(registre), consommateurs: chargerSource().consommateurs, environnement: 'test', octrois: a.octrois, pointeur: { portee: PLATEFORME, releaseId: null }, attendue: null })
      .filter((c) => !CODES_HORS_CONTENU.has(c.code));
    ctl.push(...controlerConversations(entreesCompletes, contenu, registre, releaseHash));
    if (ctl.length) return refus(ctl);
    const [existante] = await tx.select({ id: R.id }).from(R).where(and(eq(R.scope, 'platform'), eq(R.releaseHash, releaseHash), inArray(R.status, ['staged', 'active']))).limit(1);
    if (existante) return { ok: true as const, id: existante.id, releaseHash, existante: true };
    const [cree] = await tx.insert(R).values({ scope: 'platform', entries: entreesCompletes, releaseHash, status: 'staged', reason: motif, createdBy: a.userId }).returning({ id: R.id });
    await audit(tx, a, { action: 'prompt.release.creer', targetType: 'prompt_release', targetId: cree!.id, apres: releaseHash, raison: motif, details: { packHash, versions: choisies.map((l) => `${typeDe(l.kind, l.key)}:${l.key}@${entierVersVersion(l.version)}`) } });
    return { ok: true as const, id: cree!.id, releaseHash, existante: false };
  });
}

/* ─────────────────────────────── Évaluation ───────────────────────────── */

export interface TestStructurel { id: string; cible: string; passe: boolean; detail: string }
export interface CasNonExecute { id: string; titre: string; templates: string[]; statut: 'non_execute'; motif: string }

export const MOTIF_BENCHMARK_NON_EXECUTE = 'Non exécuté · budget requis. Aucune dépense n’est autorisée dans ce lot : le benchmark F01–F24 demande une autorisation explicite du propriétaire (09-BENCHMARK, budgetPolicy).';

/** Tests structurels d'une release · données SYNTHÉTIQUES seulement, aucun appel modèle. */
export function testsStructurels(c: ReleaseChargee, registre: ReadonlyArray<EntreeServeur>, a: Acteur): TestStructurel[] {
  const s = chargerSource();
  const tests: TestStructurel[] = [];
  const contenuCtl = controlerPublication({ release: { ...c.noyau, statut: 'staged' }, contenu: c.contenu, registre: registreNoyau(registre), consommateurs: s.consommateurs, environnement: 'test', octrois: a.octrois, pointeur: { portee: PLATEFORME, releaseId: null }, attendue: null })
    .filter((x) => !CODES_HORS_CONTENU.has(x.code));
  contenuCtl.push(...controlerConversations(c.entrees, c.contenu, registre, c.ligne.releaseHash));
  tests.push({ id: 'contenu', cible: 'release', passe: contenuCtl.length === 0, detail: contenuCtl.length ? contenuCtl.map((x) => `${x.code} ${x.cible}`).join(' ; ') : 'Versions validées, empreintes reproduites, variables résolues, contrats consommateurs identiques.' });
  tests.push({ id: 'politique-serveur', cible: POLITIQUE_SERVEUR.id, passe: POLITIQUE_SERVEUR.texte.trim().length > 0, detail: `Politique fixe ${POLITIQUE_SERVEUR.version} présente.` });
  for (const t of c.contenu.templates) {
    const ex = s.exemples.find((x) => x.templateKey === t.key);
    if (!ex) { tests.push({ id: `exemples:${t.key}`, cible: t.key, passe: false, detail: 'Aucun exemple de contrat pour cette clé.' }); continue; }
    const v = s.validateur;
    const verdicts: Array<[string, boolean]> = [
      ['entrée valide acceptée', v.validerEntree(t.key, ex.inputExample).ok],
      ['sortie ready acceptée', v.validerSortie(t.key, ex.readyOutputShapeExample).ok],
      ['sortie blocked acceptée', v.validerSortie(t.key, ex.blockedOutputExample).ok],
      ['sortie invalide rejetée', ex.invalidOutputExample === undefined || !v.validerSortie(t.key, ex.invalidOutputExample).ok],
      ['entrée invalide rejetée', ex.invalidInputExample === undefined || !v.validerEntree(t.key, ex.invalidInputExample).ok],
    ];
    const ko = verdicts.filter(([, ok]) => !ok).map(([n]) => n);
    tests.push({ id: `exemples:${t.key}`, cible: t.key, passe: ko.length === 0, detail: ko.length ? `Échec · ${ko.join(', ')}` : 'Contrats d’entrée et de sortie conformes aux exemples synthétiques.' });
  }
  for (const p of c.contenu.conversations) {
    let detail = 'Assemblage rendu sur données synthétiques, aucune variable restante.';
    let passe = true;
    try {
      for (const n of [0, 3, 25, 120]) for (const niveau of ['debut', 'intermediaire', 'avance'] as const) {
        const txt = assemblerConsigneJarvis(p, { brandName: 'Marque synthétique', identity: 'Produit synthétique', memory: n ? 'mémoire synthétique' : '', rules: 'Règle synthétique', measuredAds: n, canAdsmap: true, canPropose: true, niveau, blocActions: 'ACTIONS' });
        if (/\{\{|\}\}/.test(txt)) { passe = false; detail = 'Variable non résolue dans la consigne assemblée.'; }
      }
    } catch (err) {
      passe = false; detail = (err as Error).message;
    }
    tests.push({ id: `conversation:${p.key}`, cible: p.key, passe, detail });
  }
  return tests;
}

export function casBenchmark(c: ReleaseChargee): CasNonExecute[] {
  const cles = new Set(c.contenu.templates.map((t) => t.key));
  return chargerSource().benchmark
    .filter((b) => b.templates.some((k) => cles.has(k)))
    .map((b) => ({ id: b.id, titre: b.title, templates: b.templates, statut: 'non_execute' as const, motif: MOTIF_BENCHMARK_NON_EXECUTE }));
}

/**
 * Commande d'évaluation (cahier §8.2) · release `staged` EXACTE, sous
 * `prompt.evaluate`, données synthétiques, budget d'évaluation séparé (ici 0 $ :
 * aucun appel modèle). N'écrit que `evaluation` et une ligne d'évaluation ; le
 * pointeur n'est pas touché.
 */
export async function evaluerRelease(a: Acteur, e: { releaseId: unknown }): Promise<Res<{ evaluationId: string; testsStructurels: boolean; tests: TestStructurel[]; benchmark: CasNonExecute[] }>> {
  if (!estUuid(e.releaseId)) return refusUn('NOT_FOUND', '', 'Release introuvable.');
  return db.transaction(async (tx) => {
    // Verrou de ligne AVANT la lecture (recette du 8 octobre, P2) : une révocation
    // concurrente (`revoquerRelease` prend le même verrou) est soit déjà commitée
    // et lue ici, soit attend la fin de cette évaluation.
    await tx.select({ id: R.id }).from(R).where(eq(R.id, e.releaseId as string)).for('update');
    const c = await chargerRelease(e.releaseId as string, tx);
    if (!c) return refusUn('NOT_FOUND', '', 'Release introuvable.');
    const ok = resoudreReleaseEvaluation({ release: c.noyau, octrois: a.octrois, donneesSynthetiques: true });
    if (!ok.ok) return ok;
    const registre = entrees(await listerVersions(tx));
    const tests = testsStructurels(c, registre, a);
    const benchmark = casBenchmark(c);
    const passe = tests.every((t) => t.passe);
    const [ev] = await tx.insert(schema.studioPromptEvaluations).values({
      releaseId: c.ligne.id, kind: 'structural', passed: passe, evaluatorId: a.userId,
      result: { releaseHash: c.ligne.releaseHash, packHash: c.entrees.packHash, donnees: 'synthetiques', budget: 'evaluation', depenseUsd: 0, tests, benchmark },
    }).returning({ id: schema.studioPromptEvaluations.id });
    // Une révocation n'est jamais effacée par une évaluation · lue sous le verrou
    // de ligne pris en tête de transaction, donc à jour.
    const rev = (c.ligne.evaluation as { revocation?: unknown } | null)?.revocation;
    const evaluation = { releaseHash: c.ligne.releaseHash, testsStructurels: passe, benchmarkApprouve: false, evaluationId: ev!.id, evalueeLe: new Date().toISOString(), ...(rev ? { revocation: rev } : {}) };
    const maj = await tx.update(R).set({ evaluation, updatedAt: new Date() }).where(and(eq(R.id, c.ligne.id), eq(R.status, 'staged'))).returning({ id: R.id });
    if (maj.length !== 1) return refusUn('VERSION_CONFLICT', c.ligne.id, 'La release a changé pendant l’évaluation.');
    await audit(tx, a, { action: 'prompt.release.evaluer', targetType: 'prompt_release', targetId: c.ligne.id, apres: passe ? 'tests_structurels_reussis' : 'tests_structurels_echoues', details: { evaluationId: ev!.id, releaseHash: c.ligne.releaseHash, benchmark: 'non_execute' } });
    return { ok: true as const, evaluationId: ev!.id, testsStructurels: passe, tests, benchmark };
  });
}

/* ─────────────────────────────── Pointeur ─────────────────────────────── */

function pointeurNoyau(l: LignePointeur | null): Pointeur {
  return { portee: PLATEFORME, releaseId: l?.releaseId ?? null };
}

async function deplacerPointeur(tx: Tx, a: Acteur, courant: LignePointeur | null, attendue: string | null, vers: string): Promise<boolean> {
  if (!courant) {
    if (attendue !== null) return false;
    const r = await tx.insert(P).values({ scope: 'platform', releaseId: vers, previousReleaseId: null, rowVersion: 0, activatedBy: a.userId })
      .onConflictDoNothing().returning({ id: P.id });
    return r.length === 1;
  }
  const r = await tx.update(P).set({ releaseId: vers, previousReleaseId: courant.releaseId, rowVersion: courant.rowVersion + 1, activatedBy: a.userId, activatedAt: new Date() })
    .where(and(eq(P.id, courant.id), eq(P.rowVersion, courant.rowVersion), eq(P.releaseId, attendue ?? '00000000-0000-0000-0000-000000000000')))
    .returning({ id: P.id });
  return r.length === 1;
}

const lireAttendue = (x: unknown): string | null | undefined => (x === null ? null : estUuid(x) ? x : undefined);

/**
 * Publie une release `staged` : contrôles du noyau (validées, empreintes,
 * contrats, tests structurels, benchmark en production) + politiques de
 * conversation, puis compare-and-set du pointeur et `staged → active`.
 */
export async function publierRelease(a: Acteur, e: { releaseId: unknown; attendue: unknown; environnement: EnvironnementPrompts }): Promise<Res<{ releaseId: string; avant: string | null }>> {
  if (!estUuid(e.releaseId)) return refusUn('NOT_FOUND', '', 'Release introuvable.');
  const attendue = lireAttendue(e.attendue);
  if (attendue === undefined) return refusUn('VERSION_CONFLICT', 'attendue', 'Release active attendue illisible · recharge la page.');
  return db.transaction(async (tx) => {
    const courant = await lirePointeur(tx, true);
    const c = await chargerRelease(e.releaseId as string, tx);
    if (!c) return refusUn('NOT_FOUND', '', 'Release introuvable.');
    const registre = entrees(await listerVersions(tx));
    const r = publierNoyau({ release: c.noyau, contenu: c.contenu, registre: registreNoyau(registre), consommateurs: chargerSource().consommateurs, environnement: e.environnement, octrois: a.octrois, pointeur: pointeurNoyau(courant), attendue });
    const ext = controlerConversations(c.entrees, c.contenu, registre, c.ligne.releaseHash);
    if (!r.ok || ext.length) return refus([...(r.ok ? [] : r.constats), ...ext]);
    if (!(await deplacerPointeur(tx, a, courant, attendue, c.ligne.id))) return refusUn('VERSION_CONFLICT', c.ligne.id, 'La release active a changé depuis l’ouverture · recharger avant de publier.');
    const maj = await tx.update(R).set({ status: 'active', updatedAt: new Date() }).where(and(eq(R.id, c.ligne.id), eq(R.status, 'staged'))).returning({ id: R.id });
    if (maj.length !== 1) throw new Error('Release publiée en parallèle');
    await audit(tx, a, { action: 'prompt.release.publier', targetType: 'prompt_pointer', targetId: 'platform', avant: courant?.releaseId ?? null, apres: c.ligne.id, details: { releaseHash: c.ligne.releaseHash, environnement: e.environnement } });
    return { ok: true as const, releaseId: c.ligne.id, avant: courant?.releaseId ?? null };
  });
}

/** Rollback : le pointeur revient sur une release déjà publiée · rien d'autre ne bouge. */
export async function rollbackRelease(a: Acteur, e: { releaseId: unknown; attendue: unknown; environnement: EnvironnementPrompts }): Promise<Res<{ releaseId: string; avant: string | null }>> {
  if (!estUuid(e.releaseId)) return refusUn('NOT_FOUND', '', 'Release introuvable.');
  const attendue = lireAttendue(e.attendue);
  if (attendue === undefined) return refusUn('VERSION_CONFLICT', 'attendue', 'Release active attendue illisible · recharge la page.');
  return db.transaction(async (tx) => {
    const courant = await lirePointeur(tx, true);
    const c = await chargerRelease(e.releaseId as string, tx);
    if (!c) return refusUn('NOT_FOUND', '', 'Release introuvable.');
    const r = rollbackNoyau({ cible: c.noyau, pointeur: pointeurNoyau(courant), attendue, octrois: a.octrois, environnement: e.environnement });
    if (!r.ok) return r;
    if (!(await deplacerPointeur(tx, a, courant, attendue, c.ligne.id))) return refusUn('VERSION_CONFLICT', c.ligne.id, 'La release active a changé depuis l’ouverture.');
    await audit(tx, a, { action: 'prompt.release.rollback', targetType: 'prompt_pointer', targetId: 'platform', avant: courant?.releaseId ?? null, apres: c.ligne.id, details: { releaseHash: c.ligne.releaseHash, environnement: e.environnement } });
    return { ok: true as const, releaseId: c.ligne.id, avant: courant?.releaseId ?? null };
  });
}

/** Retire une release · jamais celle que le pointeur désigne. */
export async function retirerRelease(a: Acteur, e: { releaseId: unknown; motif?: unknown }): Promise<Res<{ releaseId: string }>> {
  if (!estUuid(e.releaseId)) return refusUn('NOT_FOUND', '', 'Release introuvable.');
  return db.transaction(async (tx) => {
    const courant = await lirePointeur(tx, true);
    const c = await chargerRelease(e.releaseId as string, tx);
    if (!c) return refusUn('NOT_FOUND', '', 'Release introuvable.');
    const r = retirerNoyau({ release: c.noyau, pointeur: pointeurNoyau(courant), octrois: a.octrois });
    if (!r.ok) return r;
    await tx.update(R).set({ status: 'retired', updatedAt: new Date() }).where(eq(R.id, c.ligne.id));
    await audit(tx, a, { action: 'prompt.release.retirer', targetType: 'prompt_release', targetId: c.ligne.id, avant: c.ligne.status, apres: 'retired', raison: typeof e.motif === 'string' ? e.motif : '' });
    return { ok: true as const, releaseId: c.ligne.id };
  });
}

/**
 * Révoque une release · erreur grave découverte après publication. Rien n'est
 * effacé : la révocation est écrite dans `evaluation.revocation` (colonne
 * mobile), et TOUS les chemins la voient au chargement suivant (`releaseDeLigne`) :
 * plus de publication ni de rollback vers elle, plus de nouveau devis épinglé,
 * plus d'exécution d'un job épinglé, plus de tâche studio servie par elle, et
 * Jarvis retombe sur sa consigne 1.0.0 tant qu'elle est pointée. Motif obligatoire.
 */
export async function revoquerRelease(a: Acteur, e: { releaseId: unknown; motif: unknown }): Promise<Res<{ releaseId: string; deja: boolean }>> {
  if (!autorise(a.octrois, 'prompt.rollback', PLATEFORME)) return interdit('prompt.rollback');
  if (!estUuid(e.releaseId)) return refusUn('NOT_FOUND', '', 'Release introuvable.');
  const motif = typeof e.motif === 'string' ? e.motif.trim().slice(0, 500) : '';
  if (!motif) return refusUn('INVALID_SCHEMA', 'motif', 'Indique pourquoi la release est révoquée.');
  return db.transaction(async (tx) => {
    const [l] = await tx.select().from(R).where(eq(R.id, e.releaseId as string)).for('update');
    if (!l) return refusUn('NOT_FOUND', '', 'Release introuvable.');
    if (lireRevocation(l.evaluation)) return { ok: true as const, releaseId: l.id, deja: true };
    const evaluation = { ...((l.evaluation as Record<string, unknown> | null) ?? {}), revocation: { motif, par: a.userId, le: new Date().toISOString() } };
    await tx.update(R).set({ evaluation, updatedAt: new Date() }).where(eq(R.id, l.id));
    await audit(tx, a, { action: 'prompt.release.revoquer', targetType: 'prompt_release', targetId: l.id, avant: l.status, apres: l.status, raison: motif, details: { releaseHash: l.releaseHash } });
    return { ok: true as const, releaseId: l.id, deja: false };
  });
}

/* ─────────────────────────────── Résolution ───────────────────────────── */

/** La release que le pointeur global désigne MAINTENANT, chargée · `null` si aucune. */
export async function releaseActive(ex: Ex = db): Promise<ReleaseChargee | null> {
  const p = await lirePointeur(ex);
  if (!p) return null;
  return releaseChargee(p.releaseId, ex);
}

export type { ReleaseChargee };
export { typeDe, entierVersVersion };
