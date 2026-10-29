import { TRIS_VEILLE, lienVeille, lireCriteresVeille, pucesVeille, type CriteresVeille } from './recherche';
import { CPM_VEILLE_DEFAUT } from './carte';

/**
 * Spatial · Veille · les VUES ENREGISTRÉES de l'explorateur (pur).
 *
 * Une vue = un nom + les paramètres d'adresse de « Pubs du moment ». L'écran
 * relit déjà tout son état dans l'adresse (`lireCriteresVeille`) · garder une
 * vue, c'est donc garder cette adresse sous un nom, et l'ouvrir, c'est y
 * retourner. Rien d'autre n'est conservé · ni annonce, ni résultat de la
 * source, ni page.
 *
 * Les règles vivent ici (nom, liste blanche des paramètres, plafond,
 * doublons) · les actions serveur (`app/actions/veille-vues.ts`) et l'écran
 * s'appuient sur ce module, ils n'en redéfinissent aucune.
 */

/**
 * Les paramètres d'adresse CONSERVÉS · exactement ceux que l'explorateur lit
 * (`lireCriteresVeille`), moins la page · une vue décrit des filtres, pas une
 * position dans les résultats. `rv` (retour), `refresh`, `jarvis` (phrase à
 * analyser, aussitôt redirigée) et toute autre clé sont refusés.
 */
export const PARAMS_VUE_VEILLE = ['j', 'q', 'p', 'searchIn', 'media', 'sort', 'status', 'country', 'vue', 'cpm'] as const;
export type ParamVueVeille = (typeof PARAMS_VUE_VEILLE)[number];
const ADMIS = new Set<string>(PARAMS_VUE_VEILLE);

/**
 * Un nom de vue devient un ONGLET de la barre (`.xtabs`, à côté de « Toutes les
 * pubs », 15 caractères). 40 caractères laissent un nom parlant (« Sérums
 * vidéo · Belgique · scaling », 33) sans transformer l'onglet en phrase ·
 * l'onglet est de toute façon tronqué à l'écran (points de suspension, nom
 * complet en infobulle), la borne protège la lecture, pas la mise en page.
 */
export const LONGUEUR_MAX_NOM_VUE_VEILLE = 40;

/**
 * Au plus 12 vues par personne et par espace. Deux raisons, mesurables :
 *  · la barre · 3 onglets fixes + 12 vues font déjà un rang qui défile ; au-delà,
 *    une vue ne se retrouve plus d'un coup d'œil et le raccourci perd son sens ;
 *  · le stockage · une vue pèse au plus ≈ 600 octets (nom 40, texte 200,
 *    phrase 200, le reste < 100) · 12 vues tiennent sous 8 Ko dans UNE ligne
 *    `app_settings`, relue à chaque affichage de la Veille.
 */
export const PLAFOND_VUES_VEILLE = 12;

export interface VueVeilleEnregistree {
  id: string;
  nom: string;
  /** Les paramètres CANONIQUES (liste blanche, valeurs validées, défauts retirés). */
  params: Readonly<Record<string, string>>;
  creeLe: string;
}

export type VerdictVue<T> = ({ ok: true } & T) | { ok: false; raison: string };

const sansAccents = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr-FR');

/** Le nom d'une vue · espaces resserrés, ni vide, ni trop long, ni caractère de contrôle. */
export function validerNomVueVeille(nom: unknown): VerdictVue<{ nom: string }> {
  if (typeof nom !== 'string') return { ok: false, raison: 'Nom de vue invalide.' };
  // Un caractère de contrôle (hors blancs) casserait l'onglet · refusé avant le resserrage.
  if (/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/.test(nom)) return { ok: false, raison: 'Le nom ne peut pas contenir de caractère de contrôle.' };
  const propre = nom.replace(/\s+/g, ' ').trim();
  if (!propre) return { ok: false, raison: 'Donne un nom à la vue.' };
  if (propre.length > LONGUEUR_MAX_NOM_VUE_VEILLE) return { ok: false, raison: `Nom trop long (${LONGUEUR_MAX_NOM_VUE_VEILLE} caractères au plus).` };
  return { ok: true, nom: propre };
}

