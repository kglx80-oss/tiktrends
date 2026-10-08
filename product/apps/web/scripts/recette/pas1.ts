/**
 * Recette Studios · PAS 1 · premier rendu image RÉEL, de bout en bout ·
 * `pnpm --filter @tiktrends/web recette:pas1 -- [--confirmer-usd 0,36] [--plafond-passe-usd 1] [--nouveau-rendu]`
 * (dans le service d'outils du projet compose `tiktrends-recette`, voir
 * `ops/recette/README.md`).
 *
 * Le parcours, avec les fonctions RÉELLES du produit, dans l'ordre :
 *
 *   annonce du coût maximal (AVANT tout appel) → confirmation exacte de ce
 *   montant → compilation de la consigne (texte, barrière `guardedAnthropic`)
 *   → consigne retenue (nouvelle version) → devis L3 → approbation L3 (réserve
 *   de crédits, job en file) → moteur du worker (`MoteurStudio`) → fal (barrière
 *   `BarriereDepenseStudio`) → décodage réel des pixels (`DecodeurSharp`) →
 *   dépôt et relecture du livrable → rapport Markdown.
 *
 * ── La barrière de la passe ──────────────────────────────────────────────────
 *
 * Le plafond de dépense du PROCESSUS (`AI_SPEND_CAP_USD`, lu à chaque
 * réservation par les deux barrières) est abaissé, avant le premier appel, à
 * « dépense déjà comptée + montant confirmé » (jamais au-dessus du plafond de
 * l'environnement). Toute réservation qui dépasserait ce qui a été tapé est
 * refusée par la réservation commune (`reserverDepense`), pas par une
 * vérification de ce script. Plafond d'une passe : 1 $ au plus.
 *
 * ── Aucune double facturation ────────────────────────────────────────────────
 *
 *  · un job du projet encore en cours ⇒ REPRISE de ce job (le moteur ne
 *    resoumet jamais une demande déjà partie), sans compilation, devis ni
 *    approbation nouvelle ;
 *  · un livrable déjà produit ⇒ le rapport est réécrit, rien n'est relancé,
 *    sauf `--nouveau-rendu` (et une nouvelle confirmation) ;
 *  · clé d'idempotence de l'approbation dérivée du devis : rejouer
 *    l'approbation d'un même devis rend le même job.
 *  · le worker du projet compose n'a pas de `FAL_KEY` : cette commande est le
 *    seul exécuteur du job.
 *
 * Le livrable reste sur la machine (`$RECETTE_SORTIE/livrables/`), aucun
 * stockage objet de production n'est touché. Codes de sortie : 0 livrable
 * produit, 1 erreur ou job en échec, 2 refus (rien de dépensé), 3 job encore
 * en cours (relancer la même commande le reprend).
 */

import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StockageStudio } from '@tiktrends/core';
import type { AdaptateurModele } from '../../lib/studios/prompts/adaptateur';
import {
  MODE_PAS1, PLAFOND_PASSE_MAX_USD_MICROS, RECETTE,
  annoncePas1, budgetPas2UsdMicros, deciderPas1, decisionFalRecette, lireMontantUsd, masquerSecrets, rapportPas1, texteAnnonce, usdAffiche, verifierCibleRecette,
  type AnnoncePas1, type DonneesRapportPas1, type Env,
} from './regles';

/* ───────────────────────────── options (pur) ────────────────────────────── */

export interface OptionsPas1 { confirmation: string | null; plafondPasseUsdMicros: number; nouveauRendu: boolean }

export function lireOptionsPas1(argv: readonly string[]): { ok: true; options: OptionsPas1 } | { ok: false; raison: string } {
  const o: OptionsPas1 = { confirmation: null, plafondPasseUsdMicros: PLAFOND_PASSE_MAX_USD_MICROS, nouveauRendu: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') continue;
    if (a === '--nouveau-rendu') { o.nouveauRendu = true; continue; }
    if (a === '--confirmer-usd' || a === '--plafond-passe-usd') {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) return { ok: false, raison: `Valeur attendue après ${a}.` };
      i++;
      if (a === '--confirmer-usd') o.confirmation = v;
      else {
        const m = lireMontantUsd(v);
        if (m === null) return { ok: false, raison: `Plafond de passe « ${v} » illisible.` };
        o.plafondPasseUsdMicros = m;
      }
      continue;
    }
    return { ok: false, raison: `Option inconnue « ${a} ».` };
  }
  return { ok: true, options: o };
}

