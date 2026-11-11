import {
  ADRESSE_RAPPROCHEMENT, COLONNES_TACHES_ADMIN, SEUIL_TACHE_BLOQUEE_MIN, adminNombre, adminPluriel, adresseIncidentTache, adresseListeTour,
  cellulesTacheAdmin, etatExportTour, libellePuceSegment, lirePageTour, tableTachesAdmin, textePage,
} from '@tiktrends/core';
import { CHEMIN_TACHES_ADMIN, Taches } from '../../../../../spatial/vues/admin/Taches';
import { bandeauSeul, chargerTachesAdmin, porteAdmin } from '../donnees';

export const dynamic = 'force-dynamic';

const UNITE = { un: 'tâche', plusieurs: 'tâches' } as const;

/**
 * « Tâches de génération » (suivi opérationnel · RJ JB01) · porte `porteAdmin`
 * (admin de l'espace ET fondateur) AVANT toute lecture. LECTURE SEULE · les
 * tâches de toute la plateforme, segment, recherche et page relus au serveur
 * (`?segment=&q=&page=`) · l'âge se calcule contre l'horloge de la requête,
 * passée à la règle du noyau. Aucune relance, aucune annulation d'ici.
 */
export default async function TachesSpatial({ searchParams }: { searchParams?: Promise<{ q?: string; segment?: string; page?: string }> }) {
  await porteAdmin();
  const sp = (await searchParams) ?? {};
  const maintenant = new Date();
  const [b, lu] = await Promise.all([bandeauSeul(), chargerTachesAdmin()]);
  const table = tableTachesAdmin(lu.taches, maintenant, { q: sp.q, segment: sp.segment, page: lirePageTour(sp.page) });
  const n = (cle: string) => table.segments.find((s) => s.cle === cle)?.n ?? 0;
  const definition = table.segments.find((s) => s.cle === table.segment)?.definition ?? '';
  return (
    <Taches
      bandeau={b}
      kpis={[
        { lbl: 'En échec', v: adminNombre(n('echec')), c: n('echec') ? 'w' : '', d: n('echec') ? 'à examiner' : 'aucune' },
        { lbl: 'Bloquées', v: adminNombre(n('bloquees')), c: n('bloquees') ? 'dn' : '', d: `actives depuis plus de ${SEUIL_TACHE_BLOQUEE_MIN} min` },
        { lbl: 'Coût à rapprocher', v: adminNombre(n('rapprochement')), c: n('rapprochement') ? 'w' : '', d: 'coût incertain chez le fournisseur' },
        { lbl: 'En cours', v: adminNombre(n('en-cours')), d: 'le worker y travaille' },
      ]}
      colonnes={COLONNES_TACHES_ADMIN}
      segments={table.segments.map((s) => ({ cle: s.cle, libelle: libellePuceSegment(s), href: adresseListeTour(CHEMIN_TACHES_ADMIN, { q: table.q, segment: s.cle }), actif: s.cle === table.segment }))}
      segment={table.segment} definition={definition} q={table.q}
      lignes={table.page.lignes.map((l) => ({
        ...l, cellules: cellulesTacheAdmin(l),
        hrefIncident: l.declarer ? adresseIncidentTache(l.id) : null,
        hrefRapprocher: l.rapprocher ? ADRESSE_RAPPROCHEMENT : null,
      }))}
      total={lu.taches.length}
      pagination={table.page.pages > 1 ? {
        texte: `${textePage(table.page, UNITE)} · page ${table.page.page} sur ${table.page.pages}`,
        precedente: table.page.page > 1 ? adresseListeTour(CHEMIN_TACHES_ADMIN, { q: table.q, segment: table.segment, page: table.page.page - 1 }) : null,
        suivante: table.page.page < table.page.pages ? adresseListeTour(CHEMIN_TACHES_ADMIN, { q: table.q, segment: table.segment, page: table.page.page + 1 }) : null,
      } : null}
      export={etatExportTour(table.filtrees.length, UNITE)}
      limite={lu.limite}
      note={`${adminPluriel(table.filtrees.length, 'tâche')} dans ce filtre${table.q ? ` pour « ${table.q} »` : ''} · lecture seule, rien n’est relancé ni annulé d’ici (une relance est une nouvelle tâche, lancée depuis l’atelier de son espace) · coût engagé lu au registre de budget, jamais recalculé · l’export reprend tout le filtre, toutes pages, colonnes de la table.`}
    />
  );
}