/** Les paramètres canoniques de critères déjà lus (la page courante est ignorée). */
export function paramsVueVeille(c: CriteresVeille): Record<string, string> {
  // `lienVeille` retire la page, le CPM et la vue par défaut, et ordonne les clés.
  const qs = lienVeille(c).split('?')[1] ?? '';
  return Object.fromEntries(new URLSearchParams(qs));
}

/** L'adresse d'une vue · c'est aussi sa clé de comparaison (canonique). */
export function adresseVueVeille(params: Readonly<Record<string, string>>): string {
  return lienVeille(lireCriteresVeille({ ...params }));
}

/**
 * Valide des paramètres REÇUS (formulaire, client) · toute clé hors liste
 * blanche est REFUSÉE (pas ignorée en silence), toute valeur que
 * l'explorateur ne lirait pas aussi. Sans aucun filtre, refusé · c'est déjà
 * « Toutes les pubs ».
 */
export function validerParamsVueVeille(brut: unknown): VerdictVue<{ params: Record<string, string>; adresse: string }> {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return { ok: false, raison: 'Filtres de la vue invalides.' };
  const recu: Record<string, string> = {};
  for (const [k, v] of Object.entries(brut as Record<string, unknown>)) {
    if (!ADMIS.has(k)) return { ok: false, raison: `Le paramètre « ${k.slice(0, 30)} » n’est pas gardé dans une vue.` };
    if (typeof v !== 'string') return { ok: false, raison: `Valeur invalide pour « ${k} ».` };
    if (v.trim()) recu[k] = v;
  }
  const c = lireCriteresVeille(recu);
  for (const k of Object.keys(recu)) {
    // Les défauts sont admis (et retirés) · toute autre valeur doit être relue par l'explorateur.
    if (k === 'vue' && recu[k] === 'tout') continue;
    if (k === 'cpm' && Number(recu[k]) === CPM_VEILLE_DEFAUT) continue;
    if (c[k as keyof CriteresVeille] === undefined) return { ok: false, raison: `Valeur refusée pour « ${k} ».` };
  }
  const params = paramsVueVeille(c);
  if (Object.keys(params).length === 0) return { ok: false, raison: 'Aucun filtre à garder · sans critère, c’est déjà « Toutes les pubs ».' };
  return { ok: true, params, adresse: adresseVueVeille(params) };
}

/** Ce que garde une vue, en mots · les puces de l'explorateur, plus texte, vue, tri et CPM. */
export function libellesVueVeille(params: Readonly<Record<string, string>>): string[] {
  const c = lireCriteresVeille({ ...params });
  const out: string[] = [];
  if (c.vue === 'tendance') out.push('Tendance');
  if (c.vue === 'suivies') out.push('Suivies');
  if (c.q) out.push(`« ${c.q} »`);
  for (const p of pucesVeille(c)) out.push(p.libelle);
  if (c.status === 'all') out.push('Toutes diffusions');
  if (c.sort) out.push(`Tri : ${TRIS_VEILLE.find(([k]) => k === c.sort)?.[1] ?? c.sort}`);
  if (c.cpm && c.cpm !== CPM_VEILLE_DEFAUT) out.push(`CPM ${c.cpm} €`);
  return out;
}

/** La vue dont l'adresse est celle de l'écran (page ignorée) · `null` sinon. */
export function vueActiveVeille(vues: ReadonlyArray<VueVeilleEnregistree>, c: CriteresVeille): string | null {
  const ici = lienVeille(c);
  return vues.find((v) => adresseVueVeille(v.params) === ici)?.id ?? null;
}

/**
 * Ces filtres peuvent-ils devenir une NOUVELLE vue, avant même de la nommer ?
 * Plafond atteint, paramètres refusés, filtres déjà gardés · la raison, sinon
 * `null`. L'écran ferme le geste avec elle · l'action la redit (même règle).
 */