/* ───────────────────────────── stockage local ───────────────────────────── */

/** Le livrable sur le disque de la machine de recette · une clé ne sort jamais du dossier. */
export function stockageLocal(dossier: string): StockageStudio & { chemin: (cle: string) => string } {
  const racine = resolve(dossier);
  const chemin = (cle: string) => {
    const p = resolve(racine, cle);
    if (!p.startsWith(racine + sep)) throw new Error(`clé de stockage hors du dossier de recette · ${cle}`);
    return p;
  };
  return {
    chemin,
    async deposer(cle, octets) { const p = chemin(cle); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, octets); },
    async relire(cle) { const p = chemin(cle); return existsSync(p) ? new Uint8Array(readFileSync(p)) : null; },
  };
}

/* ───────────────────────────── la commande ──────────────────────────────── */

export interface DependancesPas1 {
  env: Env;
  argv: readonly string[];
  /** Adaptateur texte · réel dans la commande, simulé dans les tests (`simule: true`). */
  adaptateur: AdaptateurModele | null;
  fetch: typeof fetch;
  /** Racine des sorties · livrables et rapports. */
  sortie: string;
  /** Rapport marqué SIMULÉ · fournisseur factice des tests. */
  simule?: boolean;
  verifierAdresse?: (u: URL) => Promise<boolean>;
  attente?: { maxMs: number; pasMs: number };
  dormir?: (ms: number) => Promise<void>;
  horloge?: () => Date;
  journal?: (ligne: string) => void;
}

export interface ResultatPas1 { code: 0 | 1 | 2 | 3; refus: string[]; annonce: AnnoncePas1 | null; rapport: string | null; jobId: string | null }

const ATTENTE_DEFAUT = { maxMs: 12 * 60 * 1000, pasMs: 2_000 };
/**
 * Identité FIXE de l'exécuteur du pas 1 · une relance est le même worker et
 * reprend aussitôt le bail de la passe interrompue (sinon : 60 s d'attente).
 * Deux processus lancés en même temps ne soumettent pas deux fois : la
 * réservation de dépense est unique par job (`idDepenseDuJob`).
 */
export const WORKER_PAS1 = 'recette-pas1';

