import { Vue } from '../../communs';
import { Kpis, TeteAdmin, type BandeauAdmin, type KpiAdmin } from './base';
import { PosteSav, type TicketSav } from './sav-client';

/**
 * « Tickets SAV » · `docs/spatial/reference/a-sav.html`. PRÉSENTATIONNEL (le
 * poste interactif est `PosteSav`).
 *
 * Réel · les tickets de toutes les marques (tables du support), leurs fils,
 * les délais mesurés (1re réponse, résolution), l'espace du client. Sans
 * source · priorité, délai contractuel, assignation, notes internes,
 * satisfaction, diagnostic Jarvis, crédits offerts, pièce jointe · absents.
 */
export interface PropsSav {
  bandeau: BandeauAdmin;
  kpis: readonly KpiAdmin[];
  onglets: ReadonlyArray<{ statut: TicketSav['onglet']; libelle: string; n: number }>;
  tickets: readonly TicketSav[];
  reponsesTypes: ReadonlyArray<{ libelle: string; texte: string }>;
}

export function Sav(p: PropsSav) {
  return (
    <Vue>
      <TeteAdmin titre="Tickets SAV" sous="support" actif="/admin/sav" bandeau={p.bandeau} />
      <Kpis items={p.kpis} />
      <PosteSav onglets={p.onglets} tickets={p.tickets} reponsesTypes={p.reponsesTypes} />
    </Vue>
  );
}
