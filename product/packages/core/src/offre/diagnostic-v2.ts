/**
 * L'offre · « Prêt pour l'offre V2 ? » · le contrôle, ligne par ligne, de ce
 * que le propriétaire doit poser dans Stripe et dans `.env.deploy` avant
 * d'allumer `TARIFS_V2` (`docs/FACTURATION-STRIPE.md`). Pur · aucune clé,
 * aucun appel · le serveur lit Stripe (lecture seule) et l'environnement, puis
 * remet ici des FAITS · présence d'une variable (un booléen, jamais sa
 * valeur), mode de la clé (déduit de son préfixe), prix lus. Les montants
 * attendus viennent de la source unique (`forfaits.ts`), jamais d'ailleurs.
 *
 * Gardé par `offre-diagnostic-v2.test.ts` (règle) et
 * `apps/web/test/offre-v2-diagnostic.test.tsx` (écran, client Stripe simulé).
 */
import { FORFAITS_V2, FORFAITS_V2_ORDRE, prixEcheanceTtc, rechargesV2, type CleForfaitV2, type Facturation } from './forfaits';
import { variablePrixForfait, variablePrixRecharge } from './stripe';

export type StatutControleV2 = 'ok' | 'a_faire' | 'erreur';

export interface LigneControleV2 {
  /** Identifiant stable de la ligne (nom de variable, ou `stripe-tax`, `webhook`…). */
  cle: string;
  libelle: string;
  statut: StatutControleV2;
  /** Ce qui a été constaté. */
  detail: string;
  /** Le geste correctif · `null` quand la ligne est conforme. */
  geste: string | null;
}

export interface DiagnosticOffreV2 {
  lignes: LigneControleV2[];
  /** Tout est conforme (l'interrupteur `TARIFS_V2` mis à part). */
  pret: boolean;
  tarifsV2: boolean;
  /** La phrase finale · « Tout est prêt… » ou ce qui manque. */
  phrase: string;
}

/**
 * Les événements que le webhook traite (`routeStripeEvent`,
 * `apps/web/lib/stripe-events.ts`) · l'endpoint doit tous les envoyer. Une
 * garde web compare cette liste aux `case` du routeur.
 */
export const EVENEMENTS_WEBHOOK_STRIPE: readonly string[] = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
];

/** Délai de chaque lecture Stripe du contrôle · court : Stripe répond d'ordinaire en moins d'une seconde. */
export const DELAI_LECTURE_STRIPE_MS = 6000;

/* ───────────────────────── Clé et secrets ───────────────────────── */

export type ModeCleStripe = 'reel' | 'test' | 'inconnu';

/** Le mode d'une clé secrète, par son PRÉFIXE seulement · `null` si absente. */
export function modeCleStripe(cle: string | null | undefined): ModeCleStripe | null {
  const c = (cle ?? '').trim();
  if (!c) return null;
  if (/^(sk|rk)_live_/.test(c)) return 'reel';
  if (/^(sk|rk)_test_/.test(c)) return 'test';
  return 'inconnu';
}

/**
 * Masque tout ce qui ressemble à un secret Stripe dans un texte (un message
 * d'erreur de Stripe peut citer une partie de la clé) · seul le préfixe reste.
 */
export function masquerSecrets(texte: string): string {
  return texte.replace(/\b(sk|rk|pk)_(live|test)_[A-Za-z0-9_*]+/g, '$1_$2_[masquée]').replace(/\bwhsec_[A-Za-z0-9_*]+/g, 'whsec_[masqué]');
}

/* ───────────────────────── Prix attendus ───────────────────────── */

export interface PrixAttenduV2 {
  variable: string;
  libelle: string;
  centimes: number;
  /** Récurrence attendue · `null` pour un prix ponctuel (recharge). */
  intervalle: 'month' | 'year' | null;
}

const INTERVALLE: Record<Facturation, 'month' | 'year'> = { mensuel: 'month', annuel: 'year' };

/** Les six prix d'abonnement, puis les neuf recharges, au montant TTC de la source unique. */
export function prixAttendusV2(): { forfaits: PrixAttenduV2[]; recharges: PrixAttenduV2[] } {
  const forfaits = FORFAITS_V2_ORDRE.flatMap((f: CleForfaitV2) => (['mensuel', 'annuel'] as const).map((p) => ({
    variable: variablePrixForfait(f, p),
    libelle: `${FORFAITS_V2[f].libelle} ${p}`,
    centimes: Math.round(prixEcheanceTtc(f, p) * 100),
    intervalle: INTERVALLE[p],
  })));
  const recharges = FORFAITS_V2_ORDRE.flatMap((f) => rechargesV2(f).map((r) => ({
    variable: variablePrixRecharge(f, r.credits),
    libelle: `Recharge ${FORFAITS_V2[f].libelle} · ${r.credits.toLocaleString('fr-FR')} crédits`,
    centimes: Math.round(r.eur * 100),
    intervalle: null,
  })));
  return { forfaits, recharges };
}

