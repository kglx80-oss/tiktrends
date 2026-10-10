/**
 * Recette Studios · PAS 1 · premier rendu image RÉEL, de bout en bout ·
 * `pnpm --filter @tiktrends/web recette:pas1 -- [--confirmer-usd <réservation maximale>] [--plafond-passe-usd X] [--nouveau-rendu]`
 * (dans le service d'outils du projet compose `tiktrends-recette`, voir
 * `ops/recette/README.md`).
 *
 * Le parcours, avec les fonctions RÉELLES du produit, dans l'ordre :
 *
 *   devis complet CALCULÉ sur la requête réellement envoyée (AVANT tout
 *   appel, aucune écriture · `devis.ts`) → budget d'essai cumulatif (15 $ au
 *   total, registre `registre.ts`) → confirmation exacte de la RÉSERVATION
 *   MAXIMALE → ENGAGEMENT durable au registre, sous verrou (E3) → compilation de la consigne (texte, bornée à sa ligne de devis,
 *   barrière `guardedAnthropic`) → consigne retenue → devis L3 → approbation
 *   L3 → moteur du worker (`MoteurStudio`) → fal (`BarriereDepenseStudio`) →
 *   décodage réel des pixels → dépôt et relecture du livrable → contrôle
 *   visuel (ligne approuvée) → RÈGLEMENT de l'engagement (lignes nées
 *   rattachées ; erreur en route ⇒ incertain, au maximum) → rapport Markdown à trois colonnes
 *   (estimation, réservation maximale, coût réglé).
 *
 * ── Les barrières de la passe ────────────────────────────────────────────────
 *
 *  · registre · `antérieur + réglé + engagé + incertain + réservation
 *    maximale ≤ 15 $`, toutes bases et toutes passes confondues, décidé et
 *    ÉCRIT sous verrou avant l'appel, sinon refus SANS appel ; un processus
 *    tué pendant l'appel laisse l'engagement compté au maximum, même si la
 *    base est détruite ensuite. Une reprise prend son propre engagement ;
 *  · processus · `AI_SPEND_CAP_USD` abaissé à « ce que la base compte déjà +
 *    réservation maximale confirmée » : la réservation commune
 *    (`reserverDepense`) refuse tout appel au-delà de ce qui a été tapé ;
 *  · ligne · la compilation et le contrôle visuel sont refusés AVANT l'envoi
 *    si leur borne dépasse leur ligne (`adaptateurBorne`).
 *
 * ── Interrupteurs Studios (F1, R6) ───────────────────────────────────────────
 *
 *  · le moteur du worker reçoit les MÊMES interrupteurs que la boucle de
 *    production (`interrupteursWorker`, comme `demarrerBoucleStudio`) : l'essai
 *    éprouve la vraie garde du worker (un job dont une capacité est coupée
 *    reste en file, rien n'est soumis) ;
 *  · avant tout engagement, les capacités qu'exige la passe (image, contrôle
 *    visuel) sont vérifiées pour l'espace de recette par la même règle : coupée
 *    ⇒ refus SANS rien engager ni dépenser (le compose de recette les ouvre,
 *    `docker-compose.recette.yml`).
 *
 * ── Aucune double facturation ────────────────────────────────────────────────
 *
 *  · un job du projet encore en cours ⇒ REPRISE de ce job, sans compilation,
 *    devis ni approbation nouvelle (le moteur ne resoumet jamais) ;
 *  · un livrable déjà produit, ligne « contrôle visuel » approuvée, AUCUN
 *    contrôle fait ⇒ SEUL le contrôle manquant part (E2) ; contrôle engagé
 *    ailleurs ou interrompu, ou à l'issue incertaine ⇒ refus, rapport qui dit
 *    quoi réconcilier ; contrôle tranché ⇒ rapport seulement ;
 *  · `--nouveau-rendu` seul ouvre un second rendu payant (nouvelle confirmation).
 *
 * ── E4 · une seule porte pour tout appel de vision ───────────────────────────
 *
 *  · chaque contrôle visuel de la commande (après le rendu, reprise d'un
 *    contrôle manquant, reprise d'un contrôle incertain RÉCONCILIÉ, qualité
 *    `pending` ou `requires_review`) passe par `controleVisuel` : décision
 *    COMPLÈTE du job (réconciliation comprise) → interrupteur
 *    `controle_visuel` → engagement durable au registre cumulatif s'il n'est
 *    pas couvert par celui de la passe → appel (`porteVisionEssai`, noyau).
 *    La barrière de la base (plafond fournisseur) ne connaît pas les autres
 *    bases : elle ne remplace jamais l'engagement (garde :
 *    `test/e4-pas1-reprise-vision.test.ts`).
 *
 * Codes de sortie : 0 livrable produit (et contrôle tranché ou hors devis),
 * 1 erreur, job en échec, ou contrôle visuel bloqué (engagé, incertain), 2
 * refus (rien de dépensé), 3 job encore en cours (relancer la même commande
 * le reprend).
 */

