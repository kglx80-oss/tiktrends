'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, lt, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  COLONNES_COMPTES_TOUR, COLONNES_INCIDENTS, COLONNES_REGISTRE_AUDIT, COLONNES_RENTABILITE_TOUR, COLONNES_TACHES_ADMIN, NOTES_MAX_INCIDENT, VALEUR_ABSENTE,
  adminDateCourte, cellulesCompteTour, cellulesRegistreAudit, cellulesTacheAdmin, mesurerDureesTaches, resolveurSeuils, tableRegistreAudit, tableTachesAdmin, cellulesRentabiliteTour, dansSegmentIncident, incidentAffiche, lireSegmentIncident,
  nomFichierExportTour, tableComptesTour, tableauCsv, validerClotureIncident, validerNoteIncident, validerOuvertureIncident,
  type ErreurIncident,
} from '@tiktrends/core';
import { FAMILY_LABEL, type ErrorFamily } from '../../lib/user-error';
import { chargerDureesTaches, chargerEspaces, chargerIncidentsDeclares, chargerRegistreAudit, chargerTachesAdmin, chargerTarifs, lignesRentabilite, porteAdminGeste } from '../(spatial)/sp/admin/donnees';

/**
 * Tour de contrôle · lot 14 V5 · les GESTES de la plateforme · exporter ce
 * que l'écran affiche (Comptes, Rentabilité, Incidents, puis, suivi
 * opérationnel, Tâches de génération et Registre d'audit) et ouvrir, annoter,
 * clore un incident déclaré.
 *
 * Dans l'ordre, et RIEN ne se lit ni ne s'écrit avant la porte :
 *  1. `porteAdminGeste` · la règle de `porteAdmin` (admin de l'espace ET
 *     fondateur), sans redirection · un refus est un message qui ne cite
 *     aucune donnée ;
 *  2. la saisie, vérifiée au noyau (`incidents-declares.ts`) ;
 *  3. la lecture ou l'écriture · l'export passe par les MÊMES fonctions que
 *     la page (`tableComptesTour`, `lignesRentabilite`, `incidentAffiche`),
 *     chaque cellule par `tableauCsv` → `csvCell` (formules neutralisées,
 *     secrets et adresses masqués).
 *
 * Aucune suppression · ni ici, ni en base (0075 la refuse). 0 $ · aucun modèle.
 */

const REFUS = 'Réservé au fondateur (plateforme) · rien n’a été lu ni modifié.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CAUSES = Object.keys(FAMILY_LABEL);
const libelleCause = (c: string) => FAMILY_LABEL[c as ErrorFamily] ?? c;

export type EcranExportTour = 'comptes' | 'rentabilite' | 'incidents' | 'taches' | 'audit';
export type ResultatExportTour = { ok: true; csv: string; nom: string; lignes: number } | { ok: false; message: string };

export async function exporterTourAction(entree: { ecran: EcranExportTour; q?: string; segment?: string }): Promise<ResultatExportTour> {
  const porte = await porteAdminGeste();
  if (!porte.ok) return { ok: false, message: REFUS };
  if (!db) return { ok: false, message: 'Base indisponible · rien n’a été exporté.' };
  const maintenant = new Date();
  const ecran = entree?.ecran;
  if (ecran === 'comptes') {
    const [tarifs, espaces] = await Promise.all([chargerTarifs(), chargerEspaces(maintenant)]);
    const t = tableComptesTour(espaces, tarifs, maintenant, { q: entree.q, segment: entree.segment });
    return { ok: true, csv: tableauCsv(COLONNES_COMPTES_TOUR, t.filtrees.map(cellulesCompteTour)), nom: nomFichierExportTour('comptes', maintenant), lignes: t.filtrees.length };
  }
  if (ecran === 'rentabilite') {
    const [tarifs, espaces] = await Promise.all([chargerTarifs(), chargerEspaces(maintenant)]);
    const lignes = lignesRentabilite(espaces, tarifs);
    return { ok: true, csv: tableauCsv(COLONNES_RENTABILITE_TOUR, lignes.map(cellulesRentabiliteTour)), nom: nomFichierExportTour('rentabilite', maintenant), lignes: lignes.length };
  }
  if (ecran === 'incidents') {
    const segment = lireSegmentIncident(entree.segment);
    const { incidents, nom } = await chargerIncidentsDeclares();
    const lignes = incidents.filter((i) => dansSegmentIncident(i, segment))
      .map((i) => incidentAffiche(i, { nom, cause: libelleCause, date: adminDateCourte, absent: VALEUR_ABSENTE }).cellules);
    return { ok: true, csv: tableauCsv(COLONNES_INCIDENTS, lignes), nom: nomFichierExportTour(`incidents-${segment}`, maintenant), lignes: lignes.length };
  }
  if (ecran === 'taches') {
    const [{ taches }, durees] = await Promise.all([chargerTachesAdmin(), chargerDureesTaches()]);
    // Le MÊME résolveur de seuils que la page · une tâche « bloquée » à l'écran l'est dans le fichier.
    const t = tableTachesAdmin(taches, maintenant, { q: entree.q, segment: entree.segment }, resolveurSeuils(mesurerDureesTaches(durees.taches)));
    return { ok: true, csv: tableauCsv(COLONNES_TACHES_ADMIN, t.filtrees.map(cellulesTacheAdmin)), nom: nomFichierExportTour(`taches-${t.segment}`, maintenant), lignes: t.filtrees.length };
  }
  if (ecran === 'audit') {
    const { evenements } = await chargerRegistreAudit();
    const t = tableRegistreAudit(evenements, { q: entree.q, segment: entree.segment });
    return { ok: true, csv: tableauCsv(COLONNES_REGISTRE_AUDIT, t.filtrees.map(cellulesRegistreAudit)), nom: nomFichierExportTour(`audit-${t.segment}`, maintenant), lignes: t.filtrees.length };
  }
  return { ok: false, message: 'Écran inconnu · rien n’a été exporté.' };
}

