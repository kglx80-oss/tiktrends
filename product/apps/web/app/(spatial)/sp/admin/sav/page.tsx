import {
  CLASSE_RISQUE, ONGLETS_SAV, PASTILLE_TYPE_TICKET, REPONSES_TYPES, VALEUR_ABSENTE, adminDateHeure, adminDuree, adminEuros, adminIlYa, adminNombre, adminPluriel,
  attendReponse, etatAttente, indicateursSav, initialesEspace, libelleRisque, mrrEspace, niveauRisque, numeroTicket, partCreditsUtilises,
  pastilleEtatTicket, signauxRisque, ticketsDeLOnglet,
} from '@tiktrends/core';
import { Sav } from '../../../../../spatial/vues/admin/Sav';
import { bandeau, chargerEspaces, chargerTarifs, chargerTickets, porteAdmin, navAdmin } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * « Tickets SAV » · NOUVELLE adresse · les tickets du support réel, toutes
 * marques confondues. Même porte que `/admin` (fondateur ET admin de l'espace).
 * Les gestes passent par les actions du support, qui ne traitent un ticket
 * que depuis SON espace · ailleurs, la réponse est désactivée et le dit.
 */
export default async function SavSpatial() {
  const s = await porteAdmin();
  const maintenant = new Date();
  const [tarifs, tickets] = await Promise.all([chargerTarifs(), chargerTickets()]);
  const espaces = await chargerEspaces(maintenant, tickets);
  const espaceDe = new Map(espaces.map((e) => [e.id, e]));
  const ind = indicateursSav(tickets, maintenant);
  const rang = new Map(espaces.map((e, i) => [e.id, i]));

  const lignes = ONGLETS_SAV.flatMap((o) => ticketsDeLOnglet(tickets, o.statut)).map((t) => {
    const e = espaceDe.get(t.espaceId);
    const part = e ? partCreditsUtilises(e, tarifs) : null;
    const resolu = t.statut === 'resolved';
    return {
      id: t.id, onglet: t.statut, pastille: PASTILLE_TYPE_TICKET[t.type], depuis: adminIlYa(t.creeLe, maintenant), titre: t.titre,
      ligne: `${t.espace} · ${resolu ? 'Résolu' : attendReponse(t) ? 'Sans réponse' : 'Répondu'}`,
      espace: t.espace, initiales: initialesEspace(t.espace), teinte: rang.get(t.espaceId) ?? 0, numero: numeroTicket(t.id),
      etat: pastilleEtatTicket(t), ouvertPar: t.auteur ?? 'le client', ouvertLe: adminDateHeure(t.creeLe),
      messages: t.messages.map((m) => ({ equipe: m.equipe, auteur: m.equipe ? `${m.auteur} · équipe` : m.auteur, quand: adminDateHeure(m.le), corps: m.corps })),
      resolu: resolu ? `Résolu le ${adminDateHeure(t.majLe)}` : null,
      attente: etatAttente(t, maintenant, adminDuree),
      client: e ? {
        forfait: tarifs.libelles[e.forfait] ?? e.forfait, mrr: mrrEspace(e, tarifs) ? adminEuros(mrrEspace(e, tarifs)) : VALEUR_ABSENTE,
        sante: { libelle: libelleRisque(signauxRisque(e, maintenant).length), classe: (CLASSE_RISQUE[niveauRisque(e, maintenant)] || 'g') as 'g' | 'w' | 'r' },
        credits: part == null ? VALEUR_ABSENTE : `${part} %`,
      } : { forfait: VALEUR_ABSENTE, mrr: VALEUR_ABSENTE, sante: { libelle: VALEUR_ABSENTE, classe: 'g' as const }, credits: VALEUR_ABSENTE },
      // Règle des actions du support · un ticket se traite depuis SON espace.
      bloque: t.espaceId === s.workspaceId ? null : `Réponse réservée à l’espace ${t.espace} · le support se traite depuis l’espace du client.`,
    };
  });

  return (
    <Sav
      bandeau={bandeau(espaces, tarifs, await navAdmin())}
      kpis={[
        { lbl: 'Ouverts', v: adminNombre(ind.ouverts), d: ind.sansReponse ? `${adminNombre(ind.sansReponse)} sans réponse` : 'Tous ont une réponse', c: ind.sansReponse ? 'dn' : 'up' },
        { lbl: '1re réponse', v: adminDuree(ind.premiereReponseMin), d: `médiane · ${adminPluriel(ind.reponsesMesurees, 'ticket')} · 30 j` },
        { lbl: 'Résolution', v: adminDuree(ind.resolutionMin), d: `médiane · ${adminPluriel(ind.resolutionsMesurees, 'ticket')} · 30 j` },
        { lbl: 'Satisfaction', v: VALEUR_ABSENTE, d: 'Aucune enquête envoyée' },
      ]}
      onglets={ONGLETS_SAV.map((o) => ({ statut: o.statut, libelle: o.libelle, n: ind.parStatut[o.statut] }))}
      tickets={lignes}
      reponsesTypes={REPONSES_TYPES}
    />
  );
}