import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BilanBudgetEssai, IssueEngagement, StockageStudio } from '@tiktrends/core';
import type { AdaptateurModele } from '../../lib/studios/prompts/adaptateur';
import {
  MODE_PAS1, RECETTE,
  deciderPas1, decisionFalRecette, devisPas1, lireMontantUsd, masquerSecrets, rapportPas1, texteDevis, usdAffiche, verifierCibleRecette,
  type DevisPas1, type DonneesRapportPas1, type Env,
} from './regles';
import { cloreEssai, engagerEssai, lireEtatEssai, plafondProcessusUsd, resoudreDossier } from './registre';

/* ───────────────────────────── options (pur) ────────────────────────────── */

export interface OptionsPas1 { confirmation: string | null; plafondPasseUsdMicros: number | null; nouveauRendu: boolean }

export function lireOptionsPas1(argv: readonly string[]): { ok: true; options: OptionsPas1 } | { ok: false; raison: string } {
  const o: OptionsPas1 = { confirmation: null, plafondPasseUsdMicros: null, nouveauRendu: false };
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
        if (m === null) return { ok: false, raison: `Limite de passe « ${v} » illisible.` };
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
  /** Dossier du registre cumulatif · défaut `RECETTE_REGISTRE` ou `ops/recette/registre`. */
  registre?: string;
  /** Rapport marqué SIMULÉ · fournisseur factice des tests. */
  simule?: boolean;
  verifierAdresse?: (u: URL) => Promise<boolean>;
  attente?: { maxMs: number; pasMs: number };
  dormir?: (ms: number) => Promise<void>;
  horloge?: () => Date;
  journal?: (ligne: string) => void;
}

export interface ResultatPas1 { code: 0 | 1 | 2 | 3; refus: string[]; devis: DevisPas1 | null; rapport: string | null; jobId: string | null }

const ATTENTE_DEFAUT = { maxMs: 12 * 60 * 1000, pasMs: 2_000 };
/**
 * Identité FIXE de l'exécuteur du pas 1 · une relance est le même worker et
 * reprend aussitôt le bail de la passe interrompue (sinon : 60 s d'attente).
 * Deux processus lancés en même temps ne soumettent pas deux fois : la
 * réservation de dépense est unique par job (`idDepenseDuJob`).
 */
export const WORKER_PAS1 = 'recette-pas1';
const COMMANDE = 'recette:pas1';

