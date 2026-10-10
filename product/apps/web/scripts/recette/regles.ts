/**
 * Recette Studios · règles PURES de l'essai réel (aucune base, aucun réseau,
 * aucun fichier). Les commandes `semer.ts` et `pas1.ts` les appliquent ; les
 * tests `test/e-*.test.ts` les éprouvent au résultat.
 *
 *  · `verifierCibleRecette` · la commande tourne-t-elle bien contre la base
 *    de RECETTE ? Refus au moindre doute, AVANT toute connexion ;
 *  · `devisPas1` / `deciderPas1` · le devis du premier rendu réel en TROIS
 *    colonnes (estimation, réservation maximale, coût réglé), annoncé AVANT le
 *    premier appel, la confirmation exacte de la RÉSERVATION MAXIMALE et la
 *    tenue dans le budget d'essai cumulatif (15 $ au total, `registre.ts`) ;
 *  · `rapportPas1` · le rapport Markdown que le propriétaire relit, avec le
 *    chemin du fichier à REGARDER (la session ne voit pas les rendus).
 *
 * Placées à côté des commandes (comme le garde `decider` de
 * `scripts/bench-studios.ts`) : ce sont des règles d'exploitation de la
 * recette, pas des règles du produit.
 */

import { BUDGET_ESSAI_USD } from './compose';
import { decisionDepenseEssai, type BilanBudgetEssai } from '@tiktrends/core';

export { BUDGET_ESSAI_USD };

/** Identifiants FIXES des données synthétiques de recette · un second semis ne duplique rien. */
export const RECETTE = {
  workspaceId: 'e5ec0000-0000-4000-8000-00000000e001',
  userId: 'e5ec0000-0000-4000-8000-00000000e002',
  brandId: 'e5ec0000-0000-4000-8000-00000000e003',
  productId: 'e5ec0000-0000-4000-8000-00000000e004',
  projectId: 'e5ec0000-0000-4000-8000-00000000e005',
  email: 'recette-studios@local.invalid',
} as const;

/** Mode de la consigne image du pas 1 · une scène générée autour du produit épinglé. */
export const MODE_PAS1 = 'generative_scene';

/*
 * Plus de « plafond de passe » de 1 $ (E2, 9 octobre) : l'autorisation est de
 * 15 $ AU TOTAL, toutes passes confondues, tenue par le registre cumulatif.
 * Une passe ne réserve jamais plus que sa réservation maximale confirmée ;
 * `--plafond-passe-usd` reste possible pour imposer une limite PLUS BASSE.
 */

const HOTES_LOCAUX: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
/** Domaine de l'application en ligne · une recette qui s'y réfère est mal configurée. */
const DOMAINE_PRODUCTION = /tiktrends\.co\b/i;

export type Env = Readonly<Record<string, string | undefined>>;
export type Verdict = { ok: true } | { ok: false; raisons: string[] };

/**
 * La base visée est-elle celle de la recette ? Toutes les conditions, pas
 * une seule : l'environnement déclaré, la base jointe en local, un nom de base
 * de recette, le drapeau de recette locale du registre, et le plafond de
 * l'essai posé (au plus 15 $). Lu sur les variables, avant toute connexion.
 */
