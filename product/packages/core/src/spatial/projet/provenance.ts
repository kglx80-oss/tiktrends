/**
 * Spatial · fiche projet · la PROVENANCE d'une référence (source) · ce que la
 * fiche V5 disait de chaque source et que la tuile « Références » de la
 * maquette ne portait pas : statut (retirée, accès retiré, depuis quand,
 * observations conservées), droit d'usage et empreinte, ressources lues,
 * narration absente, extrait autorisé. Pur · des phrases, testées.
 */

import { dateCourteUtc } from '../../studios/brief';
import { LIBELLES_DROIT_SOURCE, LIBELLES_STATUT_SOURCE, type SourceReferenceStudio } from '../../studios/sources/reference';
import { LIBELLES_ELEMENT, LIBELLES_MODALITE } from '../../studios/sources/modalites';

export interface ProvenanceSource {
  statut: SourceReferenceStudio['statut'];
  /** Le statut dit en clair · « Accessible », ou retirée avec sa date et « observations conservées ». */
  etat: string;
  lignes: string[];
}

export function provenanceSource(s: Pick<SourceReferenceStudio, 'statut' | 'revoqueeLe' | 'droit' | 'empreinte' | 'modalites' | 'absents' | 'extraitAutorise'>, aUnLien: boolean): ProvenanceSource {
  const retiree = s.statut !== 'active';
  const etat = `${LIBELLES_STATUT_SOURCE[s.statut]}${retiree && s.revoqueeLe ? ` · depuis le ${dateCourteUtc(s.revoqueeLe)} · observations conservées` : ''}`;
  const lignes = [
    `Droit · ${LIBELLES_DROIT_SOURCE[s.droit] ?? LIBELLES_DROIT_SOURCE.observation_publique} · empreinte ${s.empreinte.slice(0, 12)}`,
    `Ressources · ${s.modalites.length ? s.modalites.map((m) => LIBELLES_MODALITE[m]).join(', ') : 'aucune'}`,
  ];
  const narration = s.absents.find((a) => a.element === 'narration');
  if (narration) lignes.push(`${LIBELLES_ELEMENT.narration} · absente · ${narration.raison}`);
  if (s.extraitAutorise) lignes.push(`Extrait autorisé · « ${s.extraitAutorise} »`);
  if (retiree && !aUnLien) lignes.push('La source n’est plus accessible · aucun lien.');
  return { statut: s.statut, etat, lignes };
}

/** Les références illisibles ignorées · dites, jamais tues. */
export function phraseSourcesIllisibles(n: number): string | null {
  return n > 0 ? `${n} référence${n > 1 ? 's' : ''} de source illisible${n > 1 ? 's' : ''} · ignorée${n > 1 ? 's' : ''}.` : null;
}
