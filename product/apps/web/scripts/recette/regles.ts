/**
 * Recette Studios · règles PURES de l'essai réel (aucune base, aucun réseau,
 * aucun fichier). Les commandes `semer.ts` et `pas1.ts` les appliquent ; les
 * tests `test/e-*.test.ts` les éprouvent au résultat.
 *
 *  · `verifierCibleRecette` · la commande tourne-t-elle bien contre la base
 *    de RECETTE ? Refus au moindre doute, AVANT toute connexion ;
 *  · `annoncePas1` / `deciderPas1` · le prix du premier rendu réel, annoncé
 *    AVANT le premier appel, et la confirmation exacte de ce montant ;
 *  · `rapportPas1` · le rapport Markdown que le propriétaire relit, avec le
 *    chemin du fichier à REGARDER (la session ne voit pas les rendus).
 *
 * Placées à côté des commandes (comme le garde `decider` de
 * `scripts/bench-studios.ts`) : ce sont des règles d'exploitation de la
 * recette, pas des règles du produit.
 */

import { BUDGET_ESSAI_USD } from './compose';

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

/** Plafond d'UNE passe du pas 1 · décision du brief : au plus 1 $. Une option peut le baisser, jamais le monter. */
export const PLAFOND_PASSE_MAX_USD_MICROS = 1_000_000;

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

export interface AnnoncePas1 {
  compilationUsdMicros: number;
  imageUsdMicros: number;
  /** Somme exacte des maximums. */
  totalUsdMicros: number;
  /** Ce que le propriétaire lit et recopie · centime supérieur. */
  afficheUsdMicros: number;
}

export function annoncePas1(e: { compilationUsd: number; imageUsdMicros: number }): AnnoncePas1 {
  const compilationUsdMicros = Math.round(e.compilationUsd * 1_000_000);
  const totalUsdMicros = compilationUsdMicros + e.imageUsdMicros;
  return { compilationUsdMicros, imageUsdMicros: e.imageUsdMicros, totalUsdMicros, afficheUsdMicros: centimeSuperieur(totalUsdMicros) };
}

export function texteAnnonce(a: AnnoncePas1, plafondPasseUsdMicros: number = PLAFOND_PASSE_MAX_USD_MICROS): string {
  return [
    'Pas 1 · premier rendu image réel · coût MAXIMAL annoncé avant tout appel',
    `  compilation de la consigne (texte) · ${usdAffiche(centimeSuperieur(a.compilationUsdMicros))} au plus`,
    `  génération de l’image (fal)        · ${usdAffiche(centimeSuperieur(a.imageUsdMicros))} au plus`,
    `  TOTAL                              · ${usdAffiche(a.afficheUsdMicros)} au plus`,
    `  plafond de passe PROPOSÉ           · ${usdAffiche(plafondPasseUsdMicros)} (proposition à approuver par le propriétaire, pas une dépense approuvée)`,
    'Rien ne part sans --confirmer-usd suivi du TOTAL ci-dessus, recopié.',
  ].join('\n');
}

export type CodeRefusPas1 =
  | 'PLAFOND_PASSE_INVALIDE' | 'DEVIS_AU_DELA_DU_PLAFOND_DE_PASSE' | 'BUDGET_ESSAI_INSUFFISANT'
  | 'CONFIRMATION_ABSENTE' | 'CONFIRMATION_DIFFERENTE';

export type DecisionPas1 =
  | { ok: true; capPasseUsd: number; confirmeUsdMicros: number }
  | { ok: false; refus: Array<{ code: CodeRefusPas1; message: string }> };

/**
 * Le pas 1 peut-il partir ? Tous les refus sont rendus d'un coup, pour que le
 * propriétaire corrige en une fois.
 *
 * La barrière de la passe (`capPasseUsd`) devient le plafond de dépense du
 * PROCESSUS : la dépense déjà comptée plus le montant CONFIRMÉ, jamais plus
 * que le plafond de l'environnement. La barrière commune (`reserverDepense`)
 * refuse donc tout appel qui irait au-delà de ce qui a été tapé.
 */