export function verifierCibleRecette(env: Env): Verdict {
  const raisons: string[] = [];
  if (env.TIKTRENDS_ENV !== 'recette') raisons.push('TIKTRENDS_ENV=recette absent · cette commande ne tourne que dans l’environnement de recette.');
  const brut = env.DATABASE_URL?.trim();
  let hote: string | null = null;
  let nomBase = '';
  if (!brut) raisons.push('DATABASE_URL absente · aucune base de recette désignée.');
  else {
    try {
      const u = new URL(brut);
      if (!/^postgres(ql)?:$/.test(u.protocol)) raisons.push(`DATABASE_URL n’est pas une adresse Postgres (${u.protocol}).`);
      hote = u.hostname.toLowerCase();
      nomBase = decodeURIComponent(u.pathname.replace(/^\//, ''));
    } catch {
      raisons.push('DATABASE_URL illisible.');
    }
  }
  if (hote !== null && !HOTES_LOCAUX.has(hote)) raisons.push(`Hôte de base « ${hote} » · la base de recette se joint en local (127.0.0.1), jamais par un nom de service ou un hôte distant.`);
  if (brut && hote !== null && !/recette/.test(nomBase)) raisons.push(`Base « ${nomBase || '(sans nom)'} » · le nom d’une base de recette contient « recette ».`);
  if (env.STUDIOS_PROMPTS_RECETTE_LOCALE !== '1') raisons.push('STUDIOS_PROMPTS_RECETTE_LOCALE=1 absent · le registre de prompts de recette n’est pas ouvert.');
  const cap = env.AI_SPEND_CAP_USD?.trim();
  const n = cap ? Number(cap) : NaN;
  if (!cap) raisons.push(`AI_SPEND_CAP_USD absent · le plafond de l’essai (${BUDGET_ESSAI_USD} $ au plus) doit être posé.`);
  else if (!Number.isFinite(n) || n <= 0) raisons.push(`AI_SPEND_CAP_USD « ${cap} » illisible ou nul.`);
  else if (n > BUDGET_ESSAI_USD) raisons.push(`AI_SPEND_CAP_USD ${cap} dépasse le budget d’essai de ${BUDGET_ESSAI_USD} $.`);
  if (env.APP_URL && DOMAINE_PRODUCTION.test(env.APP_URL)) raisons.push(`APP_URL « ${env.APP_URL} » désigne l’application en ligne.`);
  return raisons.length ? { ok: false, raisons } : { ok: true };
}

/* ───────────────────────────── montants ─────────────────────────────────── */

/** Arrondi au CENTIME SUPÉRIEUR · le montant affiché ne sous-estime jamais le maximum. */
export const centimeSuperieur = (micros: number): number => Math.ceil(micros / 10_000) * 10_000;

/** « 0,22 $ » · virgule décimale, deux décimales. */
export const usdAffiche = (micros: number): string => `${(micros / 1_000_000).toFixed(2).replace('.', ',')} $`;

/** Lit « 0,22 », « 0.22 » ou « 0,22 $ » · `null` si illisible. Rien d'autre n'est accepté. */
export function lireMontantUsd(brut: string | undefined | null): number | null {
  if (typeof brut !== 'string') return null;
  const s = brut.trim().replace(/\s*\$$/, '').replace(',', '.');
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100) * 10_000;
}

/** Une ligne du devis du pas 1 · trois montants distincts, jamais confondus. */
export interface LigneDevisPas1 {
  cle: 'compilation' | 'image' | 'vision';
  libelle: string;
  /** Ce qu'on s'attend à payer · indicatif, JAMAIS confirmé ni réservé. */
  estimationUsdMicros: number;
  /** D'où vient l'estimation. */
  sourceEstimation: string;
  /** Borne PROUVÉE de la ligne · ce qui est réservé avant l'appel et refusé au-delà. */
  reservationUsdMicros: number;
  /** D'où vient la borne. */
  sourceReservation: string;
}

export interface DevisPas1 {
  lignes: LigneDevisPas1[];
  estimationUsdMicros: number;
  /** Somme exacte des réservations maximales. */
  reservationUsdMicros: number;
  /** Ce que le propriétaire lit et recopie · réservation maximale au centime supérieur. */
  afficheUsdMicros: number;
}

/**
 * Le devis complet du pas 1, calculé sur les paramètres EFFECTIVEMENT envoyés :
 *  · compilation · réservation = `borneMaxAppel` de la requête `image.compile`
 *    réellement compilée (`devis.ts`) ; estimation = l'estimation à 3,5
 *    caractères par jeton de cette même requête ;
 *  · image · prix fixe fal du devis (`prixImage`) = estimation = réservation ;
 *  · contrôle visuel · borne prouvée par image (`borneControleVisionParImageMicros`) ×
 *    images ; pas d'estimation distincte (la requête n'existe qu'après l'image).
 */
export function devisPas1(e: {
  compilation: { estimationUsdMicros: number; reservationUsdMicros: number };
  imageUsdMicros: number;
  vision: { unites: number; borneParImageUsdMicros: number } | null;
}): DevisPas1 {
  const lignes: LigneDevisPas1[] = [
    { cle: 'compilation', libelle: 'compilation de la consigne (texte)', estimationUsdMicros: e.compilation.estimationUsdMicros, sourceEstimation: 'requête réelle, 3,5 caractères par jeton', reservationUsdMicros: e.compilation.reservationUsdMicros, sourceReservation: 'borne de la requête réelle (octets UTF-8, sortie pleine)' },
    { cle: 'image', libelle: 'génération de l’image (fal)', estimationUsdMicros: e.imageUsdMicros, sourceEstimation: 'prix fixe', reservationUsdMicros: e.imageUsdMicros, sourceReservation: 'prix fixe du devis' },
  ];
  if (e.vision && e.vision.unites > 0) {
    const v = e.vision.unites * e.vision.borneParImageUsdMicros;
    lignes.push({ cle: 'vision', libelle: 'contrôle visuel de l’image (IA)', estimationUsdMicros: v, sourceEstimation: 'pas d’estimation distincte · borne', reservationUsdMicros: v, sourceReservation: `borne prouvée par image × ${e.vision.unites}` });
  }
  const reservationUsdMicros = lignes.reduce((s, l) => s + l.reservationUsdMicros, 0);
  return { lignes, estimationUsdMicros: lignes.reduce((s, l) => s + l.estimationUsdMicros, 0), reservationUsdMicros, afficheUsdMicros: centimeSuperieur(reservationUsdMicros) };
}

const usd4c = (micros: number) => `${(micros / 1_000_000).toFixed(4).replace('.', ',')} $`;
const col = (s: string, n: number) => s.padEnd(n);

/** Le devis tel qu'affiché AVANT tout appel · trois colonnes, et le budget cumulatif. */
export function texteDevis(d: DevisPas1, o: { bilan: BilanBudgetEssai | null; plafondPasseUsdMicros?: number | null } = { bilan: null }): string {
  const b = o.bilan;
  return [
    'Pas 1 · premier rendu image réel · devis calculé sur la requête réellement envoyée, AVANT tout appel',
    `  ${col('ligne', 36)}${col('estimation', 14)}${col('réservation maximale', 22)}coût réglé`,
    ...d.lignes.map((l) => `  ${col(l.libelle, 36)}${col(usd4c(l.estimationUsdMicros), 14)}${col(usd4c(l.reservationUsdMicros), 22)}après coup (ai_spend)`),
    `  ${col('TOTAL', 36)}${col(usd4c(d.estimationUsdMicros), 14)}${col(`${usdAffiche(d.afficheUsdMicros)} au plus`, 22)}après coup (ai_spend)`,
    '  L’estimation est indicative. La RÉSERVATION MAXIMALE est le plafond dur de la passe : chaque ligne est refusée avant l’envoi au-delà de sa borne, et la réservation commune refuse toute dépense au-delà du total.',
    b ? `  budget d’essai cumulatif · autorisé ${usdAffiche(b.autoriseMicros)} au total · déjà engagé ${usdAffiche(b.anterieuresMicros + b.regleMicros + b.incertainMicros)} (dont incertain ${usdAffiche(b.incertainMicros)}) · restant ${usdAffiche(b.restantMicros)}` : '  budget d’essai cumulatif · registre non lu',
    ...(o.plafondPasseUsdMicros ? [`  limite de passe imposée par toi · ${usdAffiche(o.plafondPasseUsdMicros)}`] : []),
    `Rien ne part sans --confirmer-usd ${usdAffiche(d.afficheUsdMicros).replace(' $', '')} (la RÉSERVATION MAXIMALE ci-dessus, recopiée ; jamais l’estimation).`,
  ].join('\n');
}

export type CodeRefusPas1 =
  | 'PLAFOND_PASSE_INVALIDE' | 'DEVIS_AU_DELA_DU_PLAFOND_DE_PASSE' | 'BUDGET_ESSAI_INSUFFISANT'
  | 'CONFIRMATION_ABSENTE' | 'CONFIRMATION_DIFFERENTE';

export type DecisionPas1 =
  | { ok: true; capPasseUsd: number; confirmeUsdMicros: number }
  | { ok: false; refus: Array<{ code: CodeRefusPas1; message: string }> };

/**
 * Le pas 1 peut-il partir ? Tous les refus d'un coup, pour corriger en une fois.
 *
 *  · budget · `antérieur + réglé + incertain + réservation maximale ≤ 15 $`
 *    (registre cumulatif, toutes bases, `decisionDepenseEssai`) ;
 *  · confirmation · la RÉSERVATION MAXIMALE affichée, recopiée (jamais
 *    l'estimation) ;
 *  · limite de passe facultative · plus basse seulement.
 *
 * La barrière de la passe (`capPasseUsd`) devient le plafond de dépense du
 * PROCESSUS : ce que la base compte déjà plus la réservation maximale
 * confirmée. La barrière commune (`reserverDepense`) refuse donc tout appel
 * au-delà de ce qui a été tapé.
 */
export function deciderPas1(e: {
  devis: DevisPas1;
  confirmation: string | undefined | null;
  plafondPasseUsdMicros: number | null;
  bilan: BilanBudgetEssai;
  depenseFenetreUsd: number;
}): DecisionPas1 {
  const refus: Array<{ code: CodeRefusPas1; message: string }> = [];
  const { devis: d, plafondPasseUsdMicros: plafond } = e;
  if (plafond !== null && (!Number.isFinite(plafond) || plafond <= 0)) {
    refus.push({ code: 'PLAFOND_PASSE_INVALIDE', message: `Limite de passe ${usdAffiche(plafond)} · elle doit être positive.` });
  } else if (plafond !== null && d.afficheUsdMicros > plafond) {
    refus.push({ code: 'DEVIS_AU_DELA_DU_PLAFOND_DE_PASSE', message: `Réservation maximale ${usdAffiche(d.afficheUsdMicros)} > limite de passe ${usdAffiche(plafond)} · rien n’est lancé.` });
  }
  const budget = decisionDepenseEssai(e.bilan, d.afficheUsdMicros);
  if (!budget.ok) refus.push({ code: 'BUDGET_ESSAI_INSUFFISANT', message: budget.message });
  const lu = lireMontantUsd(e.confirmation);
  if (e.confirmation === undefined || e.confirmation === null || e.confirmation.trim() === '') {
    refus.push({ code: 'CONFIRMATION_ABSENTE', message: `Aucune confirmation · relance avec --confirmer-usd ${usdAffiche(d.afficheUsdMicros).replace(' $', '')} (la réservation maximale affichée, recopiée).` });
  } else if (lu !== d.afficheUsdMicros) {
    refus.push({ code: 'CONFIRMATION_DIFFERENTE', message: `Confirmation « ${e.confirmation} » ≠ réservation maximale affichée ${usdAffiche(d.afficheUsdMicros)}${lu === centimeSuperieur(d.estimationUsdMicros) && lu !== d.afficheUsdMicros ? ' (tu as recopié l’ESTIMATION)' : ''} · rien n’est lancé.` });
  }
  if (refus.length) return { ok: false, refus };
  return { ok: true, capPasseUsd: Math.round((e.depenseFenetreUsd + d.afficheUsdMicros / 1_000_000) * 1_000_000) / 1_000_000, confirmeUsdMicros: d.afficheUsdMicros };
}

/** Le fournisseur image de la recette · une vraie clé ET l'autorisation explicite. Aucun stockage S3 : le livrable reste sur la machine. */
export function decisionFalRecette(env: Env): { ok: true; apiKey: string } | { ok: false; raison: string } {
  const cle = (env.FAL_KEY ?? '').trim();
  if (!cle) return { ok: false, raison: 'FAL_KEY absente · aucun fournisseur d’images.' };
  if (/^simule/i.test(cle) || /\s/.test(cle)) return { ok: false, raison: 'FAL_KEY de simulation · aucun appel réel.' };
  if (env.STUDIO_FOURNISSEUR_REEL !== 'autorise') return { ok: false, raison: 'STUDIO_FOURNISSEUR_REEL=autorise absent · le fournisseur réel n’est pas autorisé pour cette passe.' };
  return { ok: true, apiKey: cle };
}

/* ───────────────────────────── secrets ──────────────────────────────────── */

const NOM_SENSIBLE = /(KEY|SECRET|TOKEN|PASSWORD)$|^(DATABASE_URL|POSTGRES_URL|REDIS_URL|SMTP_URL)$/;

/**
 * Les valeurs sensibles de l'environnement · clés, secrets, jetons, mots de
 * passe, adresses de base (entières ET leur mot de passe seul). Les valeurs
 * de moins de 6 caractères ne sont pas retenues (elles masqueraient du texte
 * ordinaire) · une vraie clé est plus longue.
 */
export function valeursSensibles(env: Env): string[] {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(env)) {
    if (!v || !NOM_SENSIBLE.test(k)) continue;
    if (v.length >= 6) out.add(v);
    try { const mdp = decodeURIComponent(new URL(v).password); if (mdp.length >= 6) out.add(mdp); } catch { /* pas une URL */ }
  }
  return [...out].sort((a, b) => b.length - a.length);
}

