/**
 * Spatial · le panneau Notifications de la coquille (maquette : `renderNotif`,
 * `nItem`, fragment `docs/spatial/reference/_notifications.html`). Pur.
 *
 * La maquette classe ses notifications par catégorie (Jarvis, Résultats, Veille,
 * Produit) et laisse filtrer. Ici, chaque catégorie repose sur un TYPE réellement
 * émis par l'application (table `notifications`, colonne `type`) :
 *  · `digest` · le récap de Jarvis (cron hebdomadaire) → Jarvis ;
 *  · `tracker`, `radar` · nouvelles créas des marques suivies, compte rendu du
 *    radar → Veille ;
 *  · `ticket_new`, `ticket_reply`, `ticket_status` · le support → Support.
 * « Résultats » et « Produit » n'ont aujourd'hui aucun émetteur · leur filtre
 * n'apparaît pas (un filtre toujours vide serait une porte morte). Un type
 * inconnu reste visible sous « Tout », avec une présentation neutre.
 *
 * Les préférences de la maquette (couper une catégorie) n'ont aucune donnée en
 * base · elles ne sont pas proposées. La suppression d'une notification non
 * plus (aucune action, et on ne supprime pas de données sans mandat).
 */

export type CategorieNotif = 'jarvis' | 'veille' | 'support' | 'autre';
export type FiltreNotif = 'tout' | Exclude<CategorieNotif, 'autre'>;

export interface PresentationNotif {
  categorie: CategorieNotif;
  /** Le libellé de la méta (`nmeta`) · « Jarvis », « Veille »… */
  libelle: string;
  /** Icône du sprite dans la pastille · `null` = l'orbe « J » de Jarvis. */
  icone: string | null;
  /** La teinte de la pastille (`nic t-…`, classes de la maquette). */
  teinte: 't-jarvis' | 't-veille' | 't-update' | 't-result' | 't-studio' | 't-billing';
}

const PAR_TYPE: Readonly<Record<string, PresentationNotif>> = {
  digest: { categorie: 'jarvis', libelle: 'Jarvis', icone: null, teinte: 't-jarvis' },
  tracker: { categorie: 'veille', libelle: 'Veille', icone: 'eye', teinte: 't-veille' },
  radar: { categorie: 'veille', libelle: 'Veille', icone: 'eye', teinte: 't-veille' },
  ticket_new: { categorie: 'support', libelle: 'Support', icone: 'chat', teinte: 't-update' },
  ticket_reply: { categorie: 'support', libelle: 'Support', icone: 'chat', teinte: 't-update' },
  ticket_status: { categorie: 'support', libelle: 'Support', icone: 'check', teinte: 't-update' },
};
const NEUTRE: PresentationNotif = { categorie: 'autre', libelle: 'TikTrends', icone: 'spark', teinte: 't-update' };

/** Les types réellement émis aujourd'hui (garde · un nouvel émetteur doit être classé). */
export const TYPES_NOTIF_CONNUS = Object.keys(PAR_TYPE);

export function presentationNotif(type: string): PresentationNotif {
  return PAR_TYPE[type] ?? NEUTRE;
}

/** Les filtres proposés, dans l'ordre de la maquette · seulement ceux qu'un émetteur réel nourrit. */
export const FILTRES_NOTIF: ReadonlyArray<{ cle: FiltreNotif; libelle: string }> = [
  { cle: 'tout', libelle: 'Tout' },
  { cle: 'jarvis', libelle: 'Jarvis' },
  { cle: 'veille', libelle: 'Veille' },
  { cle: 'support', libelle: 'Support' },
];

export interface NotifLue { id: string; type: string; read: boolean; createdAt: string }

export function notifDansFiltre(n: Pick<NotifLue, 'type'>, f: FiltreNotif): boolean {
  return f === 'tout' || presentationNotif(n.type).categorie === f;
}

/** Non lues par filtre · la pastille `i.nct` (absente à zéro). */
export function nonLuesParFiltre(items: ReadonlyArray<Pick<NotifLue, 'type' | 'read'>>): Record<FiltreNotif, number> {
  const out = { tout: 0, jarvis: 0, veille: 0, support: 0 } as Record<FiltreNotif, number>;
  for (const n of items) {
    if (n.read) continue;
    for (const f of FILTRES_NOTIF) if (notifDansFiltre(n, f.cle)) out[f.cle]++;
  }
  return out;
}

const memeJour = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** « Aujourd'hui » / « Plus tôt » (maquette : `n.today`) · le jour calendaire local. */
export function grouperNotifs<T extends Pick<NotifLue, 'createdAt'>>(items: readonly T[], maintenant: Date): { aujourdhui: T[]; plusTot: T[] } {
  const aujourdhui: T[] = [], plusTot: T[] = [];
  for (const n of items) (memeJour(new Date(n.createdAt), maintenant) ? aujourdhui : plusTot).push(n);
  return { aujourdhui, plusTot };
}

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/**
 * L'heure relative de la maquette · « à l'instant », « il y a 5 min »,
 * « il y a 3 h », « hier », « lun. », puis « 12 oct. ».
 */
export function quandNotif(iso: string, maintenant: Date): string {
  const d = new Date(iso);
  const min = Math.floor((maintenant.getTime() - d.getTime()) / 60_000);
  if (min < 1) return 'à l’instant';
  if (memeJour(d, maintenant)) return min < 60 ? `il y a ${min} min` : `il y a ${Math.floor(min / 60)} h`;
  const hier = new Date(maintenant); hier.setDate(hier.getDate() - 1);
  if (memeJour(d, hier)) return 'hier';
  const minuitIlYa6 = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() - 6);
  if (d >= minuitIlYa6) return JOURS[d.getDay()]!;
  return `${d.getDate()} ${MOIS[d.getMonth()]}`;
}

/** Le compteur de l'en-tête (`pill`) · « 3 non lues », absent à zéro. */
export function libelleNonLues(n: number): string | null {
  return n > 0 ? `${n} non lue${n > 1 ? 's' : ''}` : null;
}
