import 'server-only';
import { etatConnaissance } from '@tiktrends/core';
import { PROFILS_MODELE } from '../../../../lib/studios/prompts/noyau';
import * as depot from '../../../../lib/studios/prompts/depot-prompts';
import { listerRuns, lireRun } from '../../../../lib/studios/prompts/resolveur';
import { chargerSource } from '../../../../lib/studios/prompts/source';
import { champsAffiches, variablesDe, diffVersions } from '../../../../lib/studios/prompts/vue';
import { LIBELLE_TYPE, entierVersVersion, lireEntrees, lireEvaluation, typeDe, type TypeEntree } from '../../../../lib/studios/prompts/correspondance';
import { expurgerRun, type LigneRun } from '../../../../lib/studios/prompts/traces';
import { PROFILS_ROUTES_ANTHROPIC, modeleTexte } from '../../../../lib/studios/prompts/adaptateur';
import { listerConnaissances } from '../../../../lib/jarvis-connaissances';
import type { VueCle, VueDetail, VueRelease, VueEvaluation, VueRun, VueVersion } from './Ecrans';

/**
 * Lectures des écrans « IA et Studios » · rows → vues SÉRIALISABLES.
 * Appelées par la page APRÈS la garde plateforme ; aucune n'écrit.
 */

const date = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '');

function empreintesSource(): Set<string> {
  const s = chargerSource();
  return new Set([...Object.values(s.empreintes.templates), ...Object.values(s.empreintes.recettes), s.empreintes.commonSystemHash, s.empreintes.rendering, ...s.complement.map((c) => c.contentHash)]);
}

export async function vueVersions(types: readonly TypeEntree[], cleChoisie: string | null, versionChoisie: string | null, comparer: string | null): Promise<{ cles: VueCle[]; detail: VueDetail | null; plan: { aCreer: number; deja: number } | null }> {
  const lignes = await depot.listerVersions();
  const source = empreintesSource();
  const parCle = new Map<string, VueCle>();
  const lignesParId = new Map(lignes.map((l) => [l.id, l]));
  for (const l of lignes) {
    const type = typeDe(l.kind, l.key);
    if (!type || !types.includes(type)) continue;
    const k = `${type}:${l.key}`;
    const c = (l.content ?? {}) as Record<string, unknown>;
    if (!parCle.has(k)) parCle.set(k, { type, libelleType: LIBELLE_TYPE[type], cle: l.key, titre: String(c.title ?? LIBELLE_TYPE[type]), versions: [] });
    const v: VueVersion = { id: l.id, version: entierVersVersion(l.version), statut: l.status, empreinte: l.contentHash, origine: l.origin, motif: l.reason, creeLe: date(l.createdAt), valideeLe: l.validatedAt ? date(l.validatedAt) : null, horsSource: !source.has(l.contentHash) };
    parCle.get(k)!.versions.push(v);
  }
  const cles = [...parCle.values()].sort((a, b) => a.type.localeCompare(b.type) || a.cle.localeCompare(b.cle));
  const plan = await depot.planImportPack();
  let detail: VueDetail | null = null;
  const choisie = cleChoisie ? parCle.get(cleChoisie) : undefined;
  if (choisie) {
    const v = choisie.versions.find((x) => x.id === versionChoisie) ?? choisie.versions[0]!;
    const ligne = lignesParId.get(v.id)!;
    const type = choisie.type as TypeEntree;
    const contenu = ligne.content as Record<string, unknown>;
    const s = chargerSource();
    const exemple = type === 'template' ? s.exemples.find((x) => x.templateKey === ligne.key) : undefined;
    const editables = depot.CHAMPS_EDITABLES[type].map((champ) => {
      const brut = champ.startsWith('sections.') ? (contenu.sections as Record<string, unknown> | undefined)?.[champ.slice(9)] : contenu[champ];
      const liste = Array.isArray(brut);
      const libelle = champsAffiches(type, contenu).find((c) => c.champ === champ)?.libelle ?? champ;
      return { champ, libelle, valeur: liste ? (brut as string[]).join('\n') : String(brut ?? ''), ...(liste ? { liste: true } : {}) };
    });
    const autre = comparer ? choisie.versions.find((x) => x.id === comparer) : undefined;
    detail = {
      cle: choisie, version: v, champs: champsAffiches(type, contenu), variables: variablesDe(contenu),
      schemas: type === 'template' ? { entree: String(contenu.inputSchemaRef ?? '').split('/').pop() ?? '', sortie: String(contenu.outputSchemaRef ?? '').split('/').pop() ?? '', profil: String(contenu.modelProfile ?? '') } : null,
      exemples: exemple ? JSON.stringify({ entree: exemple.inputExample, sortieReady: exemple.readyOutputShapeExample, sortieBlocked: exemple.blockedOutputExample }, null, 2) : null,
      editables,
      diff: autre ? { avec: autre, champs: diffVersions(type, lignesParId.get(autre.id)!.content, contenu).map((d) => ({ libelle: d.libelle, lignes: d.lignes })) } : null,
    };
  }
  return { cles, detail, plan: plan.ok ? { aCreer: plan.aCreer.length, deja: plan.dejaPresentes.length } : null };
}

