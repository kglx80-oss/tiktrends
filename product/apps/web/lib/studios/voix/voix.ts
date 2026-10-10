import 'server-only';
import { createHash } from 'node:crypto';
import {
  capacitesVoix, modesParole, refusMode, changementsModeParole, plansLipsyncIndisponible, narrationValidee, garderTexteVoix,
  mesurerDureeAudio, recalculerTemps, erreurStudio, aPermissionEspace,
  type ContenuVersion, type ErreurStudio, type CapacitesVoix, type ModeParoleOffert, type TempsVoix, type SortieVoix, type ViolationVoix,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { enregistrerVersion, estUuid, lireAsset, lireProjet, lireVersion, type ProjetStudio, type VersionStudio } from '../depot';
import { lecteurMedias, type LecteurMedias } from '../rendu/medias';
import { executerTache } from '../prompts/resolveur';
import type { AdaptateurModele } from '../prompts/adaptateur';
import type { EnvironnementPrompts } from '../prompts/environnement';

/**
 * Voix d'un projet vidéo (cahier 01 §4.5 · recettes VIDEO-06, VIDEO-07).
 *
 *  · La CAPACITÉ est dite telle : aucun tarif voix, aucun fournisseur de
 *    synthèse ni de lipsync ⇒ indisponibles (`capacitesVoix`, noyau). Rien
 *    ici n'appelle un fournisseur audio ; rien ne prétend en avoir appelé un.
 *  · Les MODES : voix off proposée, lipsync refusé par le serveur tant que la
 *    capacité n'existe pas (le client ne peut pas forcer le mode), sans voix.
 *  · La DURÉE d'une prise existante (`plan.voiceAssetId`, média studio de la
 *    MARQUE du projet, octets relus et empreinte vérifiée) est lue dans son
 *    en-tête WAV/MP3, puis les temps sont recalculés et le dépassement dit.
 *  · Le TEXTE prononcé (`preparerTexteVoixPour`) : la narration validée du
 *    plan de la version COURANTE, passée à `voice.prepare` par le registre,
 *    puis une seconde garde (préambule, réécriture, direction mêlée). Le
 *    contrat est prêt ; aucun bouton ne le déclenche tant qu'aucune synthèse
 *    n'existe (payer un appel texte pour une voix impossible n'a pas de sens).
 */

export type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

export type EtatPrise =
  | { etat: 'absente' }
  | { etat: 'mesuree'; assetId: string; format: 'wav' | 'mp3'; dureeMs: number; methode: string; tronque: boolean }
  | { etat: 'illisible'; assetId: string; motif: string };

export interface VueVoix {
  capacites: CapacitesVoix;
  modes: ModeParoleOffert[];
  /** Plans en lipsync alors qu'il n'existe pas · à basculer explicitement. */
  plansLipsync: string[];
  prises: Record<string, EtatPrise>;
  temps: TempsVoix;
}

/** Durée d'une prise liée au plan · lue dans la portée et la marque du projet, jamais une valeur déclarée. */
async function mesurerPrise(ctx: ContexteStudio, projet: ProjetStudio, assetId: string, lecteur: LecteurMedias): Promise<EtatPrise> {
  const a = await lireAsset(ctx, assetId);
  if (!a.ok || a.asset.brandId !== projet.brandId) return { etat: 'illisible', assetId, motif: 'prise introuvable pour la marque du projet' };
  if (a.asset.storageState !== 'stored') return { etat: 'illisible', assetId, motif: 'prise non stockée' };
  const octets = await lecteur.lire(a.asset);
  if (!octets) return { etat: 'illisible', assetId, motif: 'prise illisible dans le stockage' };
  if (octets.length !== a.asset.bytes || createHash('sha256').update(octets).digest('hex') !== a.asset.sha256) return { etat: 'illisible', assetId, motif: 'prise altérée · empreinte différente de celle enregistrée' };
  const d = mesurerDureeAudio(octets);
  if (!d.ok) return { etat: 'illisible', assetId, motif: d.motif };
  return { etat: 'mesuree', assetId, format: d.format, dureeMs: d.dureeMs, methode: d.methode, tronque: d.tronque };
}

export async function lireVueVoix(ctx: ContexteStudio, projet: ProjetStudio, contenu: ContenuVersion, lecteur: LecteurMedias = lecteurMedias()): Promise<VueVoix> {
  const capacites = capacitesVoix();
  const prises: Record<string, EtatPrise> = {};
  for (const sid of contenu.shots.order) {
    const p = contenu.shots.byId[sid];
    if (!p) continue;
    const id = p.voiceAssetId;
    prises[sid] = typeof id === 'string' && estUuid(id) ? await mesurerPrise(ctx, projet, id, lecteur) : { etat: 'absente' };
  }
  const mesures: Record<string, number | null> = {};
  for (const [sid, e] of Object.entries(prises)) mesures[sid] = e.etat === 'mesuree' ? e.dureeMs : null;
  return { capacites, modes: modesParole(capacites), plansLipsync: plansLipsyncIndisponible(contenu, capacites), prises, temps: recalculerTemps(contenu, mesures) };
}

/** Pose un mode de parole sur des plans · nouvelle version (409), lipsync refusé sans capacité. */
export async function choisirModeParolePour(ctx: ContexteStudio, e: { projectId: unknown; baseVersionId: unknown; shotIds: unknown; mode: unknown }): Promise<Resultat<{ version: VersionStudio; inchange: boolean }>> {
  if (!aPermissionEspace(ctx.permissions, 'studio.propose')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  const refus = refusMode(e.mode, capacitesVoix());
  if (refus) return erreurStudio(e.mode === 'lipsync' ? 'UNSUPPORTED_CAPABILITY' : 'INVALID_SCHEMA', { traceId: ctx.traceId, message: refus, violations: [{ chemin: 'mode', raison: refus }] });
  const ids = Array.isArray(e.shotIds) ? e.shotIds.filter((x): x is string => typeof x === 'string') : [];
  if (ids.length === 0 || ids.length > 100) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'shotIds', raison: 'un à cent plans attendus' }] });
  const base = await versionDeBase(ctx, e.projectId, e.baseVersionId);
  if (!base.ok) return base;
  const r = changementsModeParole(base.version.content as ContenuVersion, ids, e.mode as 'voiceover' | 'none');
  if (!r.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'shotIds', raison: r.raison }] });
  if (r.changes.length === 0) return { ok: true, version: base.version, inchange: true };
  const libelle = e.mode === 'voiceover' ? 'voix off' : 'sans voix';
  return enregistrerVersion(ctx, { projectId: base.projet.id, baseVersionId: base.version.id, changes: r.changes, allowedPaths: r.allowedPaths, raison: `Mode de parole : ${libelle} · ${r.changes.length} plan${r.changes.length > 1 ? 's' : ''}` });
}