export function deciderPas1(e: {
  annonce: AnnoncePas1;
  confirmation: string | undefined | null;
  plafondPasseUsdMicros: number;
  budget: { capUsd: number; depenseUsd: number };
}): DecisionPas1 {
  const refus: Array<{ code: CodeRefusPas1; message: string }> = [];
  const { annonce: a, plafondPasseUsdMicros: plafond } = e;
  if (!Number.isFinite(plafond) || plafond <= 0 || plafond > PLAFOND_PASSE_MAX_USD_MICROS) {
    refus.push({ code: 'PLAFOND_PASSE_INVALIDE', message: `Plafond de passe ${usdAffiche(plafond)} · il doit être compris entre 0 et ${usdAffiche(PLAFOND_PASSE_MAX_USD_MICROS)}.` });
  } else if (a.afficheUsdMicros > plafond) {
    refus.push({ code: 'DEVIS_AU_DELA_DU_PLAFOND_DE_PASSE', message: `Devis ${usdAffiche(a.afficheUsdMicros)} au plus > plafond de passe ${usdAffiche(plafond)} · rien n’est lancé.` });
  }
  const resteMicros = Math.round((e.budget.capUsd - e.budget.depenseUsd) * 1_000_000);
  if (a.afficheUsdMicros > resteMicros) {
    refus.push({ code: 'BUDGET_ESSAI_INSUFFISANT', message: `Il reste ${usdAffiche(Math.max(0, resteMicros))} sous le plafond (${e.budget.capUsd} $, ${e.budget.depenseUsd.toFixed(4)} $ déjà comptés) · le devis ${usdAffiche(a.afficheUsdMicros)} ne tient pas.` });
  }
  const lu = lireMontantUsd(e.confirmation);
  if (e.confirmation === undefined || e.confirmation === null || e.confirmation.trim() === '') {
    refus.push({ code: 'CONFIRMATION_ABSENTE', message: `Aucune confirmation · relance avec --confirmer-usd ${usdAffiche(a.afficheUsdMicros).replace(' $', '')} (le montant maximal affiché, recopié).` });
  } else if (lu !== a.afficheUsdMicros) {
    refus.push({ code: 'CONFIRMATION_DIFFERENTE', message: `Confirmation « ${e.confirmation} » ≠ montant maximal affiché ${usdAffiche(a.afficheUsdMicros)} · rien n’est lancé.` });
  }
  if (refus.length) return { ok: false, refus };
  const capPasseUsd = Math.min(e.budget.capUsd, e.budget.depenseUsd + a.afficheUsdMicros / 1_000_000);
  return { ok: true, capPasseUsd: Math.round(capPasseUsd * 1_000_000) / 1_000_000, confirmeUsdMicros: a.afficheUsdMicros };
}

/** Budget du pas 2 · le budget d'essai moins TOUT ce qui est déjà compté dans la base de recette. */
export function budgetPas2UsdMicros(e: { capUsd: number; depenseUsd: number }): number {
  const cap = Math.min(e.capUsd, BUDGET_ESSAI_USD);
  return Math.max(0, Math.floor((cap - e.depenseUsd) * 1_000_000));
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

export interface LigneDepenseRapport { provider: string; modele: string | null; action: string; reserveUsd: number; regleUsd: number }
export interface MouvementRegistre { kind: string; credits: number; usdMicros: number }

export interface DonneesRapportPas1 {
  mode: 'REEL' | 'SIMULE';
  horodatage: string;
  ids: { workspaceId: string; brandId: string; projectId: string; versionId: string | null; runId: string | null; devisId: string | null; jobId: string | null; assetId: string | null };
  annonce: AnnoncePas1;
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
  budgetPas2UsdMicros: number;
  arret: string | null;
}

const usd4 = (x: number) => `${x.toFixed(4).replace('.', ',')} $`;

/** Le rapport du pas 1 · Markdown, en français, sans tiret cadratin. */
export function rapportPas1(d: DonneesRapportPas1): string {
  const reserve = d.depenses.reduce((s, l) => s + l.reserveUsd, 0);
  const regle = d.depenses.reduce((s, l) => s + l.regleUsd, 0);
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
    `Annoncé avant tout appel · ${usdAffiche(d.annonce.afficheUsdMicros)} au plus (compilation ${usdAffiche(centimeSuperieur(d.annonce.compilationUsdMicros))}, image ${usdAffiche(centimeSuperieur(d.annonce.imageUsdMicros))}).`,
    `Confirmé par saisie · ${usdAffiche(d.confirmeUsdMicros)}. Barrière de la passe (plafond du processus) · ${d.capPasseUsd} $.`,
    '',
    '| Fournisseur | Modèle | Action | Réservé | Réglé |',
    '| --- | --- | --- | --- | --- |',
    ...(d.depenses.length ? d.depenses.map((l) => `| ${l.provider} | ${l.modele ?? '·'} | ${l.action} | ${usd4(l.reserveUsd)} | ${usd4(l.regleUsd)} |`) : ['| · | · | aucune dépense | 0 | 0 |']),
    `| **Total** | | | **${usd4(reserve)}** | **${usd4(regle)}** |`,
    '',
    'Registre du job (crédits internes et dollars) ·',
    ...(d.registre.length ? d.registre.map((m) => `- ${m.kind} · ${m.credits} crédit(s) · ${usdAffiche(m.usdMicros)}`) : ['- aucun mouvement']),
    '',
    '## Job',
    '',
    `État · ${d.etatJob ?? 'aucun job'}${d.raisonEchec ? ` · raison : ${d.raisonEchec}` : ''}`,
    `Qualité · ${d.qualite ?? '·'}`,
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
    `Budget restant pour le pas 2 (benchmark) · ${usdAffiche(d.budgetPas2UsdMicros)} (15 $ moins tout ce qui est compté dans la base de recette).`,
    '',
  ];
  return lignes.filter((l, i, t) => !(l === '' && t[i - 1] === '')).join('\n');
}