export async function executerPas1(d: DependancesPas1): Promise<ResultatPas1> {
  // Le journal ne porte jamais une valeur sensible, quelle qu'en soit la source (message d'erreur compris).
  const dire = (l: string) => (d.journal ?? ((x: string) => console.log(x)))(masquerSecrets(l, d.env));
  const horloge = d.horloge ?? (() => new Date());
  const refuser = (refus: string[], annonce: AnnoncePas1 | null = null): ResultatPas1 => ({ code: 2, refus, annonce, rapport: null, jobId: null });

  const cible = verifierCibleRecette(d.env);
  if (!cible.ok) return refuser(cible.raisons);
  const opt = lireOptionsPas1(d.argv);
  if (!opt.ok) return refuser([opt.raison]);

  const { and, desc, eq } = await import('drizzle-orm');
  const { db, schema } = await import('@tiktrends/db');
  if (!db) return refuser(['Base indisponible (DATABASE_URL).']);
  const core = await import('@tiktrends/core');
  const { environnementPrompts } = await import('../../lib/studios/prompts/environnement');
  const { lirePointeur } = await import('../../lib/studios/prompts/depot-prompts');
  const { modeleTexte } = await import('../../lib/studios/prompts/adaptateur');
  const { spendStatus } = await import('../../lib/spend-guard');
  const { contexteDepuisSession } = await import('../../lib/studios/garde');

  // Le semis est là ? Sinon rien ne part.
  const [projet] = await db.select().from(schema.studioProjects).where(and(eq(schema.studioProjects.id, RECETTE.projectId), eq(schema.studioProjects.workspaceId, RECETTE.workspaceId))).limit(1);
  if (!projet) return refuser(['Projet de recette absent · lance d’abord `recette:semer`.']);
  if (!(await lirePointeur().catch(() => null))) return refuser(['Aucune release de prompts publiée dans la base de recette · lance d’abord `recette:semer`.']);

  // L'annonce, AVANT tout appel et avant tout refus de configuration.
  const annonce = annoncePas1({ compilationUsd: core.coutMaximalTexte(modeleTexte()), imageUsdMicros: core.prixImage().usdMicros, visionUsdMicros: core.borneControleVisionParImageMicros(modeleTexte()) });
  /** Le devis image tel qu'il sera présenté : l'image ET son contrôle visuel (coché par défaut, R3). */
  const devisAnnonceUsdMicros = annonce.imageUsdMicros + annonce.visionUsdMicros;
  dire(texteAnnonce(annonce, opt.options.plafondPasseUsdMicros));

  const J = schema.studioJobs;
  const jobs = await db.select().from(J).where(and(eq(J.workspaceId, RECETTE.workspaceId), eq(J.projectId, RECETTE.projectId))).orderBy(desc(J.createdAt));
  const enCours = jobs.find((j) => !core.jobTerminal(j.state as Parameters<typeof core.jobTerminal>[0]));
  const livre = jobs.find((j) => j.state === 'completed');

  const fal = decisionFalRecette(d.env);
  const refusConfig: string[] = [];
  if (!fal.ok) refusConfig.push(fal.raison);
  if (!d.adaptateur) refusConfig.push('ANTHROPIC_API_KEY absente · la consigne ne peut pas être compilée.');
  else if (d.adaptateur.simule && !d.simule) refusConfig.push('Adaptateur texte simulé interdit hors des tests.');

  const s0 = await spendStatus();
  const budget = { capUsd: s0.capUsd, depenseUsd: s0.spentUsd };
  const sortie = resolve(d.sortie);
  const stockage = stockageLocal(join(sortie, 'livrables'));
  const ids: DonneesRapportPas1['ids'] = { workspaceId: RECETTE.workspaceId, brandId: RECETTE.brandId, projectId: RECETTE.projectId, versionId: null, runId: null, devisId: null, jobId: null, assetId: null };

  /* ── Livrable déjà produit · rapport seulement, aucun appel ── */
  if (!enCours && livre && !opt.options.nouveauRendu) {
    dire(`Un livrable existe déjà (job ${livre.id}) · aucun appel, rapport réécrit. Pour un second rendu payant : --nouveau-rendu et une nouvelle confirmation.`);
    const rapport = await ecrireRapport(livre.id, { capPasseUsd: budget.capUsd, confirmeUsdMicros: 0, arret: null });
    return { code: 0, refus: [], annonce, rapport, jobId: livre.id };
  }

  /* ── Reprise d'un job approuvé · aucune approbation nouvelle ── */
  let jobId: string;
  let capPasseUsd: number;
  let confirmeUsdMicros = 0;
  const envAvant = process.env.AI_SPEND_CAP_USD;
  const ctx = contexteDepuisSession({ user: { id: RECETTE.userId, email: RECETTE.email, name: 'Recette' }, workspaceId: RECETTE.workspaceId, role: 'owner', plan: 'business', equipe: null }, [RECETTE.brandId], [], `st_recette_${randomUUID()}`);
  try {
    if (enCours) {
      if (!fal.ok) return refuser([fal.raison], annonce);
      capPasseUsd = Math.min(budget.capUsd, budget.depenseUsd + devisAnnonceUsdMicros / 1_000_000);
      dire(`Reprise du job ${enCours.id} (${enCours.state}) approuvé lors d’une passe précédente · aucune compilation, aucun devis, aucune approbation nouvelle. Barrière de la passe : ${capPasseUsd} $.`);
      jobId = enCours.id;
      ids.devisId = enCours.quoteId;
    } else {
      const dec = deciderPas1({ annonce, confirmation: opt.options.confirmation, plafondPasseUsdMicros: opt.options.plafondPasseUsdMicros, budget });
      const refus = [...refusConfig, ...(dec.ok ? [] : dec.refus.map((r) => `${r.code} · ${r.message}`))];
      if (refus.length || !dec.ok || !fal.ok || !d.adaptateur) return refuser(refus, annonce);
      capPasseUsd = dec.capPasseUsd;
      confirmeUsdMicros = dec.confirmeUsdMicros;
      process.env.AI_SPEND_CAP_USD = String(capPasseUsd);
      dire(`Confirmé · ${usdAffiche(confirmeUsdMicros)} au plus. Barrière de la passe : ${capPasseUsd} $ (déjà compté ${budget.depenseUsd} $).`);

      const { compilerEtAttesterPour, retenirConsignePour } = await import('../../lib/studios/image/consigne');
      const { devisImagePour, approuverImagePour } = await import('../../lib/studios/image/parcours');
      const arreter = async (arret: string, code: 1): Promise<ResultatPas1> => {
        const rapport = await ecrireRapport(null, { capPasseUsd, confirmeUsdMicros, arret });
        return { code, refus: [arret], annonce, rapport, jobId: null };
      };

      const c = await compilerEtAttesterPour(ctx, { projectId: RECETTE.projectId, mode: MODE_PAS1 }, { adaptateur: d.adaptateur, environnement: environnementPrompts(d.env), veilleOuverte: true, maintenant: horloge() });
      if (!c.ok) return arreter(`Compilation refusée · ${c.code}${c.message ? ` · ${c.message}` : ''}`, 1);
      if (c.statut === 'questions') return arreter(`La compilation pose des questions au lieu d’une consigne · ${c.questions.join(' ; ')}`, 1);
      ids.runId = c.runId;
      const [p] = await db.select({ v: schema.studioProjects.currentVersionId }).from(schema.studioProjects).where(eq(schema.studioProjects.id, RECETTE.projectId));
      const r = await retenirConsignePour(ctx, { projectId: RECETTE.projectId, baseVersionId: p!.v, runId: c.runId });
      if (!r.ok) return arreter(`Consigne non retenue · ${r.code}`, 1);
      ids.versionId = r.version.id;

      const dv = await devisImagePour(ctx, { projectId: RECETTE.projectId }, horloge());
      if (!dv.ok) return arreter(`Devis refusé · ${dv.code}${dv.message ? ` · ${dv.message}` : ''}`, 1);
      ids.devisId = dv.devis.id;
      if (dv.devis.maximumUsdMicros > devisAnnonceUsdMicros) return arreter(`Devis image ${usdAffiche(dv.devis.maximumUsdMicros)} > devis annoncé ${usdAffiche(devisAnnonceUsdMicros)} (image + contrôle visuel) · rien n’est approuvé (seule la compilation a été dépensée).`, 1);

      const s1 = await spendStatus();
      const a = await approuverImagePour(ctx, {
        quoteId: dv.devis.id, inputHash: dv.devis.inputHash, creditsAnnonces: dv.devis.maximumCredits, idempotencyKey: `recette-pas1:${dv.devis.id}`,
      }, { illimite: false, plafond: { capUsd: s1.capUsd, depenseUsd: s1.spentUsd, bloque: s1.blocked }, fournisseurImage: true });
      if (!a.ok) return arreter(`Approbation refusée · ${a.code}${a.message ? ` · ${a.message}` : ''}`, 1);
      jobId = a.job.id;
      dire(`Job ${jobId} approuvé et en file · exécution par le moteur du worker.`);
    }
    ids.jobId = jobId;
    process.env.AI_SPEND_CAP_USD = String(capPasseUsd);

    /* ── Le moteur du worker, avec le fournisseur fal RÉEL ── */
    const { MoteurStudio } = await import('../../../workers/src/studios/moteur');
    const { DecodeurSharp } = await import('../../../workers/src/studios/decodeur');
    const { construireFournisseurFal } = await import('../../../workers/src/studios/fournisseurs');
    const decision = {
      ok: true as const, apiKey: fal.ok ? fal.apiKey : '', queueUrl: d.env.FAL_QUEUE_URL || null,
      modeles: { generation: d.env.FAL_IMAGE_MODEL || core.MODELE_FAL_GENERATION_DEFAUT, edition: d.env.FAL_IMAGE_MODEL_EDIT || core.MODELE_FAL_EDITION_DEFAUT },
    };
    const envPasse = { ...d.env, AI_SPEND_CAP_USD: String(capPasseUsd) };
    const base = db as unknown as Parameters<typeof construireFournisseurFal>[0]['base'];
    const fournisseur = construireFournisseurFal({ base, decision, fetch: d.fetch, env: envPasse, stockage: null, lire: null, ...(d.verifierAdresse ? { verifierAdresse: d.verifierAdresse } : {}) });
    const moteur = new MoteurStudio({ base, fournisseur, stockage, decodeur: new DecodeurSharp(), workerId: WORKER_PAS1, journal: (e) => { if (e.type !== 'registre') dire(`  [moteur] ${e.type} ${'vers' in e ? `${e.de} → ${e.vers}` : 'appel' in e ? `${e.appel} ${e.detail}` : ''}`); } });
    const attente = d.attente ?? ATTENTE_DEFAUT;
    const dormir = d.dormir ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
    const t0 = Date.now();
    let etat = '';
    for (;;) {
      await moteur.tour();
      const [j] = await db.select({ state: J.state }).from(J).where(eq(J.id, jobId));
      etat = j?.state ?? '';
      if (core.jobTerminal(etat as Parameters<typeof core.jobTerminal>[0])) break;
      if (Date.now() - t0 >= attente.maxMs) break;
      await dormir(attente.pasMs);
    }
    const termine = core.jobTerminal(etat as Parameters<typeof core.jobTerminal>[0]);
    /* ── Contrôle visuel (ligne approuvée au devis) · l'écran le lance d'ordinaire ; ici, la commande ── */
    const [jv] = etat === 'completed' ? await db.select({ snapshot: J.snapshot }).from(J).where(eq(J.id, jobId)) : [];
    const visionAuDevis = jv ? core.controleVisionApprouve(core.lireSnapshotJob(jv.snapshot)?.lignes) : null;
    if (etat === 'completed' && !visionAuDevis) dire('Contrôle visuel · aucune ligne au devis approuvé (fournisseur IA absent au devis, ou décochée) · aucun appel, aucune dépense · relecture humaine.');
    if (etat === 'completed' && visionAuDevis && d.adaptateur) {
      const { controlerSortieParVision } = await import('../../lib/studios/produit/qualite');
      const { resolveurMediasStudio } = await import('../../lib/studios/prompts/resolveur');
      const v = await controlerSortieParVision(ctx, { jobId }, {
        adaptateur: d.adaptateur, environnement: environnementPrompts(d.env), plafondAtteint: async () => (await spendStatus()).blocked,
        medias: resolveurMediasStudio({ lire: (m) => stockage.relire(m.storageKey) }),
      });
      dire(v.ok ? `Contrôle visuel · qualité « ${v.qualite} »` : `Contrôle visuel non exécuté · ${v.code}${'message' in v && v.message ? ` · ${v.message}` : ''}`);
    }
    const arret = termine ? null : `Job ${jobId} toujours « ${etat} » après ${Math.round(attente.maxMs / 60_000)} min · relance la même commande : elle REPREND ce job, sans nouvelle dépense.`;
    const rapport = await ecrireRapport(jobId, { capPasseUsd, confirmeUsdMicros, arret });
    return { code: !termine ? 3 : etat === 'completed' ? 0 : 1, refus: arret ? [arret] : [], annonce, rapport, jobId };
  } finally {
    if (envAvant === undefined) delete process.env.AI_SPEND_CAP_USD; else process.env.AI_SPEND_CAP_USD = envAvant;
  }

  /* ── Le rapport · relu en BASE et sur le DISQUE, jamais reconstruit de mémoire ── */
  async function ecrireRapport(id: string | null, o: { capPasseUsd: number; confirmeUsdMicros: number; arret: string | null }): Promise<string> {
    const [job] = id ? await db!.select().from(J).where(eq(J.id, id)) : [];
    const assetId = (job?.result as { assets?: Record<string, string> } | null)?.assets?.[core.OPERATION_IMAGE] ?? null;
    const [asset] = assetId ? await db!.select().from(schema.studioAssets).where(eq(schema.studioAssets.id, assetId)) : [];
    let livrable: DonneesRapportPas1['livrable'] = null;
    if (asset) {
      const chemin = stockage.chemin(asset.storageKey);
      const octets = existsSync(chemin) ? readFileSync(chemin) : null;
      let largeur: number | null = null;
      let hauteur: number | null = null;
      if (octets) {
        try {
          const { default: sharp } = await import('sharp');
          const m = await sharp(octets).metadata();
          largeur = m.width ?? null; hauteur = m.height ?? null;
        } catch { /* dimensions décodées absentes : le rapport le dit */ }
      }
      // Copie à un chemin EXPLICITE, nommé par le job · le fichier que le propriétaire transmet au relecteur.
      let aTransmettre: string | null = null;
      if (octets) {
        const dossier = join(sortie, 'a-transmettre');
        mkdirSync(dossier, { recursive: true });
        aTransmettre = join(dossier, `recette-pas1-${id}${extname(asset.storageKey) || (asset.mime === 'image/jpeg' ? '.jpg' : '.png')}`);
        copyFileSync(chemin, aTransmettre);
      }
      livrable = {
        chemin, aTransmettre, cle: asset.storageKey, mime: asset.mime, octets: octets?.length ?? 0,
        sha256Base: asset.sha256, sha256Fichier: octets ? createHash('sha256').update(octets).digest('hex') : '(fichier absent)',
        largeurBase: asset.width, hauteurBase: asset.height, largeurDecodee: largeur, hauteurDecodee: hauteur,
      };
    }
    const S = schema.aiSpend;
    // Toutes les lignes de l'espace de recette (dédié) · une reprise montre aussi la réserve de la passe d'origine.
    const depenses = await db!.select().from(S).where(eq(S.workspaceId, RECETTE.workspaceId)).orderBy(S.createdAt);
    const L = schema.studioBudgetLedger;
    const registre = id ? await db!.select().from(L).where(eq(L.jobId, id)).orderBy(L.createdAt) : [];
    const s = await spendStatus();
    const donnees: DonneesRapportPas1 = {
      mode: d.simule ? 'SIMULE' : 'REEL', horodatage: horloge().toISOString(),
      ids: { ...ids, jobId: id, devisId: ids.devisId ?? job?.quoteId ?? null, assetId },
      annonce, confirmeUsdMicros: o.confirmeUsdMicros, capPasseUsd: o.capPasseUsd,
      etatJob: job?.state ?? null, raisonEchec: job?.state === 'failed' ? core.raisonEchec(job.error) : null, qualite: job?.qualityStatus ?? null,
      depenses: depenses.map((l) => ({ provider: l.provider, modele: l.model, action: l.action, reserveUsd: l.estimatedUsd, regleUsd: l.actualUsd })),
      registre: registre.map((m) => ({ kind: m.kind, credits: m.credits, usdMicros: Number(m.usdMicros) })),
      livrable, budgetPas2UsdMicros: budgetPas2UsdMicros({ capUsd: Number(d.env.AI_SPEND_CAP_USD), depenseUsd: s.spentUsd }), arret: o.arret,
    };
    mkdirSync(sortie, { recursive: true });
    const nom = join(sortie, `rapport-pas1-${donnees.horodatage.replace(/[:.]/g, '-')}.md`);
    const texte = masquerSecrets(rapportPas1(donnees), d.env);
    writeFileSync(nom, texte);
    writeFileSync(join(sortie, 'rapport-pas1.md'), texte);
    dire(`Rapport · ${nom}${livrable ? `\nLivrable à REGARDER · ${livrable.chemin}\nCopie à TRANSMETTRE · ${livrable.aTransmettre ?? '(absente)'}` : ''}`);
    return nom;
  }
}

/* -------------------------------------------------------------------------- */

async function main(): Promise<number> {
  // Garde AVANT toute importation de la base : rien ne se connecte à une base refusée.
  const cible = verifierCibleRecette(process.env);
  if (!cible.ok) { console.error(`✗ Pas 1 REFUSÉ · rien n’a été appelé\n${cible.raisons.map((r) => `  - ${r}`).join('\n')}`); return 2; }
  const { adaptateurAnthropicGarde } = await import('../../lib/studios/prompts/adaptateur');
  const r = await executerPas1({
    env: process.env, argv: process.argv.slice(2), adaptateur: adaptateurAnthropicGarde(), fetch: globalThis.fetch,
    sortie: process.env.RECETTE_SORTIE || join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'ops', 'recette', 'sorties'),
  });
  if (r.code === 2) console.error(masquerSecrets(`✗ Pas 1 REFUSÉ · rien n’a été dépensé\n${r.refus.map((x) => `  - ${x}`).join('\n')}`, process.env));
  else if (r.code !== 0) console.error(masquerSecrets(`✗ ${r.refus.join('\n')}`, process.env));
  return r.code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (e) => { console.error('✗', masquerSecrets((e as Error).message, process.env)); process.exit(1); });
}