/** Remplace toute valeur sensible par « [masqué] » · appliqué au rapport et au journal avant écriture. */
export function masquerSecrets(texte: string, env: Env): string {
  let t = texte;
  for (const v of valeursSensibles(env)) t = t.split(v).join('[masqué]');
  return t;
}

/* ───────────────────────────── rapport ──────────────────────────────────── */

export interface LigneDepenseRapport {
  provider: string; modele: string | null; action: string; reserveUsd: number;
  /** Réglé au coût réel ou au prix fixe (0 si rendu ou incertain). */
  regleUsd: number;
  /** Incertain, compté au maximum réservé (à réconcilier). */
  incertainUsd: number;
  etat: string;
  cause: string | null;
}

/** La ligne du devis à laquelle se rattache une dépense · d'après son fournisseur et son action. */
export function ligneDuDevis(l: { provider: string; action: string }): LigneDevisPas1['cle'] | null {
  if (l.action === 'studio-prompt:image.compile') return 'compilation';
  if (l.action === 'studio-prompt:quality.visual') return 'vision';
  if (l.provider === 'fal') return 'image';
  return null;
}
export interface MouvementRegistre { kind: string; credits: number; usdMicros: number }

export interface DonneesRapportPas1 {
  mode: 'REEL' | 'SIMULE';
  horodatage: string;
  ids: { workspaceId: string; brandId: string; projectId: string; versionId: string | null; runId: string | null; devisId: string | null; jobId: string | null; assetId: string | null };
  devis: DevisPas1 | null;
  confirmeUsdMicros: number;
  capPasseUsd: number;
  etatJob: string | null;
  raisonEchec: string | null;
  qualite: string | null;
  depenses: LigneDepenseRapport[];
  registre: MouvementRegistre[];
  livrable: null | {
    chemin: string; aTransmettre: string | null; cle: string; mime: string; octets: number;
    sha256Base: string; sha256Fichier: string;
    largeurBase: number | null; hauteurBase: number | null; largeurDecodee: number | null; hauteurDecodee: number | null;
  };
  /** Ce que la commande a fait du contrôle visuel (exécuté, repris, refusé et pourquoi). */
  controleVision: string | null;
  /** Bilan du registre cumulatif APRÈS la commande · `null` s'il n'a pas pu être relu. */
  bilanApres: BilanBudgetEssai | null;
  arret: string | null;
}

