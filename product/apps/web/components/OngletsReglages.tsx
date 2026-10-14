import { ongletsReglages, ongletsAdministration } from '@tiktrends/core';
import { BarreOnglets } from './BarreOnglets';
import { menuCompteOuvert, droitsAdministration } from '../lib/onglets-reglages';
import type { Session } from '../lib/auth';

/**
 * UX V2 · lot 4c · les onglets rendus DANS chaque page de Réglages et
 * d'Administration (pas dans la coquille). La liste vient du noyau
 * (`ongletsReglages`, `ongletsAdministration`) à partir des gardes réelles des
 * pages · un onglet n'apparaît que si sa page s'ouvre au rôle courant. Moins
 * de deux onglets → rien n'est rendu.
 *
 * La barre elle-même (`BarreOnglets`) défile horizontalement sur mobile.
 */
type SessionOnglets = Pick<Session, 'role' | 'plan' | 'user' | 'equipe'>;

export function OngletsReglages({ session, chemin }: { session: SessionOnglets; chemin: string }) {
  return <BarreOnglets zone="reglages" libelle="Réglages · rubriques" onglets={ongletsReglages(menuCompteOuvert(session), chemin)} />;
}

export function OngletsAdministration({ session, chemin }: { session: SessionOnglets; chemin: string }) {
  return <BarreOnglets zone="administration" libelle="Administration · rubriques" onglets={ongletsAdministration(droitsAdministration(session), chemin)} />;
}