/** Le projet et la version de base, dans la portée · la base doit appartenir au projet. */
export async function versionDeBase(ctx: ContexteStudio, projectId: unknown, baseVersionId: unknown): Promise<Resultat<{ projet: ProjetStudio; version: VersionStudio }>> {
  const p = await lireProjet(ctx, projectId);
  if (!p.ok) return p;
  if (!estUuid(baseVersionId)) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'baseVersionId', raison: 'version de base obligatoire' }] });
  const v = await lireVersion(ctx, baseVersionId);
  if (!v.ok || v.version.projectId !== p.projet.id) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'baseVersionId', raison: 'version inconnue pour ce projet' }] });
  return { ok: true, projet: p.projet, version: v.version };
}

/* ─────────────────────────── voice.prepare ──────────────────────────────── */

export interface DependancesVoix {
  adaptateur: AdaptateurModele | null;
  environnement: EnvironnementPrompts;
  plafondAtteint: () => Promise<boolean>;
}

export type ResultatTexteVoix =
  | { ok: true; statut: 'pret'; texte: string; voiceId: string; language: string; deliveryNotes: string; runId: string; synthese: CapacitesVoix['synthese'] }
  | { ok: false; statut: 'refuse'; violations: Array<{ code: ViolationVoix['code'] | string; message: string }>; runId: string | null }
  | ErreurStudio;