const usd4 = (x: number) => `${x.toFixed(4).replace('.', ',')} $`;

/** Le rapport du pas 1 · Markdown, en français, sans tiret cadratin. */
export function rapportPas1(d: DonneesRapportPas1): string {
  const reserve = d.depenses.reduce((s, l) => s + l.reserveUsd, 0);
  const regle = d.depenses.reduce((s, l) => s + l.regleUsd, 0);
  const incertain = d.depenses.reduce((s, l) => s + l.incertainUsd, 0);
  const L = d.livrable;
  const concordance = L ? (L.sha256Base === L.sha256Fichier ? 'identique' : 'DIFFÉRENTE · le fichier ne correspond pas au média enregistré') : 'sans objet';
  const dims = L ? (L.largeurBase === L.largeurDecodee && L.hauteurBase === L.hauteurDecodee ? 'identiques' : 'DIFFÉRENTES') : 'sans objet';
  const lignes = [
    `# Recette Studios · pas 1 · premier rendu image ${d.mode === 'REEL' ? 'RÉEL' : 'SIMULÉ'}`,
    '',
    d.mode === 'SIMULE' ? '> SIMULÉ · fournisseur factice, aucun appel réel, aucune dépense. Ce rapport ne vaut PAS recette réelle.' : '> RÉEL · appels payants sous la barrière commune, au plus le montant confirmé.',
    '',
    `Horodatage · ${d.horodatage}`,
    d.arret ? `\n**Arrêt** · ${d.arret}\n` : '',
    '## Identifiants',
    '',
    '| Objet | Identifiant |',
    '| --- | --- |',
    `| Espace | \`${d.ids.workspaceId}\` |`,
    `| Marque | \`${d.ids.brandId}\` |`,
    `| Projet | \`${d.ids.projectId}\` |`,
    `| Version retenue | \`${d.ids.versionId ?? '·'}\` |`,
    `| Compilation (run) | \`${d.ids.runId ?? '·'}\` |`,
    `| Devis | \`${d.ids.devisId ?? '·'}\` |`,
    `| Job | \`${d.ids.jobId ?? '·'}\` |`,
    `| Média livré | \`${d.ids.assetId ?? '·'}\` |`,
    '',
    '## Coût',
    '',
    'Trois montants distincts : l’ESTIMATION (indicative), la RÉSERVATION MAXIMALE (plafond dur, ce qui a été confirmé), le COÛT RÉGLÉ (lu dans `ai_spend` après coup ; l’incertain y reste compté au maximum).',
    '',
    '| Ligne | Estimation | Réservation maximale | Coût réglé | Incertain (à réconcilier) |',
    '| --- | --- | --- | --- | --- |',
    ...(d.devis ? d.devis.lignes.map((l) => {
      const dep = d.depenses.filter((x) => ligneDuDevis(x) === l.cle);
      return `| ${l.libelle} | ${usd4(l.estimationUsdMicros / 1e6)} | ${usd4(l.reservationUsdMicros / 1e6)} | ${usd4(dep.reduce((s, x) => s + x.regleUsd, 0))} | ${usd4(dep.reduce((s, x) => s + x.incertainUsd, 0))} |`;
    }) : ['| (devis non calculé) | · | · | · | · |']),
    `| **Total** | **${d.devis ? usd4(d.devis.estimationUsdMicros / 1e6) : '·'}** | **${d.devis ? `${usdAffiche(d.devis.afficheUsdMicros)} au plus` : '·'}** | **${usd4(regle)}** | **${usd4(incertain)}** |`,
    '',
    `Confirmé par saisie · ${usdAffiche(d.confirmeUsdMicros)} (réservation maximale). Barrière de la passe (plafond du processus) · ${d.capPasseUsd} $.`,
    '',
    'Lignes `ai_spend` de l’espace de recette ·',
    '',
    '| Fournisseur | Modèle | Action | Réservé | Réglé | Incertain | État |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...(d.depenses.length ? d.depenses.map((l) => `| ${l.provider} | ${l.modele ?? '·'} | ${l.action} | ${usd4(l.reserveUsd)} | ${usd4(l.regleUsd)} | ${usd4(l.incertainUsd)} | ${l.etat}${l.cause ? ` (${l.cause})` : ''} |`) : ['| · | · | aucune dépense | 0 | 0 | 0 | · |']),
    `| **Total** | | | **${usd4(reserve)}** | **${usd4(regle)}** | **${usd4(incertain)}** | |`,
    '',
    'Registre du job (crédits internes et dollars) ·',
    ...(d.registre.length ? d.registre.map((m) => `- ${m.kind} · ${m.credits} crédit(s) · ${usdAffiche(m.usdMicros)}`) : ['- aucun mouvement']),
    '',
    '## Job',
    '',
    `État · ${d.etatJob ?? 'aucun job'}${d.raisonEchec ? ` · raison : ${d.raisonEchec}` : ''}`,
    `Qualité · ${d.qualite ?? '·'}`,
    `Contrôle visuel · ${d.controleVision ?? '·'}`,
    '',
    '## Livrable',
    '',
    ...(L ? [
      `Fichier à REGARDER · \`${L.chemin}\``,
      `Copie à TRANSMETTRE au relecteur · \`${L.aTransmettre ?? '(copie impossible · transmettre le fichier ci-dessus)'}\``,
      '',
      `- clé de stockage · \`${L.cle}\``,
      `- type · ${L.mime} · ${L.octets} octets`,
      `- SHA-256 enregistré · \`${L.sha256Base}\``,
      `- SHA-256 du fichier relu · \`${L.sha256Fichier}\` (${concordance})`,
      `- dimensions enregistrées · ${L.largeurBase ?? '?'} × ${L.hauteurBase ?? '?'} · décodées · ${L.largeurDecodee ?? '?'} × ${L.hauteurDecodee ?? '?'} (${dims})`,
    ] : ['Aucun livrable.']),
    '',
    '## Ce que seul le propriétaire peut vérifier',
    '',
    'La session ne voit aucun rendu. Ouvre le fichier ci-dessus et réponds :',
    '',
    '1. Le produit synthétique (lunettes et bandeau bleus) est-il présent et reconnaissable ?',
    '2. La scène correspond-elle à la consigne compilée (voir l’audit `image.consigne.compilee`) ?',
    '3. Aucun texte parasite, aucun logo, aucune marque réelle dans l’image ?',
    '',
    '## Suite',
    '',
    d.bilanApres
      ? `Budget d’essai cumulatif après cette commande · autorisé ${usdAffiche(d.bilanApres.autoriseMicros)} au total, réglé ${usd4(d.bilanApres.regleMicros / 1e6)}, incertain conservé ${usd4(d.bilanApres.incertainMicros / 1e6)}, antérieur ${usd4(d.bilanApres.anterieuresMicros / 1e6)} · **restant ${usd4(d.bilanApres.restantMicros / 1e6)}** (plafond du pas 2, pas une cible ; relis-le avec \`recette:budget\`).`
      : 'Budget d’essai cumulatif · registre non relu · lance `recette:budget` avant toute autre commande payante.',
    '',
  ];
  return lignes.filter((l, i, t) => !(l === '' && t[i - 1] === '')).join('\n');
}
