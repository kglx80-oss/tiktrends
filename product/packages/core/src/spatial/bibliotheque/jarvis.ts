import { parseAnswer, JARVIS_ACTIONS } from '../../adsmap/jarvis-actions';
import { extraireCitations } from '../../connaissances';
import { sansTiretCadratin } from '../../ponctuation-ecran';
import { STATUT_LOT_RESULTATS, tonStatutLot, lienLotApercu } from '../../adsmap/apercu-lots';

/**
 * Spatial · l'écran Jarvis (maquette `jarvis`) · RÈGLES PURES. Ce que la
 * colonne d'archives affiche (date courte, extrait, recherche), le texte lisible
 * d'une réponse (marqueurs retirés, sans tiret cadratin) et les « Dernières
 * itérations » (les vrais lots de la marque). Ni base, ni réseau, ni modèle.
 */

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const jourDe = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const deux = (n: number) => String(n).padStart(2, '0');

/**
 * La date courte d'une conversation, comme la maquette · l'heure le jour même,
 * « hier », le jour de la semaine dans les six derniers jours, sinon « 18 oct. ».
 * Jours calendaires UTC (le serveur et le navigateur donnent la même chose).
 */
export function quandConversation(iso: string, maintenant: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const ecart = Math.round((jourDe(maintenant) - jourDe(d)) / 86_400_000);
  if (ecart <= 0) return `${deux(d.getUTCHours())}:${deux(d.getUTCMinutes())}`;
  if (ecart === 1) return 'hier';
  if (ecart < 7) return JOURS[d.getUTCDay()]!;
  return d.getUTCDate() === 1 ? `1er ${MOIS[d.getUTCMonth()]}` : `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
}

/** Il y a combien · « il y a 12 min », « il y a 3 h », « il y a 6 j », puis la date. */
export function ilYA(iso: string, maintenant: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const min = Math.max(0, Math.round((maintenant.getTime() - d.getTime()) / 60_000));
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  if (min < 24 * 60) return `il y a ${Math.round(min / 60)} h`;
  const j = Math.round(min / (24 * 60));
  if (j < 7) return `il y a ${j} j`;
  return quandConversation(iso, maintenant);
}

export interface ActionReponse { cle: string; libelle: string; href: string; effet: string }

/**
 * Une réponse de Jarvis, lisible · citations et marqueurs d'action retirés,
 * aucun tiret cadratin. Seules les actions de NAVIGATION (gratuites, une
 * adresse) sont gardées · le seul geste payant (« Écrire ce concept ») est lu à
 * part, coût annoncé avant le clic (`conceptPropose`, `jarvis-sources`).
 */
export function reponseLisible(brut: string): { texte: string; actions: ActionReponse[] } {
  const { texte } = extraireCitations(brut);
  const { text, actions } = parseAnswer(texte);
  return {
    texte: sansTiretCadratin(text),
    actions: actions.flatMap((a) => {
      const def = JARVIS_ACTIONS[a.key];
      return def.href && def.cost === null ? [{ cle: def.key, libelle: def.label, href: def.href, effet: def.effect }] : [];
    }),
  };
}

/** L'extrait d'une conversation dans les archives · texte plat, borné (maquette · 70 signes). */
export function extraitConversation(brut: string | null | undefined, max = 70): string {
  if (!brut) return '';
  const plat = reponseLisible(brut).texte.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return plat.length > max ? plat.slice(0, max) : plat;
}

const normaliser = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** La recherche des archives · dans le titre et l'extrait, sans accents ni casse. Vide = tout. */
export function filtrerConversations<T extends { titre: string; extrait: string }>(liste: readonly T[], recherche: string): T[] {
  const q = normaliser(recherche.trim());
  if (!q) return [...liste];
  return liste.filter((c) => normaliser(`${c.titre} ${c.extrait}`).includes(q));
}

export interface LotIteration { id: string; number: number; goal: string | null; status: string; createdAt: string; importe?: boolean }
export interface IterationRecente { id: string; titre: string; pastille: { classe: '' | 'g' | 'c' | 'w'; libelle: string }; quand: string; href: string }

const CLASSE_TON = { diffusion: 'c', termine: 'g', attente: 'w', importe: '' } as const;

/** « Dernières itérations » · les lots réels de la marque, du plus récent au plus ancien (quatre au plus). */
export function iterationsRecentes(lots: readonly LotIteration[], maintenant: Date, max = 4): IterationRecente[] {
  return [...lots].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.number - a.number).slice(0, max).map((l) => ({
    id: l.id,
    titre: `Lot #${l.number}${l.goal?.trim() ? ` · ${sansTiretCadratin(l.goal.trim())}` : ''}`,
    pastille: { classe: CLASSE_TON[tonStatutLot(l.status, !!l.importe)], libelle: STATUT_LOT_RESULTATS[l.status] ?? l.status },
    quand: ilYA(l.createdAt, maintenant),
    href: lienLotApercu(l.id),
  }));
}

/** La longueur maximale d'une question préparée · celle du champ de saisie. */
export const LONGUEUR_MAX_QUESTION_JARVIS = 4000;

/**
 * La question passée par l'adresse (`/jarvis?q=…`, barre Jarvis de l'Accueil)
 * · un BROUILLON, jamais envoyé seul. Première valeur si le paramètre est
 * répété, balises et caractères de contrôle retirés (le retour à la ligne est
 * gardé), espaces resserrés, bornée à la longueur du champ. Vide = rien à préparer.
 */
export function lireQuestionJarvis(v: string | readonly string[] | null | undefined): string {
  const brut = Array.isArray(v) ? v[0] : v;
  if (typeof brut !== 'string') return '';
  return brut
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, ' ')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, LONGUEUR_MAX_QUESTION_JARVIS)
    .trim();
}