/**
 * Prépare le texte prononcé d'un plan · `voice.prepare` sur la narration
 * VALIDÉE de la version courante (jamais un texte reçu du client), puis la
 * seconde garde. Rien n'est écrit dans le projet ; seule la trace du registre.
 */
export async function preparerTexteVoixPour(ctx: ContexteStudio, e: { projectId: unknown; baseVersionId: unknown; shotId: unknown; voiceId: unknown; language?: unknown }, d: DependancesVoix): Promise<ResultatTexteVoix> {
  if (!aPermissionEspace(ctx.permissions, 'studio.generate')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  const base = await versionDeBase(ctx, e.projectId, e.baseVersionId);
  if (!base.ok) return base;
  if (base.projet.currentVersionId !== base.version.id) return erreurStudio('VERSION_CONFLICT', { traceId: ctx.traceId, targetIds: [base.projet.id], message: 'La narration a changé depuis ton ouverture · recharge le projet avant de préparer la voix.' });
  if (typeof e.shotId !== 'string') return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'shotId', raison: 'plan attendu' }] });
  const n = narrationValidee(base.version.content as ContenuVersion, e.shotId);
  if (!n.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'shotId', raison: n.raison }] });
  if (typeof e.voiceId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(e.voiceId)) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'voiceId', raison: 'identifiant de voix attendu' }] });
  const language = typeof e.language === 'string' && /^[a-z]{2}(-[A-Z]{2})?$/.test(e.language) ? e.language : 'fr';
  if (!d.adaptateur) return erreurStudio('UNSUPPORTED_CAPABILITY', { traceId: ctx.traceId, message: 'Le fournisseur de texte n’est pas configuré sur ce serveur.' });
  if (await d.plafondAtteint()) return erreurStudio('BUDGET_EXCEEDED', { traceId: ctx.traceId });
  const r = await executerTache({
    templateKey: 'voice.prepare', portee: { workspaceId: base.projet.workspaceId, brandId: base.projet.brandId }, acteur: { userId: ctx.userId, traceId: ctx.traceId },
    taskInputs: { narrationText: n.texte, voiceId: e.voiceId, language, pronunciations: [] },
    contexte: { connaissances: false, language, projectVersionId: base.version.id },
    liens: { projectId: base.projet.id, documentVersionId: base.version.id },
    adaptateur: d.adaptateur, environnement: d.environnement,
  });
  if (!r.ok) {
    if (r.code === 'RELEASE_ACTIVE_ABSENTE') return erreurStudio('UNSUPPORTED_CAPABILITY', { traceId: ctx.traceId, message: 'La préparation de la voix n’est pas encore activée (aucune version des consignes n’est publiée).' });
    if (r.code === 'BUDGET_EXCEEDED') return erreurStudio('BUDGET_EXCEEDED', { traceId: ctx.traceId });
    return { ok: false, statut: 'refuse', violations: r.constats.map((c) => ({ code: c.code, message: c.message })), runId: r.runId };
  }
  const s = r.sortie as { status: string; result: SortieVoix | null };
  if (s.status !== 'ready' || !s.result) return { ok: false, statut: 'refuse', violations: [{ code: 'BLOQUE', message: 'La préparation est bloquée par le modèle · rien n’est prononcé.' }], runId: r.runId };
  const violations = garderTexteVoix({ narration: n.texte, voiceId: e.voiceId, language, sortie: s.result });
  if (violations.length) return { ok: false, statut: 'refuse', violations, runId: r.runId };
  return { ok: true, statut: 'pret', texte: s.result.spokenText, voiceId: s.result.voiceId, language: s.result.language, deliveryNotes: s.result.deliveryNotes, runId: r.runId, synthese: capacitesVoix().synthese };
}