export type ResultatIncident = { ok: true; id: string; message: string } | { ok: false; message: string; erreurs?: ErreurIncident[] };

export async function ouvrirIncidentAction(entree: { titre?: unknown; gravite?: unknown; cause?: unknown; constat?: unknown }): Promise<ResultatIncident> {
  const porte = await porteAdminGeste();
  if (!porte.ok) return { ok: false, message: REFUS };
  const v = validerOuvertureIncident(entree ?? {}, CAUSES);
  if (!v.ok) return { ok: false, message: 'Incident non déclaré · corrige les champs signalés, rien n’a été enregistré.', erreurs: v.erreurs };
  if (!db) return { ok: false, message: 'Base indisponible · rien n’a été enregistré.' };
  const [r] = await db.insert(schema.platformIncidents).values({
    title: v.saisie.titre, severity: v.saisie.gravite, cause: v.saisie.cause, description: v.saisie.constat, openedBy: porte.session.user.id,
  }).returning({ id: schema.platformIncidents.id });
  revalidatePath('/admin/incidents');
  return { ok: true, id: r!.id, message: 'Incident déclaré · il apparaît dans « Ouverts ».' };
}

export async function annoterIncidentAction(entree: { id?: unknown; texte?: unknown }): Promise<ResultatIncident> {
  const porte = await porteAdminGeste();
  if (!porte.ok) return { ok: false, message: REFUS };
  const id = String(entree?.id ?? '');
  if (!UUID.test(id)) return { ok: false, message: 'Incident introuvable · rien n’a été enregistré.' };
  const v = validerNoteIncident(entree?.texte);
  if (!v.ok) return { ok: false, message: 'Note non enregistrée · elle est vide ou trop longue.', erreurs: v.erreurs };
  if (!db) return { ok: false, message: 'Base indisponible · rien n’a été enregistré.' };
  const I = schema.platformIncidents;
  const note = JSON.stringify([{ texte: v.texte, auteur: porte.session.user.id, le: new Date().toISOString() }]);
  // Ajout ATOMIQUE en fin de tableau · deux notes simultanées ne s'écrasent pas · la borne est vérifiée dans la même écriture.
  const r = await db.update(I).set({ notes: sql`${I.notes} || ${note}::jsonb`, updatedAt: new Date() })
    .where(and(eq(I.id, id), lt(sql`jsonb_array_length(${I.notes})`, NOTES_MAX_INCIDENT))).returning({ id: I.id });
  if (!r.length) {
    const [existe] = await db.select({ id: I.id }).from(I).where(eq(I.id, id));
    return { ok: false, message: existe ? `${NOTES_MAX_INCIDENT} notes atteintes · ouvre un nouvel incident pour la suite.` : 'Incident introuvable · rien n’a été enregistré.' };
  }
  revalidatePath('/admin/incidents');
  return { ok: true, id, message: 'Note ajoutée.' };
}

export async function cloreIncidentAction(entree: { id?: unknown; resolution?: unknown }): Promise<ResultatIncident> {
  const porte = await porteAdminGeste();
  if (!porte.ok) return { ok: false, message: REFUS };
  const id = String(entree?.id ?? '');
  if (!UUID.test(id)) return { ok: false, message: 'Incident introuvable · rien n’a été clos.' };
  const v = validerClotureIncident(entree?.resolution);
  if (!v.ok) return { ok: false, message: 'Incident non clos · écris comment il s’est résolu.', erreurs: v.erreurs };
  if (!db) return { ok: false, message: 'Base indisponible · rien n’a été clos.' };
  const I = schema.platformIncidents;
  const maintenant = new Date();
  // Seul un incident OUVERT se clôt · une seconde clôture (double clic, deux onglets) ne remplace pas la première.
  const r = await db.update(I).set({ status: 'clos', closedAt: maintenant, closedBy: porte.session.user.id, resolution: v.resolution, updatedAt: maintenant })
    .where(and(eq(I.id, id), eq(I.status, 'ouvert'))).returning({ id: I.id });
  if (!r.length) {
    const [existe] = await db.select({ id: I.id }).from(I).where(eq(I.id, id));
    return { ok: false, message: existe ? 'Déjà clos · la première résolution est gardée.' : 'Incident introuvable · rien n’a été clos.' };
  }
  revalidatePath('/admin/incidents');
  return { ok: true, id, message: 'Incident clos · il passe dans « Clos ».' };
}
