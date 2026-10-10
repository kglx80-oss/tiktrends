import 'server-only';
import { db } from '@tiktrends/db';
import {
  construireConsignePersistee, empreinteEntreesCompilation, changementsConsigne, erreurStudio,
  ACTION_CONSIGNE_COMPILEE, CHEMINS_CONSIGNE,
  type ConsigneImagePersistee, type ContenuVersion, type ErreurStudio, type PreparationCompilation,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { ajouterAudit } from '../audit';
import { enregistrerVersion, estUuid, lireProjet, lireVersion, type VersionStudio } from '../depot';
import { compilerConsigneImagePour, type DependancesCompilation } from '../produit/compilation';
import { consigneDuRun, formatImageDuContenu } from './verification';

/**
 * Studios · F-B · la consigne image compilée, conservée CÔTÉ SERVEUR.
 *
 *  1. `compilerEtAttesterPour` · compile (`image.compile`, contrôle avant et
 *     après, consigne FINALE · L5-C), puis ATTESTE le résultat validé dans le
 *     journal d'audit (ajout seul) : `image.consigne.compilee`, cible le
 *     projet, détails = la consigne persistable, son `runId` et son empreinte.
 *  2. `retenirConsignePour` · relit l'attestation par son `runId` (le
 *     navigateur ne fournit que cet identifiant, jamais une consigne) et
 *     l'écrit dans une nouvelle version (`enregistrerVersion`, 409 respecté).
 *  3. `verifierConsigne` · ce que le devis et l'approbation exigent : une
 *     consigne présente, ATTESTÉE pour ce projet (empreinte), compilée sur le
 *     brief et le produit courants, et des références encore là, identiques,
 *     transmissibles. Règle pure : `verdictConsigne` (noyau).
 *
 * Pourquoi pas `studio_prompt_runs` : la trace ne garde que l'empreinte de la
 * sortie du modèle (par construction), et la consigne finale porte en plus
 * les interdits du serveur · on ne peut ni la relire ni la reconstruire.
 */

export type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

/* ───────────────────────────── Compiler ─────────────────────────────────── */

export type ResultatCompilationImage =
  | { ok: true; statut: 'compilee'; consigne: ConsigneImagePersistee; empreinte: string; runId: string; projectVersionId: string; preparation: PreparationCompilation }
  | { ok: true; statut: 'questions'; questions: string[]; runId: string | null; projectVersionId: string; preparation: PreparationCompilation }
  | ErreurStudio;

/**
 * Compile la consigne (L5-C : contrôle avant, `executerTache`, contrôle après,
 * consigne finale), puis l'ATTESTE · rien n'est écrit dans le projet ici.
 */
export async function compilerEtAttesterPour(ctx: ContexteStudio, e: { projectId: unknown; mode: unknown }, o: DependancesCompilation): Promise<ResultatCompilationImage> {
  if (!estUuid(e.projectId)) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const p = await lireProjet(ctx, e.projectId);
  if (!p.ok) return p;
  if (!p.projet.currentVersionId) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const avant = await lireVersion(ctx, p.projet.currentVersionId);
  if (!avant.ok) return avant;
  const format = formatImageDuContenu(avant.version.content as ContenuVersion);

  const r = await compilerConsigneImagePour(ctx, { projectId: e.projectId, mode: e.mode, largeur: format.largeur, hauteur: format.hauteur }, o);
  if (!r.ok || r.statut === 'questions') return r;

  // La version compilée (la courante au moment de la compilation) · relue, jamais reçue.
  const v = r.projectVersionId === avant.version.id ? avant : await lireVersion(ctx, r.projectVersionId);
  if (!v.ok) return v;
  const c = construireConsignePersistee({
    runId: r.runId, mode: e.mode as ConsigneImagePersistee['mode'], sourceVersionId: v.version.id,
    contenu: v.version.content as ContenuVersion, consigne: r.consigne, referencesTransmises: r.preparation.references,
    largeur: format.largeur, hauteur: format.hauteur, compileeLe: o.maintenant,
  });
  if (!c.ok) {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: c.violations.map((raison) => ({ chemin: 'consigne', raison })), message: 'La consigne compilée n’est pas exécutable telle quelle · rien n’a été retenu.' });
  }
  try {
    await ajouterAudit(db, ctx, {
      action: ACTION_CONSIGNE_COMPILEE, brandId: p.projet.brandId, targetType: 'studio_project', targetId: p.projet.id,
      versionBefore: v.version.id, versionAfter: null, reason: 'Consigne image compilée et validée par le serveur',
      details: { runId: r.runId, empreinte: c.empreinte, consigne: c.consigne },
    });
  } catch (err) {
    console.error(`[studios:fb] ${ctx.traceId} attestation`, err instanceof Error ? err.message : err);
    return erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId, message: 'La consigne a été compilée mais n’a pas pu être conservée · recompile-la (un nouvel appel texte).' });
  }
  return { ok: true, statut: 'compilee', consigne: c.consigne, empreinte: c.empreinte, runId: r.runId, projectVersionId: v.version.id, preparation: r.preparation };
}

/* ───────────────────────────── Retenir ──────────────────────────────────── */

/**
 * Range la consigne ATTESTÉE d'une compilation dans une nouvelle version ·
 * `styleRef.consigneImage` + plan `s_image`. Base obligatoire, 409 si le
 * projet a bougé. Aucun appel, aucun coût.
 */
export async function retenirConsignePour(ctx: ContexteStudio, e: { projectId: unknown; baseVersionId: unknown; runId: unknown }): Promise<Resultat<{ version: VersionStudio; inchange: boolean; consigne: ConsigneImagePersistee }>> {
  if (!estUuid(e.projectId)) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const p = await lireProjet(ctx, e.projectId);
  if (!p.ok) return p;
  const projet = p.projet;
  if (typeof e.runId !== 'string' || !estUuid(e.runId)) {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'runId', raison: 'identifiant de compilation attendu' }] });
  }
  const a = await consigneDuRun(db, { workspaceId: projet.workspaceId, brandId: projet.brandId, projectId: projet.id }, e.runId);
  if (!a) return erreurStudio('MISSING_REFERENCE', { traceId: ctx.traceId, message: 'Aucune consigne compilée par le serveur ne porte cet identifiant pour ce projet · compile-la d’abord.' });
  if (!estUuid(e.baseVersionId)) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'baseVersionId', raison: 'version de base obligatoire' }] });
  const base = await lireVersion(ctx, e.baseVersionId);
  if (!base.ok || base.version.projectId !== projet.id) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'baseVersionId', raison: 'version inconnue pour ce projet' }] });
  const contenu = base.version.content as ContenuVersion;
  if (empreinteEntreesCompilation(contenu) !== a.consigne.entrees) {
    return erreurStudio('VERSION_CONFLICT', { traceId: ctx.traceId, targetIds: [projet.id], message: 'Le brief ou le produit épinglé a changé depuis cette compilation · recompile la consigne, rien n’a été retenu.' });
  }
  const raison = `Consigne image retenue · compilation ${a.consigne.runId.slice(0, 8)}`;
  const w = await enregistrerVersion(ctx, { projectId: projet.id, baseVersionId: base.version.id, changes: changementsConsigne(contenu, a.consigne, raison), allowedPaths: CHEMINS_CONSIGNE, raison });
  if (!w.ok) return w;
  return { ...w, consigne: a.consigne };
}