export async function vueReleases(): Promise<{ releases: VueRelease[]; pointee: string | null; selection: Array<{ cle: string; version: string }> }> {
  const [lignes, pointeur, versions] = await Promise.all([depot.listerReleases(), depot.lirePointeur(), depot.listerVersions()]);
  const pointee = pointeur?.releaseId ?? null;
  const releases: VueRelease[] = lignes.map((l) => {
    const e = lireEntrees(l.entries);
    const ev = lireEvaluation(l.evaluation);
    const valide = ev && ev.releaseHash === l.releaseHash ? ev : null;
    const conv = e?.conversations.find((c) => c.cle === 'jarvis.conversation');
    return {
      id: l.id, statut: l.status, empreinte: l.releaseHash, packHash: e?.packHash ?? '', creeLe: date(l.createdAt), motif: l.reason, pointee: l.id === pointee,
      tests: valide ? valide.testsStructurels : null, benchmark: !!valide?.benchmarkApprouve,
      versions: e ? e.templates.length + e.recettes.length + e.conversations.length + 2 : 0, conversation: conv ? conv.version : null,
    };
  });
  const selection = [...depot.selectionParDefaut(versions).entries()].map(([cle, l]) => ({ cle, version: entierVersVersion(l.version) })).sort((a, b) => a.cle.localeCompare(b.cle));
  return { releases, pointee, selection };
}

export async function vueEvaluations(): Promise<VueEvaluation[]> {
  const [evs, releases, versions] = await Promise.all([depot.listerEvaluations(), depot.listerReleases(), depot.listerVersions()]);
  const r = new Map(releases.map((x) => [x.id, x]));
  const v = new Map(versions.map((x) => [x.id, x]));
  return evs.map((e) => {
    const res = (e.result ?? {}) as { tests?: Array<{ id: string; passe: boolean; detail: string }>; benchmark?: Array<{ id: string; titre: string; motif: string }> };
    const cible = e.releaseId ? `release ${r.get(e.releaseId)?.releaseHash.slice(0, 12) ?? e.releaseId.slice(0, 8)}…` : e.promptVersionId ? `version ${v.get(e.promptVersionId)?.key ?? ''}@${v.get(e.promptVersionId) ? entierVersVersion(v.get(e.promptVersionId)!.version) : ''}` : '·';
    return { id: e.id, cible, type: e.kind === 'structural' ? 'Structurelle' : e.kind === 'benchmark' ? 'Benchmark' : 'Manuelle', passe: e.passed, creeLe: date(e.createdAt), tests: res.tests ?? [], benchmark: res.benchmark ?? [] };
  });
}

export function vueRoutage(): Array<{ profil: string; fournisseur: string; statut: string; note: string }> {
  const cle = !!process.env.ANTHROPIC_API_KEY;
  return PROFILS_MODELE.map((p) => PROFILS_ROUTES_ANTHROPIC.includes(p)
    ? { profil: p, fournisseur: `Anthropic · ${modeleTexte()} · via la barrière de dépense`, statut: cle ? 'configuré' : 'absent', note: cle ? 'Servi par le résolveur (texte structuré, sans outil).' : 'Fournisseur non configuré · les tâches de ce profil sont refusées, sans repli.' }
    : { profil: p, fournisseur: 'Non branché dans ce lot', statut: 'non branché', note: 'Une tâche de ce profil est bloquée avant appel (UNSUPPORTED_CAPABILITY).' });
}

function versRun(l: LigneRun): VueRun {
  const x = expurgerRun(l);
  const cfg = x.config as Record<string, any>;
  const budget = cfg.budget ? `${cfg.budget.jetonsUtilises}/${cfg.budget.budgetJetons} jetons${cfg.budget.troncature ? ' · troncature signalée' : ''}` : null;
  return {
    id: x.id, quand: date(x.quand), templateKey: x.templateKey, statut: x.statut, modele: x.modele, releaseId: x.releaseId, releaseHash: String(cfg.releaseHash ?? ''),
    version: cfg.conversation ? `${cfg.conversation.cle}@${cfg.conversation.version}` : `${x.templateKey}@${cfg.templateVersion ?? '?'}`,
    compiledHash: x.compiledHash, contextSnapshotHash: x.contextSnapshotHash, outputHash: x.outputHash, latenceMs: x.latenceMs, coutUsd: x.coutUsd,
    sources: x.sources.map((s) => ({ type: s.type, titre: s.titre, version: s.version })),
    couches: Array.isArray(cfg.couches) ? cfg.couches.map((c: { couche: string; empreinte: string }) => ({ couche: c.couche, empreinte: c.empreinte })) : [],
    constats: Array.isArray(cfg.constats) ? cfg.constats.map((c: { code: string }) => c.code) : [],
    espace: x.espace, marque: x.marque, traceId: x.traceId, budget,
  };
}

export async function vueExecutions(runId: string | null): Promise<{ runs: VueRun[]; detail: VueRun | null }> {
  const lignes = await listerRuns(60);
  const runs = lignes.map((l) => versRun(l as unknown as LigneRun));
  let detail = runId ? runs.find((r) => r.id === runId) ?? null : null;
  if (runId && !detail && depot.estUuid(runId)) {
    const l = await lireRun(runId);
    detail = l ? versRun(l as unknown as LigneRun) : null;
  }
  return { runs, detail };
}

export async function vueConnaissances(): Promise<{ publiees: number; retirees: number; brouillons: number }> {
  const liste = await listerConnaissances();
  let publiees = 0, retirees = 0, brouillons = 0;
  for (const c of liste) {
    const e = etatConnaissance(c);
    if (e.etat === 'publie') publiees++; else if (e.etat === 'retire') retirees++; else brouillons++;
  }
  return { publiees, retirees, brouillons };
}