export async function executerPas1(d: DependancesPas1): Promise<ResultatPas1> {
  // Le journal ne porte jamais une valeur sensible, quelle qu'en soit la source (message d'erreur compris).
  const dire = (l: string) => (d.journal ?? ((x: string) => console.log(x)))(masquerSecrets(l, d.env));
  const horloge = d.horloge ?? (() => new Date());
  const refuser = (refus: string[], devis: DevisPas1 | null = null): ResultatPas1 => ({ code: 2, refus, devis, rapport: null, jobId: null });

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
  const { adaptateurAnthropicGarde, modeleTexte, PROFILS_ROUTES_ANTHROPIC } = await import('../../lib/studios/prompts/adaptateur');
  const { spendStatus, estimationAppel } = await import('../../lib/spend-guard');
  const { contexteDepuisSession } = await import('../../lib/studios/garde');
  const { requeteCompilationPas1 } = await import('./devis');
  const { adaptateurBorne, controlerSortieParVision, refusControleVision } = await import('../../lib/studios/produit/qualite');
  const dossierRegistre = d.registre ?? resoudreDossier(d.env);
  // R6 · interrupteurs du worker (même chemin que `demarrerBoucleStudio`), relus avec l'environnement de la commande.
  const { interrupteursWorker } = await import('../../../workers/src/studios/boucle');
  const interrupteurs = interrupteursWorker(d.env);
  type Capacites = ReturnType<typeof core.capacitesDesOperations>;
  /** Les capacités exigées qui sont coupées pour l'espace de recette (relues à chaque appel). */
  const coupeesParmi = async (capacites: Capacites): Promise<Capacites> => {
    const reglages = await interrupteurs.reglagesEspace(db as never, RECETTE.workspaceId);
    return core.capacitesCoupees(capacites, { env: d.env, espace: RECETTE.workspaceId, reglages });
  };
  const messageCoupe = (coupees: Capacites) => `INTERRUPTEUR_COUPE · ${core.messageCapaciteCoupee(coupees)} Ouvre-les pour l’espace de recette seulement (${core.ENV_INTERRUPTEURS.espacesPilotes}=${RECETTE.workspaceId}, ${core.ENV_INTERRUPTEURS.capacitesPilotes}=${coupees.join(',')} · docker-compose.recette.yml), puis relance.`;
  /** Refus si l'une des capacités exigées est coupée pour l'espace de recette · `null` sinon. */
  const refusCapacites = async (capacites: Capacites): Promise<string | null> => {
    const coupees = await coupeesParmi(capacites);
    return coupees.length ? messageCoupe(coupees) : null;
  };

  // Le semis est là ? Sinon rien ne part.
  const [projet] = await db.select().from(schema.studioProjects).where(and(eq(schema.studioProjects.id, RECETTE.projectId), eq(schema.studioProjects.workspaceId, RECETTE.workspaceId))).limit(1);
  if (!projet) return refuser(['Projet de recette absent · lance d’abord `recette:semer`.']);
  if (!(await lirePointeur().catch(() => null))) return refuser(['Aucune release de prompts publiée dans la base de recette · lance d’abord `recette:semer`.']);

  const ctx = contexteDepuisSession({ user: { id: RECETTE.userId, email: RECETTE.email, name: 'Recette' }, workspaceId: RECETTE.workspaceId, role: 'owner', plan: 'business', equipe: null }, [RECETTE.brandId], [], `st_recette_${randomUUID()}`);

  /* ── Le devis COMPLET, calculé AVANT tout appel, sans aucune écriture ── */
  const modelePour = (profil: string) => (PROFILS_ROUTES_ANTHROPIC.includes(profil) ? modeleTexte() : null);
  const rc = await requeteCompilationPas1(ctx, { projectId: RECETTE.projectId, mode: MODE_PAS1, maintenant: horloge(), modelePour });
  if (!rc.ok) return refuser([`Devis impossible · ${rc.raison} · rien n’est lancé.`]);
  const req = core.requeteDepuisMessagesCompiles({ modele: rc.requete.modele, messages: rc.requete.messages, images: 0, maxJetonsSortie: rc.requete.maxJetonsSortie });
  // La ligne « contrôle visuel » ira au devis L3 quand le fournisseur de vision est configuré (`creerDevis`).
  // En réel, le lancement EXIGE ANTHROPIC_API_KEY (compilation), qui configure aussi la vision : le devis
  // lu sans clé (README §4.5) montre donc déjà la ligne, et le montant à recopier ne change pas au lancement.
  const visionAuDevis = d.simule ? adaptateurAnthropicGarde() !== null : true;
  const devis = devisPas1({
    compilation: { estimationUsdMicros: Math.ceil(estimationAppel(req as never) * 1_000_000), reservationUsdMicros: rc.requete.borneUsdMicros },
    imageUsdMicros: core.prixImage().usdMicros,
    vision: visionAuDevis ? { unites: 1, borneParImageUsdMicros: core.borneControleVisionParImageMicros(modeleTexte()) } : null,
  });
  const lignesDevis = (cle: 'compilation' | 'image' | 'vision') => devis.lignes.find((l) => l.cle === cle)?.reservationUsdMicros ?? 0;
  /** Le devis image tel qu'il sera présenté : l'image ET son contrôle visuel. */
  const devisImageUsdMicros = lignesDevis('image') + lignesDevis('vision');

  const etatBudget = await lireEtatEssai(dossierRegistre, horloge());
  dire(texteDevis(devis, { bilan: etatBudget.ok ? etatBudget.bilan : null, plafondPasseUsdMicros: opt.options.plafondPasseUsdMicros }));
  if (!etatBudget.ok) return refuser([etatBudget.raison], devis);

  const J = schema.studioJobs;
  const jobs = await db.select().from(J).where(and(eq(J.workspaceId, RECETTE.workspaceId), eq(J.projectId, RECETTE.projectId))).orderBy(desc(J.createdAt));
  const enCours = jobs.find((j) => !core.jobTerminal(j.state as Parameters<typeof core.jobTerminal>[0]));
  const livre = jobs.find((j) => j.state === 'completed');

  const fal = decisionFalRecette(d.env);
  const refusConfig: string[] = [];
  if (!fal.ok) refusConfig.push(fal.raison);
  if (!d.adaptateur) refusConfig.push('ANTHROPIC_API_KEY absente · la consigne ne peut pas être compilée.');
  else if (d.adaptateur.simule && !d.simule) refusConfig.push('Adaptateur texte simulé interdit hors des tests.');

  const sortie = resolve(d.sortie);
  const stockage = stockageLocal(join(sortie, 'livrables'));
  const ids: DonneesRapportPas1['ids'] = { workspaceId: RECETTE.workspaceId, brandId: RECETTE.brandId, projectId: RECETTE.projectId, versionId: null, runId: null, devisId: null, jobId: null, assetId: null };
  const envAvant = process.env.AI_SPEND_CAP_USD;
  /** Engagement DURABLE pris au registre avant la première dépense (E3) · clos une seule fois. */
  let engagementId: string | null = null;
  let clos = false;
  let erreur: unknown = null;
  let controleVision: string | null = null;
  let controleBloque = false;
  /** Barrière de la passe en vigueur (posée par le dernier engagement). */
  let capPasseCourant = etatBudget.depenseFenetreUsd;

  /**
   * E4 · LA PORTE de tout appel de vision de cette commande, quelle que soit
   * la qualité du livrable (`pending`, `requires_review` d'un contrôle
   * incertain réconcilié…), dans l'ordre de `porteVisionEssai` (noyau) :
   * décision COMPLÈTE du job (la même que celle de l'appel, réconciliation
   * comprise) → fournisseur → interrupteur `controle_visuel` → engagement
   * DURABLE au registre s'il n'est pas déjà couvert par celui de la passe →
   * appel. Rend le refus survenu AVANT tout appel (rien dépensé), sinon `null`.
   */
  const controleVisuel = async (jobId: string): Promise<{ refusAvantAppel: string | null }> => {
    const sans = { refusAvantAppel: null };
    const [jv] = await db.select().from(J).where(eq(J.id, jobId));
    if (!jv || jv.state !== 'completed') return sans;
    const ligne = core.controleVisionApprouve(core.lireSnapshotJob(jv.snapshot)?.lignes);
    if (!ligne) {
      controleVision = 'aucune ligne au devis approuvé (fournisseur IA absent au devis, ou décochée) · aucun appel, aucune dépense · relecture humaine.';
      dire(`Contrôle visuel · ${controleVision}`);
      return sans;
    }
    // 1 · la décision COMPLÈTE (`decisionControleVision`, réconciliation comprise), relue en base.
    const refus = await refusControleVision(ctx, jv);
    if (refus) {
      const tranche = jv.qualityStatus !== 'pending' && refus.code !== 'PROVIDER_UNCERTAIN';
      controleVision = tranche ? `déjà tranché (qualité « ${jv.qualityStatus} ») · aucun appel` : `NON relancé · ${refus.message}`;
      controleBloque = !tranche;
      dire(`Contrôle visuel · ${controleVision}`);
      return sans;
    }
    // 2 à 4 · fournisseur, interrupteur, engagement · AVANT chaque appel autorisé, reprise comprise.
    const coupees = await coupeesParmi(core.capacitesDesOperations([core.OPERATION_CONTROLE_VISION]));
    const porte = core.porteVisionEssai({ decisionLancer: true, fournisseur: d.adaptateur !== null, capacitesCoupees: coupees, engagementCouvrant: engagementId !== null && !clos });
    if (!porte.appeler && porte.etape === 'fournisseur') { controleVision = 'ANTHROPIC_API_KEY absente · contrôle approuvé non exécuté, relance avec la clé (aucun autre appel ne partira)'; controleBloque = true; dire(`Contrôle visuel · ${controleVision}`); return sans; }
    if (!porte.appeler) {
      const m = messageCoupe(coupees);
      controleVision = `NON lancé · ${m}`; controleBloque = true; dire(`Contrôle visuel · ${controleVision}`);
      return { refusAvantAppel: m };
    }
    if (porte.engager) {
      const e = await engager(ligne.totalUsdMicros);
      if (!e.ok) { controleVision = `NON lancé · ${e.raison}`; controleBloque = true; dire(`Contrôle visuel · ${controleVision}`); return { refusAvantAppel: e.raison }; }
      capPasseCourant = e.capPasseUsd;
      dire(`Reprise du contrôle visuel approuvé (${usdAffiche(ligne.totalUsdMicros)} au plus) · seul ce contrôle part. Barrière de la passe : ${e.capPasseUsd} $.`);
    }
    const { resolveurMediasStudio } = await import('../../lib/studios/prompts/resolveur');
    const v = await controlerSortieParVision(ctx, { jobId }, {
      adaptateur: d.adaptateur, environnement: environnementPrompts(d.env), plafondAtteint: async () => (await spendStatus()).blocked,
      medias: resolveurMediasStudio({ lire: (m) => stockage.relire(m.storageKey) }),
    });
    controleVision = v.ok ? `qualité « ${v.qualite} »${v.motif ? ` · ${v.motif}` : ''}` : `non exécuté · ${v.code} · ${v.message}`;
    if (!v.ok) controleBloque = true;
    if (v.ok && v.incertain) {
      // Issue incertaine : dite avec QUOI réconcilier et COMMENT (même message que tout refus de relance).
      const [relu] = await db.select().from(J).where(eq(J.id, jobId));
      const r = relu ? await refusControleVision(ctx, relu) : null;
      controleVision = `${controleVision}${r ? ` · ${r.message}` : ''}`;
      controleBloque = true;
    }
    dire(`Contrôle visuel · ${controleVision}`);
    return sans;
  };

  /**
   * AVANT toute dépense · engagement DURABLE au registre, sous verrou
   * (relecture, décision, écriture indivisibles entre processus et bases),
   * puis plafond du processus posé. Refus ⇒ rien n'est écrit, rien ne part.
   */
  const engager = async (reservationMicros: number): Promise<{ ok: true; capPasseUsd: number } | { ok: false; raison: string }> => {
    const r = await engagerEssai(dossierRegistre, { commande: COMMANDE, reservationMicros, lu: etatBudget.lu, maintenant: horloge() })
      .catch((e: unknown) => ({ ok: false as const, raison: (e as Error).message }));
    if (!r.ok) return { ok: false, raison: r.raison };
    engagementId = r.engagement.id;
    const capPasseUsd = plafondProcessusUsd(r.depenseFenetreUsd, reservationMicros);
    process.env.AI_SPEND_CAP_USD = String(capPasseUsd);
    return { ok: true, capPasseUsd };
  };
  /** APRÈS · règlement (lignes nées rattachées) ou incertain, une seule fois. Échec ⇒ l'engagement reste compté au maximum. */
  const clore = async (issue: IssueEngagement): Promise<BilanBudgetEssai | null> => {
    if (!engagementId || clos) return null;
    clos = true;
    const r = await cloreEssai(dossierRegistre, engagementId, issue, { maintenant: horloge() }).catch((e: unknown) => ({ ok: false as const, raison: (e as Error).message }));
    if (!r.ok) { dire(`Registre NON réglé après la commande · ${r.raison} · l’engagement ${engagementId} reste compté au maximum ; lance recette:budget avant toute autre commande payante.`); return null; }
    return r.bilan;
  };

  try {
    /* ── Livrable déjà produit · seul le contrôle visuel MANQUANT peut partir ── */
    if (!enCours && livre && !opt.options.nouveauRendu) {
      dire(`Un livrable existe déjà (job ${livre.id}) · aucune génération, aucun devis, aucune approbation. Pour un second rendu payant : --nouveau-rendu et une nouvelle confirmation.`);
      ids.jobId = livre.id; ids.devisId = livre.quoteId;
      // E4 · la MÊME porte que tout contrôle (décision complète, interrupteur, engagement) · refus ⇒ rien dépensé.
      const p = await controleVisuel(livre.id);
      if (p.refusAvantAppel) return { ...refuser([p.refusAvantAppel], devis), jobId: livre.id };
      const rapport = await ecrireRapport(livre.id, { capPasseUsd: capPasseCourant, confirmeUsdMicros: 0, arret: controleBloque ? `Contrôle visuel bloqué · ${controleVision}` : null });
      return { code: controleBloque ? 1 : 0, refus: controleBloque ? [String(controleVision)] : [], devis, rapport, jobId: livre.id };
    }

    /* ── Reprise d'un job approuvé · aucune approbation nouvelle ── */
    let jobId: string;
    let capPasseUsd: number;
    let confirmeUsdMicros = 0;
    if (enCours) {
      if (!fal.ok) return refuser([fal.raison], devis);
      const s = core.lireSnapshotJob(enCours.snapshot);
      const coupe = await refusCapacites(core.capacitesDesLignes(s?.lignes));
      if (coupe) return refuser([coupe], devis);
      const reste = (s?.lignes ?? []).reduce((t, l) => t + l.usdMicros * l.unites, 0) || devisImageUsdMicros;
      const e = await engager(reste);
      if (!e.ok) return refuser([e.raison], devis);
      capPasseUsd = e.capPasseUsd;
      dire(`Reprise du job ${enCours.id} (${enCours.state}) approuvé lors d’une passe précédente · aucune compilation, aucun devis, aucune approbation nouvelle. Barrière de la passe : ${capPasseUsd} $.`);
      jobId = enCours.id;
      ids.devisId = enCours.quoteId;
    } else {
      const dec = deciderPas1({ devis, confirmation: opt.options.confirmation, plafondPasseUsdMicros: opt.options.plafondPasseUsdMicros, bilan: etatBudget.bilan, depenseFenetreUsd: etatBudget.depenseFenetreUsd });
      const coupe = await refusCapacites(core.capacitesDesOperations([core.OPERATION_IMAGE, ...(visionAuDevis ? [core.OPERATION_CONTROLE_VISION] : [])]));
      const refus = [...refusConfig, ...(coupe ? [coupe] : []), ...(dec.ok ? [] : dec.refus.map((r) => `${r.code} · ${r.message}`))];
      if (refus.length || !dec.ok || !fal.ok || !d.adaptateur) return refuser(refus, devis);
      const e = await engager(dec.confirmeUsdMicros);
      if (!e.ok) return refuser([e.raison], devis);
      capPasseUsd = e.capPasseUsd;
      confirmeUsdMicros = dec.confirmeUsdMicros;
      dire(`Confirmé · réservation maximale ${usdAffiche(confirmeUsdMicros)}. Barrière de la passe : ${capPasseUsd} $ (déjà compté en base ${etatBudget.depenseFenetreUsd} $).`);

      const { compilerEtAttesterPour, retenirConsignePour } = await import('../../lib/studios/image/consigne');
      const { devisImagePour, approuverImagePour } = await import('../../lib/studios/image/parcours');
      const arreter = async (arret: string, code: 1): Promise<ResultatPas1> => {
        const rapport = await ecrireRapport(null, { capPasseUsd, confirmeUsdMicros, arret });
        return { code, refus: [arret], devis, rapport, jobId: null };
      };

      // La compilation est BORNÉE à sa ligne de devis : au-delà, refus avant l'envoi.
      const c = await compilerEtAttesterPour(ctx, { projectId: RECETTE.projectId, mode: MODE_PAS1 }, { adaptateur: adaptateurBorne(d.adaptateur, lignesDevis('compilation')), environnement: environnementPrompts(d.env), veilleOuverte: true, maintenant: horloge() });
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
      if (dv.devis.maximumUsdMicros > devisImageUsdMicros) return arreter(`Devis image ${usdAffiche(dv.devis.maximumUsdMicros)} > devis annoncé ${usdAffiche(devisImageUsdMicros)} (image + contrôle visuel) · rien n’est approuvé (seule la compilation a été dépensée).`, 1);

      const s1 = await spendStatus();
      const a = await approuverImagePour(ctx, {
        quoteId: dv.devis.id, inputHash: dv.devis.inputHash, creditsAnnonces: dv.devis.maximumCredits, idempotencyKey: `recette-pas1:${dv.devis.id}`,
      }, { illimite: false, plafond: { capUsd: s1.capUsd, depenseUsd: s1.spentUsd, bloque: s1.blocked }, fournisseurImage: true });
      if (!a.ok) return arreter(`Approbation refusée · ${a.code}${a.message ? ` · ${a.message}` : ''}`, 1);
      jobId = a.job.id;
      dire(`Job ${jobId} approuvé et en file · exécution par le moteur du worker.`);
    }
    ids.jobId = jobId;

    /* ── Le moteur du worker, avec le fournisseur fal RÉEL ── */
    const { MoteurStudio } = await import('../../../workers/src/studios/moteur');
    const { DecodeurSharp } = await import('../../../workers/src/studios/decodeur');
    const { construireFournisseurFal } = await import('../../../workers/src/studios/fournisseurs');
    const decision = {
      ok: true as const, apiKey: fal.ok ? fal.apiKey : '', queueUrl: d.env.FAL_QUEUE_URL || null,
      modeles: { generation: d.env.FAL_IMAGE_MODEL || core.MODELE_FAL_GENERATION_DEFAUT, edition: d.env.FAL_IMAGE_MODEL_EDIT || core.MODELE_FAL_EDITION_DEFAUT, animation: d.env.FAL_VIDEO_MODEL_I2V || core.MODELE_FAL_ANIMATION_DEFAUT },
    };
    const envPasse = { ...d.env, AI_SPEND_CAP_USD: String(capPasseUsd) };
    const base = db as unknown as Parameters<typeof construireFournisseurFal>[0]['base'];
    const fournisseur = construireFournisseurFal({ base, decision, fetch: d.fetch, env: envPasse, stockage: null, lire: null, ...(d.verifierAdresse ? { verifierAdresse: d.verifierAdresse } : {}) });
    const moteur = new MoteurStudio({ base, fournisseur, stockage, decodeur: new DecodeurSharp(), workerId: WORKER_PAS1, interrupteurs, journal: (e) => { if (e.type !== 'registre') dire(`  [moteur] ${e.type} ${'vers' in e ? `${e.de} → ${e.vers}` : 'appel' in e ? `${e.appel} ${e.detail}` : ''}`); } });
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
    if (etat === 'completed') await controleVisuel(jobId);
    const arret = !termine ? `Job ${jobId} toujours « ${etat} » après ${Math.round(attente.maxMs / 60_000)} min · relance la même commande : elle REPREND ce job, sans nouvelle dépense.`
      : controleBloque ? `Contrôle visuel bloqué · ${controleVision}` : null;
    const rapport = await ecrireRapport(jobId, { capPasseUsd, confirmeUsdMicros, arret });
    return { code: !termine ? 3 : etat !== 'completed' || controleBloque ? 1 : 0, refus: arret ? [arret] : [], devis, rapport, jobId };
  } catch (e) {
    erreur = e;
    throw e;
  } finally {
    if (envAvant === undefined) delete process.env.AI_SPEND_CAP_USD; else process.env.AI_SPEND_CAP_USD = envAvant;
    // Une erreur en cours de route : issue INCONNUE, l'engagement reste au maximum (incertain).
    if (engagementId && !clos) {
      await clore(erreur ? { etat: 'incertain', cause: masquerSecrets(`commande interrompue par une erreur · ${(erreur as Error)?.message ?? String(erreur)}`, d.env).slice(0, 300) } : { etat: 'regle' });
    }
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
    // Bilan APRÈS · l'engagement de cette commande est RÉGLÉ (lignes nées rattachées), sinon lecture seule.
    let bilanApres: BilanBudgetEssai | null = engagementId && !clos ? await clore({ etat: 'regle' }) : null;
    if (!bilanApres) { const e = await lireEtatEssai(dossierRegistre, horloge()).catch(() => null); bilanApres = e && e.ok ? e.bilan : null; }
    const donnees: DonneesRapportPas1 = {
      mode: d.simule ? 'SIMULE' : 'REEL', horodatage: horloge().toISOString(),
      ids: { ...ids, jobId: id, devisId: ids.devisId ?? job?.quoteId ?? null, assetId },
      devis, confirmeUsdMicros: o.confirmeUsdMicros, capPasseUsd: o.capPasseUsd,
      etatJob: job?.state ?? null, raisonEchec: job?.state === 'failed' ? core.raisonEchec(job.error) : null, qualite: job?.qualityStatus ?? null,
      depenses: depenses.map((l) => {
        const c = core.classerLigneEssai({ provider: l.provider, actualUsd: Number(l.actualUsd), inputTokens: l.inputTokens, outputTokens: l.outputTokens, reconcileReason: l.reconcileReason });
        return { provider: l.provider, modele: l.model, action: l.action, reserveUsd: Number(l.estimatedUsd), regleUsd: c.regleMicros / 1e6, incertainUsd: c.incertainMicros / 1e6, etat: c.etat, cause: l.reconcileReason };
      }),
      registre: registre.map((m) => ({ kind: m.kind, credits: m.credits, usdMicros: Number(m.usdMicros) })),
      livrable, controleVision, bilanApres, arret: o.arret,
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