/** Un prix tel que lu dans Stripe, réduit à ce que le contrôle regarde. */
export interface PrixLu {
  id: string;
  actif: boolean;
  devise: string;
  /** `unit_amount` · `null` pour un prix au montant libre. */
  centimes: number | null;
  type: string;
  intervalle: string | null;
  nbIntervalles: number | null;
  /** `tax_behavior` · `inclusive` attendu. */
  taxe: string | null;
  /** `livemode` du prix. */
  reel: boolean;
}

const eurosTtc = (centimes: number) => `${(centimes / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const RYTHME: Record<string, string> = { month: 'mensuel', year: 'annuel' };
const UNITE: Record<string, string> = { day: 'jours', week: 'semaines', month: 'mois', year: 'ans' };

/**
 * Les écarts d'un prix lu face au prix attendu · `[]` quand il est conforme.
 * `mode` · le mode de la clé (un prix d'un autre mode est introuvable en vrai,
 * mais un faux positif reste possible avec une clé restreinte).
 */
export function ecartsPrix(attendu: PrixAttenduV2, lu: PrixLu, mode?: ModeCleStripe | null): string[] {
  const e: string[] = [];
  if (!lu.actif) e.push('prix archivé dans Stripe');
  if (lu.devise.toLowerCase() !== 'eur') e.push(`devise ${lu.devise.toUpperCase()} au lieu d’EUR`);
  if (lu.centimes !== attendu.centimes) e.push(`montant ${lu.centimes === null ? 'libre' : eurosTtc(lu.centimes)} au lieu de ${eurosTtc(attendu.centimes)}`);
  if (attendu.intervalle) {
    if (lu.type !== 'recurring') e.push('prix ponctuel au lieu d’un prix récurrent');
    else if (lu.intervalle !== attendu.intervalle || (lu.nbIntervalles ?? 1) !== 1) {
      const n = lu.nbIntervalles ?? 1;
      const lue = n > 1 ? `tous les ${n} ${UNITE[lu.intervalle ?? ''] ?? lu.intervalle}` : (RYTHME[lu.intervalle ?? ''] ?? lu.intervalle ?? 'inconnue');
      e.push(`récurrence ${lue} au lieu de ${RYTHME[attendu.intervalle]}`);
    }
  } else if (lu.type !== 'one_time') {
    e.push('prix récurrent au lieu d’un prix ponctuel');
  }
  if (lu.taxe !== 'inclusive') e.push(`taxe ${lu.taxe === 'exclusive' ? 'exclue' : 'non précisée'} au lieu de taxe incluse`);
  if (mode && mode !== 'inconnu' && lu.reel !== (mode === 'reel')) e.push(`prix du mode ${lu.reel ? 'réel' : 'test'} avec une clé de ${mode === 'reel' ? 'mode réel' : 'test'}`);
  return e;
}

/* ───────────────────────── Lecture Stripe (faits) ───────────────────────── */

type OuErreur<T> = T | { erreur: string };
const enErreur = (v: unknown): v is { erreur: string } => !!v && typeof v === 'object' && 'erreur' in v;

export interface LectureStripeV2 {
  /** Par identifiant de prix · le prix lu, ou pourquoi il ne l'a pas été. */
  prix: Readonly<Record<string, { prix: PrixLu } | { introuvable: string } | { erreur: string }>>;
  taxe: OuErreur<{ statut: string; manquants: readonly string[] }>;
  webhooks: OuErreur<{ endpoints: ReadonlyArray<{ url: string; actif: boolean; evenements: readonly string[] }> }>;
  portail: OuErreur<{ configurations: ReadonlyArray<{ parDefaut: boolean; changement: boolean; annulation: boolean; prix: readonly string[] }> }>;
}

export interface EntreeDiagnosticV2 {
  /** Mode de la clé secrète par son préfixe · `null` si absente. */
  cle: ModeCleStripe | null;
  secretWebhook: boolean;
  cronSecret: boolean;
  tarifsV2: boolean;
  /** Identifiants de prix posés, par nom de variable (un `price_…` n'est pas un secret). */
  idsPrix: Readonly<Record<string, string | undefined>>;
  /** L'URL attendue de l'endpoint webhook. */
  urlWebhook: string;
  /** Ce que Stripe a répondu · `{ injoignable }` si rien n'a répondu, `null` sans clé (rien n'a été lu). */
  stripe: LectureStripeV2 | { injoignable: string } | null;
}

/* ───────────────────────── Le diagnostic ───────────────────────── */

const ENV = 'dans .env.deploy sur le VPS, puis attends le redéploiement de la minute suivante';

function lignePrix(a: PrixAttenduV2, id: string | undefined, e: EntreeDiagnosticV2, doublons: ReadonlySet<string>): LigneControleV2 {
  const rythme = a.intervalle ? `récurrent ${RYTHME[a.intervalle]}` : 'ponctuel';
  const fiche = `${eurosTtc(a.centimes)} · EUR · ${rythme} · taxe incluse`;
  const base = { cle: a.variable, libelle: `${a.libelle} · ${a.variable}` };
  if (!id) return { ...base, statut: 'a_faire', detail: 'Variable absente.', geste: `Crée dans Stripe le prix ${fiche}, puis colle son identifiant price_… dans ${a.variable} ${ENV}.` };
  if (!id.startsWith('price_')) return { ...base, statut: 'erreur', detail: 'La valeur posée n’est pas un identifiant de prix (price_…).', geste: `Remplace-la par l’identifiant price_… du prix (${fiche}), jamais un lien de paiement.` };
  if (doublons.has(id)) return { ...base, statut: 'erreur', detail: `${id} est posé dans plusieurs variables.`, geste: 'Chaque variable doit porter son propre prix · vérifie le copier-coller.' };
  const s = e.stripe;
  if (!s || 'injoignable' in s) return { ...base, statut: 'a_faire', detail: `Posée (${id}) · non vérifiée dans Stripe.`, geste: s ? 'Relance « Vérifier » quand Stripe répond.' : 'Pose la clé secrète pour que le prix soit vérifié.' };
  const r = s.prix[id];
  if (!r) return { ...base, statut: 'a_faire', detail: `Posée (${id}) · non lue.`, geste: 'Relance « Vérifier ».' };
  if ('introuvable' in r) return { ...base, statut: 'erreur', detail: `${id} introuvable dans Stripe · souvent un prix créé dans l’autre mode (réel ou test).`, geste: `Crée le prix dans le mode de la clé (${fiche}) et remplace l’identifiant.` };
  if ('erreur' in r) return { ...base, statut: 'erreur', detail: `Lecture impossible · ${r.erreur}`, geste: 'Relance « Vérifier » dans un instant.' };
  const ecarts = ecartsPrix(a, r.prix, e.cle);
  if (ecarts.length) return { ...base, statut: 'erreur', detail: `${id} · ${ecarts.join(' · ')}.`, geste: `Stripe ne modifie pas le montant ni la récurrence d’un prix · crée un nouveau prix (${fiche}), colle son identifiant à la place, puis archive l’ancien.` };
  return { ...base, statut: 'ok', detail: `${id} · ${fiche} · actif.`, geste: null };
}

function ligneCle(e: EntreeDiagnosticV2): LigneControleV2 {
  const base = { cle: 'STRIPE_SECRET_KEY', libelle: 'Clé secrète · STRIPE_SECRET_KEY' };
  if (e.cle === null) return { ...base, statut: 'a_faire', detail: 'Absente · aucun paiement possible.', geste: `Pose la clé réelle sk_live_… ${ENV}.` };
  if (e.cle === 'test') return { ...base, statut: 'a_faire', detail: 'Posée · mode test (préfixe sk_test_) · aucun paiement réel n’est encaissé.', geste: 'Le mode test sert à répéter · avant d’allumer, remets la clé réelle sk_live_… et les six prix réels.' };
  if (e.cle === 'inconnu') return { ...base, statut: 'erreur', detail: 'Posée · préfixe non reconnu (ni sk_live_ ni sk_test_).', geste: 'Recopie la clé secrète depuis Stripe · Développeurs · Clés API.' };
  return { ...base, statut: 'ok', detail: 'Posée · mode réel (préfixe sk_live_).', geste: null };
}

const presence = (cle: string, libelle: string, pose: boolean, absent: string, geste: string): LigneControleV2 =>
  pose ? { cle, libelle, statut: 'ok', detail: 'Posée.', geste: null } : { cle, libelle, statut: 'a_faire', detail: absent, geste };

function ligneTaxe(s: LectureStripeV2): LigneControleV2 {
  const base = { cle: 'stripe-tax', libelle: 'Stripe Tax' };
  if (enErreur(s.taxe)) return { ...base, statut: 'erreur', detail: `Lecture impossible · ${s.taxe.erreur}`, geste: 'Vérifie dans Stripe · Paramètres · Taxes.' };
  if (s.taxe.statut === 'active') return { ...base, statut: 'ok', detail: 'Activé · la TVA est calculée à l’intérieur des prix TTC.', geste: null };
  const manque = s.taxe.manquants.length ? ` · manque : ${s.taxe.manquants.join(', ')}` : '';
  return { ...base, statut: 'a_faire', detail: `Non activé (${s.taxe.statut})${manque} · Stripe refuserait chaque paiement V2.`, geste: 'Stripe · Paramètres · Taxes · adresse d’origine, code SaaS professionnel, inscription France, prix taxe incluse.' };
}

function ligneWebhook(s: LectureStripeV2, url: string): LigneControleV2 {
  const base = { cle: 'webhook', libelle: 'Endpoint webhook' };
  if (enErreur(s.webhooks)) return { ...base, statut: 'erreur', detail: `Lecture impossible · ${s.webhooks.erreur}`, geste: 'Vérifie dans Stripe · Développeurs · Webhooks.' };
  const mien = s.webhooks.endpoints.find((w) => w.url === url);
  if (!mien) return { ...base, statut: 'a_faire', detail: `Aucun endpoint sur ${url}.`, geste: `Stripe · Développeurs · Webhooks · ajoute ${url} avec ${EVENEMENTS_WEBHOOK_STRIPE.join(', ')}.` };
  if (!mien.actif) return { ...base, statut: 'erreur', detail: `${url} existe mais est désactivé.`, geste: 'Réactive l’endpoint dans Stripe · Développeurs · Webhooks.' };
  const manquants = mien.evenements.includes('*') ? [] : EVENEMENTS_WEBHOOK_STRIPE.filter((ev) => !mien.evenements.includes(ev));
  if (manquants.length) return { ...base, statut: 'a_faire', detail: `N’écoute pas : ${manquants.join(', ')}.`, geste: 'Ajoute ces événements à l’endpoint · sans eux, un client paie et n’est pas crédité.' };
  return { ...base, statut: 'ok', detail: `${url} · actif · écoute les ${EVENEMENTS_WEBHOOK_STRIPE.length} événements traités.`, geste: null };
}

function lignePortail(s: LectureStripeV2, prixForfaits: ReadonlyArray<{ variable: string; id: string | undefined }>): LigneControleV2 {
  const base = { cle: 'portail', libelle: 'Portail client' };
  if (enErreur(s.portail)) return { ...base, statut: 'erreur', detail: `Lecture impossible · ${s.portail.erreur}`, geste: 'Vérifie dans Stripe · Paramètres · Facturation · Portail client.' };
  const conf = s.portail.configurations.find((c) => c.parDefaut) ?? null;
  const geste = 'Stripe · Paramètres · Facturation · Portail client · autorise l’annulation et le changement d’abonnement entre les six prix V2.';
  if (!conf) return { ...base, statut: 'a_faire', detail: 'Aucune configuration active par défaut · « Gérer mon abonnement » échouera.', geste };
  const soucis: string[] = [];
  if (!conf.annulation) soucis.push('annulation fermée');
  if (!conf.changement) soucis.push('changement d’abonnement fermé');
  else {
    const absents = prixForfaits.filter((p) => p.id && !conf.prix.includes(p.id)).map((p) => p.variable);
    if (absents.length) soucis.push(`prix non proposés au changement : ${absents.join(', ')}`);
  }
  const nonPoses = prixForfaits.filter((p) => !p.id).length;
  if (soucis.length) return { ...base, statut: 'a_faire', detail: `${soucis.join(' · ')}.`, geste };
  if (nonPoses) return { ...base, statut: 'a_faire', detail: `Annulation et changement ouverts · ${nonPoses} prix V2 pas encore posé${nonPoses > 1 ? 's' : ''}, donc non contrôlé${nonPoses > 1 ? 's' : ''}.`, geste: 'Pose d’abord les six prix, puis relance « Vérifier ».' };
  return { ...base, statut: 'ok', detail: 'Annulation ouverte · changement possible entre les six prix V2.', geste: null };
}

/** Le diagnostic complet · chaque ligne, le verdict, la phrase finale. */
export function diagnosticOffreV2(e: EntreeDiagnosticV2): DiagnosticOffreV2 {
  const attendus = prixAttendusV2();
  const lignes: LigneControleV2[] = [];
  lignes.push(ligneCle(e));
  lignes.push(presence('STRIPE_WEBHOOK_SECRET', 'Secret du webhook · STRIPE_WEBHOOK_SECRET', e.secretWebhook, 'Absent · Stripe signe ses notifications et l’appli les rejetterait toutes.', `Copie le secret de signature (whsec_…) de l’endpoint et pose-le dans STRIPE_WEBHOOK_SECRET ${ENV}.`));

  const tous = [...attendus.forfaits, ...attendus.recharges].map((a) => e.idsPrix[a.variable]).filter((v): v is string => !!v);
  const doublons = new Set(tous.filter((id, i) => tous.indexOf(id) !== i));
  for (const a of attendus.forfaits) lignes.push(lignePrix(a, e.idsPrix[a.variable], e, doublons));

  const recharges = attendus.recharges.filter((a) => e.idsPrix[a.variable]);
  for (const a of recharges) lignes.push(lignePrix(a, e.idsPrix[a.variable], e, doublons));
  const vides = attendus.recharges.length - recharges.length;
  if (vides) {
    lignes.push({
      cle: 'recharges', libelle: 'Recharges · STRIPE_PRICE_RECHARGE_…', statut: 'ok',
      detail: `${vides} recharge${vides > 1 ? 's' : ''} sur ${attendus.recharges.length} sans prix Stripe (facultatif) · l’appli envoie un prix en ligne TTC au montant de la grille, taxe incluse.`, geste: null,
    });
  }
  lignes.push(presence('CRON_SECRET', 'Tâches planifiées · CRON_SECRET', e.cronSecret, 'Absent · ni l’allocation mensuelle des annuels ni la bascule des abonnés actuels ne partiront.', `Pose CRON_SECRET ${ENV} (s’il fait tourner les radars, il est déjà là).`));

  const s = e.stripe;
  if (s && 'injoignable' in s) {
    lignes.push({ cle: 'lecture-stripe', libelle: 'Lecture Stripe', statut: 'erreur', detail: s.injoignable, geste: 'Rien n’est conclu sur les prix, Stripe Tax, le webhook et le portail · relance « Vérifier » dans un instant.' });
  } else if (s) {
    lignes.push(ligneTaxe(s));
    lignes.push(ligneWebhook(s, e.urlWebhook));
    lignes.push(lignePortail(s, attendus.forfaits.map((a) => ({ variable: a.variable, id: e.idsPrix[a.variable] }))));
  } else {
    lignes.push({ cle: 'lecture-stripe', libelle: 'Lecture Stripe', statut: 'a_faire', detail: 'Sans clé secrète, Stripe Tax, le webhook et le portail ne peuvent pas être lus.', geste: 'Pose la clé secrète, puis relance « Vérifier ».' });
  }

  const manque = lignes.filter((l) => l.statut !== 'ok');
  const pret = manque.length === 0;
  lignes.push(e.tarifsV2
    ? { cle: 'TARIFS_V2', libelle: 'Interrupteur · TARIFS_V2', statut: pret ? 'ok' : 'erreur', detail: pret ? 'Posé · l’offre V2 est servie.' : 'Posé alors que la configuration est incomplète · des paiements V2 peuvent échouer.', geste: pret ? null : 'Retire TARIFS_V2 de .env.deploy le temps de corriger, ou corrige tout de suite les lignes ci-dessus.' }
    : { cle: 'TARIFS_V2', libelle: 'Interrupteur · TARIFS_V2', statut: 'a_faire', detail: 'Non posé · la page Forfaits et le paiement restent ceux d’aujourd’hui.', geste: pret ? `Pose TARIFS_V2=1 ${ENV}.` : 'À poser en dernier, quand toutes les lignes ci-dessus sont OK.' });

  const liste = manque.map((l) => l.libelle).join(' · ');
  const phrase = pret
    ? (e.tarifsV2 ? 'Tout est prêt · TARIFS_V2 est posé, l’offre V2 est en ligne.' : 'Tout est prêt, tu peux poser TARIFS_V2=1')
    : (e.tarifsV2 ? `TARIFS_V2 est posé alors qu’il manque : ${liste}` : `Il manque encore : ${liste}`);
  return { lignes, pret, tarifsV2: e.tarifsV2, phrase };
}