export function fermetureNouvelleVueVeille(vues: ReadonlyArray<VueVeilleEnregistree>, params: unknown): VerdictVue<{ params: Record<string, string>; adresse: string }> {
  if (vues.length >= PLAFOND_VUES_VEILLE) return { ok: false, raison: `Tu gardes déjà ${PLAFOND_VUES_VEILLE} vues · supprimes-en une pour en garder une nouvelle.` };
  const p = validerParamsVueVeille(params);
  if (!p.ok) return p;
  const memesFiltres = vues.find((v) => adresseVueVeille(v.params) === p.adresse);
  if (memesFiltres) return { ok: false, raison: `Ces filtres sont déjà gardés dans la vue « ${memesFiltres.nom} ».` };
  return p;
}

/** Ajoute une vue · plafond, nom déjà pris, filtres déjà gardés · chacun refusé avec sa raison. */
export function ajouterVueVeille(
  vues: ReadonlyArray<VueVeilleEnregistree>,
  nouvelle: { id: string; nom: unknown; params: unknown; creeLe: string },
): VerdictVue<{ vues: VueVeilleEnregistree[]; vue: VueVeilleEnregistree }> {
  const p = fermetureNouvelleVueVeille(vues, nouvelle.params);
  if (!p.ok) return p;
  const n = validerNomVueVeille(nouvelle.nom);
  if (!n.ok) return n;
  const memeNom = vues.find((v) => sansAccents(v.nom) === sansAccents(n.nom));
  if (memeNom) return { ok: false, raison: `Une vue s’appelle déjà « ${memeNom.nom} ».` };
  const vue: VueVeilleEnregistree = { id: nouvelle.id, nom: n.nom, params: p.params, creeLe: nouvelle.creeLe };
  return { ok: true, vues: [...vues, vue], vue };
}

/** Renomme une vue · même règle de nom, et pas le nom d'une AUTRE vue. */
export function renommerVueVeille(vues: ReadonlyArray<VueVeilleEnregistree>, id: unknown, nom: unknown): VerdictVue<{ vues: VueVeilleEnregistree[] }> {
  const i = vues.findIndex((v) => v.id === id);
  if (i < 0) return { ok: false, raison: 'Vue introuvable · recharge la page.' };
  const n = validerNomVueVeille(nom);
  if (!n.ok) return n;
  const autre = vues.find((v, j) => j !== i && sansAccents(v.nom) === sansAccents(n.nom));
  if (autre) return { ok: false, raison: `Une vue s’appelle déjà « ${autre.nom} ».` };
  return { ok: true, vues: vues.map((v, j) => (j === i ? { ...v, nom: n.nom } : v)) };
}

/** Retire une vue · introuvable se dit (jamais un faux « supprimée »). */
export function retirerVueVeille(vues: ReadonlyArray<VueVeilleEnregistree>, id: unknown): VerdictVue<{ vues: VueVeilleEnregistree[] }> {
  if (!vues.some((v) => v.id === id)) return { ok: false, raison: 'Vue introuvable · recharge la page.' };
  return { ok: true, vues: vues.filter((v) => v.id !== id) };
}

/** La question posée avant de supprimer · ce qui disparaît, et ce qui reste. */
export function confirmationSuppressionVueVeille(nom: string): string {
  return `Supprimer la vue « ${nom} » ? Les annonces ne changent pas · seul ce raccourci disparaît.`;
}

/**
 * Relit une liste STOCKÉE · défensif : une entrée qui ne passerait plus les
 * règles d'aujourd'hui (nom, paramètres) est écartée, un identifiant en double
 * aussi, et la liste est bornée au plafond. La lecture n'écrit jamais.
 */
export function lireVuesVeilleStockees(brut: unknown): VueVeilleEnregistree[] {
  if (!Array.isArray(brut)) return [];
  const out: VueVeilleEnregistree[] = [];
  const ids = new Set<string>();
  for (const x of brut) {
    if (out.length >= PLAFOND_VUES_VEILLE) break;
    if (!x || typeof x !== 'object') continue;
    const e = x as Record<string, unknown>;
    if (typeof e.id !== 'string' || !e.id || e.id.length > 64 || ids.has(e.id)) continue;
    const n = validerNomVueVeille(e.nom);
    const p = validerParamsVueVeille(e.params);
    if (!n.ok || !p.ok) continue;
    ids.add(e.id);
    out.push({ id: e.id, nom: n.nom, params: p.params, creeLe: typeof e.creeLe === 'string' ? e.creeLe : '' });
  }
  return out;
}

