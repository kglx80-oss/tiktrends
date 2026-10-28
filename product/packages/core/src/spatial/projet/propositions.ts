/**
 * Spatial · fiche projet · ce que la carte d'une proposition DIT, porté de la
 * fiche V5 (`CarteProposition`, `PlanImpactVue`, `ConflitVersion`) · base
 * périmée annoncée AVANT le clic, expirée, appliquée, rejetée (avec leur
 * date), plan d'impact (touché, à refaire, réutilisé, obsolète, coût
 * indicatif NON débité, rien n'est généré), différences d'un conflit 409, et
 * la raison quand le rôle ne permet pas de trancher. Pur · des phrases.
 */

import { MENTION_SANS_GENERATION, texteValeur } from '../../studios/propositions/presentation';

/** Le rôle lit les propositions sans pouvoir les trancher · dit, jamais tu. */
export const RAISON_LECTEUR_PROPOSITIONS = 'Ton rôle permet de lire les propositions, pas de les trancher.';

/** Date et heure de Paris, courtes (`28/10 14:05`) · une valeur illisible est rendue telle quelle. */
export function dateHeureParis(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
}

export interface PropositionLue {
  etat: string;
  perimee: boolean;
  baseVersion: { n: number };
  expireLe: string | null;
  decideLe: string | null;
  versionAppliquee: { n: number } | null;
}

/** La note d'état d'une proposition · `null` quand il n'y a rien à dire de plus que son libellé. */
export function noteEtatProposition(p: PropositionLue, versionCouranteN: number): { ton: 'warn' | 'ok' | 'info'; texte: string } | null {
  const le = (iso: string | null) => (iso ? ` le ${dateHeureParis(iso)}` : '');
  if (p.etat === 'proposed' && p.perimee) {
    return { ton: 'warn', texte: `Base périmée · cette proposition vise la version ${p.baseVersion.n}, le projet est en version ${versionCouranteN}. L’appliquer renverra un conflit · recharge puis redemande.` };
  }
  if (p.etat === 'expired') return { ton: 'warn', texte: `Expirée${le(p.expireLe)} · elle ne peut plus être appliquée. Demande une nouvelle proposition sur la version courante.` };
  if (p.etat === 'approved' && p.versionAppliquee) return { ton: 'ok', texte: `Appliquée · version ${p.versionAppliquee.n} créée${le(p.decideLe)}. Rien n’a été généré ni débité.` };
  if (p.etat === 'rejected') return { ton: 'info', texte: `Rejetée${le(p.decideLe)} · rien n’a été modifié.` };
  return null;
}

interface Noeud { libelle: string; nature: string }
export interface ImpactLu { touchees: Noeud[]; aRefaire: Noeud[]; reutilisees: Noeud[]; obsoletes: Noeud[]; creditsIndicatifs: number; nonTarifees: string[] }

export interface LectureImpact {
  groupes: Array<{ titre: string; elements: string[]; vide: string }>;
  /** Aucun média produit pour la base · une phrase au lieu de groupes vides. */
  sansMedia: string | null;
  cout: string;
  mention: string;
}

const libelles = (n: Noeud[]) => {
  const l = n.slice(0, 12).map((x) => `${x.libelle}${x.nature === 'generation' ? ' · génération' : ''}`);
  return n.length > 12 ? [...l, `… et ${n.length - 12} autre(s)`] : l;
};

/** Le plan d'impact si l'on applique · calculé par le SERVEUR, dit ici en clair. `null` · indisponible. */
export function lectureImpact(impact: ImpactLu | null): LectureImpact | null {
  if (!impact) return null;
  const generations = impact.touchees.filter((n) => n.nature === 'generation').length;
  const medias = impact.reutilisees.length + impact.obsoletes.length > 0;
  const groupes = [{ titre: `Touché par ce changement · ${impact.touchees.length}`, elements: libelles(impact.touchees), vide: 'Rien d’autre que le document.' }];
  if (medias) {
    groupes.push(
      { titre: `À refaire · ${impact.aRefaire.length}`, elements: libelles(impact.aRefaire), vide: 'Rien à refaire.' },
      { titre: `Réutilisé · ${impact.reutilisees.length}`, elements: libelles(impact.reutilisees), vide: 'Aucun média existant réutilisé.' },
      { titre: `Obsolète · ${impact.obsoletes.length}`, elements: libelles(impact.obsoletes), vide: 'Aucun média rendu obsolète.' },
    );
  }
  const cout = (generations === 0
    ? 'Aucune génération touchée · seule la composition ou le montage serait recalculé.'
    : `Coût indicatif si tu génères ensuite · ${impact.creditsIndicatifs} crédit${impact.creditsIndicatifs > 1 ? 's' : ''} pour ${generations} génération${generations > 1 ? 's' : ''}, non débité · un devis sera demandé.`)
    + (impact.nonTarifees.length ? ` Sans tarif dans l’offre · ${impact.nonTarifees.join(', ')} (le devis les refusera).` : '');
  return {
    groupes,
    sansMedia: medias ? null : 'Aucun média n’a encore été produit pour cette version · rien n’est rendu obsolète, rien n’est perdu.',
    cout,
    mention: MENTION_SANS_GENERATION,
  };
}

/** Les différences base → courante d'un 409 · ce que l'autre onglet a fait (dix au plus, le reste compté). */
export function differencesConflit(differences: ReadonlyArray<{ chemin: string; base: unknown; courant: unknown }> | undefined): { lignes: Array<{ chemin: string; avant: string; apres: string }>; reste: number } {
  const d = differences ?? [];
  return { lignes: d.slice(0, 10).map((x) => ({ chemin: x.chemin, avant: texteValeur(x.base), apres: texteValeur(x.courant) })), reste: Math.max(0, d.length - 10) };
}
