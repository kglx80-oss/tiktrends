import {
  ACTIONS_AUDIT, ACTIONS_SENSIBLES, COLONNES_REGISTRE_AUDIT, adminPluriel, adresseListeTour, cellulesRegistreAudit, etatExportTour,
  libellePuceSegment, lirePageTour, tableRegistreAudit, textePage,
} from '@tiktrends/core';
import { CHEMIN_REGISTRE_AUDIT, RegistreAudit } from '../../../../../spatial/vues/admin/RegistreAudit';
import { bandeauSeul, chargerRegistreAudit, porteAdmin } from '../donnees';

export const dynamic = 'force-dynamic';

const UNITE = { un: 'événement', plusieurs: 'événements' } as const;

/**
 * « Registre d'audit » (suivi opérationnel · RJ AR06) · porte `porteAdmin`
 * (admin de l'espace ET fondateur) AVANT toute lecture. LECTURE SEULE · le
 * filtre « Actions sensibles » (liste fermée au noyau), la recherche et la
 * page relus au serveur (`?segment=&q=&page=`).
 */
export default async function RegistreAuditSpatial({ searchParams }: { searchParams?: Promise<{ q?: string; segment?: string; page?: string }> }) {
  await porteAdmin();
  const sp = (await searchParams) ?? {};
  const [b, lu] = await Promise.all([bandeauSeul(), chargerRegistreAudit()]);
  const table = tableRegistreAudit(lu.evenements, { q: sp.q, segment: sp.segment, page: lirePageTour(sp.page) });
  return (
    <RegistreAudit
      bandeau={b}
      colonnes={COLONNES_REGISTRE_AUDIT}
      segments={table.segments.map((s) => ({ cle: s.cle, libelle: libellePuceSegment(s), href: adresseListeTour(CHEMIN_REGISTRE_AUDIT, { q: table.q, segment: s.cle }), actif: s.cle === table.segment }))}
      segment={table.segment}
      definition={table.segments.find((s) => s.cle === table.segment)?.definition ?? ''}
      sensibles={ACTIONS_SENSIBLES.map((code) => ({ code, phrase: ACTIONS_AUDIT[code]!.phrase, raison: ACTIONS_AUDIT[code]!.raison ?? '' }))}
      q={table.q}
      lignes={table.page.lignes.map((l) => ({ id: l.id, sensible: l.sensible, cellules: cellulesRegistreAudit(l) }))}
      total={lu.evenements.length}
      pagination={table.page.pages > 1 ? {
        texte: `${textePage(table.page, UNITE)} · page ${table.page.page} sur ${table.page.pages}`,
        precedente: table.page.page > 1 ? adresseListeTour(CHEMIN_REGISTRE_AUDIT, { q: table.q, segment: table.segment, page: table.page.page - 1 }) : null,
        suivante: table.page.page < table.page.pages ? adresseListeTour(CHEMIN_REGISTRE_AUDIT, { q: table.q, segment: table.segment, page: table.page.page + 1 }) : null,
      } : null}
      export={etatExportTour(table.filtrees.length, UNITE)}
      limite={lu.limite}
      note={`${adminPluriel(table.filtrees.length, 'événement')} dans ce filtre${table.q ? ` pour « ${table.q} »` : ''} · le nom de l’acteur, jamais son adresse · motif et détails bornés, secrets et adresses masqués · rien ne se modifie ni ne se supprime (le registre est en ajout seul) · l’export reprend tout le filtre, toutes pages, colonnes de la table.`}
    />
  );
}
