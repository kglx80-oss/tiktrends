import { estLotImporte, quandCourt, remontees, sousNavResultats } from '@tiktrends/core';
import { Importer } from '../../../../../spatial/vues/resultats/Importer';
import { RefusResultats } from '../../../../../spatial/vues/resultats/communs';
import { chargerConnexion, chargerLots, gardeResultats } from '../donnees';

export const dynamic = 'force-dynamic';

/** Importer · réservé aux administrateurs, comme la page V5 (`app/(app)/adsmap/import`). */
export default async function ImportSpatial() {
  const g = await gardeResultats('import');
  if (!g.ok) return <RefusResultats titre="Importer des résultats" raison={g.raison} />;

  const maintenant = new Date();
  const [d, c] = await Promise.all([chargerLots(g.s.workspaceId, g.marque.id, maintenant), chargerConnexion(g.marque.id)]);
  const mesurees = [...d.lots.flatMap((l) => l.ads), ...d.horsLot].filter((a) => a.verdict?.calcule).length;
  const liste = remontees({
    mesureLe: c.mesureLe,
    variantesMesurees: mesurees,
    lotsImportes: d.lots.filter((l) => estLotImporte({ status: l.statut, launchedAt: l.lanceLe })).map((l) => ({ numero: l.numero, variantes: l.ads.length, le: l.creeLe })),
  });

  return (
    <Importer
      sousNav={sousNavResultats({ admin: g.admin })}
      meta={{ connecte: c.metaConnecte, mesure: c.mesureLe ? quandCourt(c.mesureLe, maintenant) : null }}
      remontees={liste.map((r) => ({ ...r, quand: quandCourt(r.le, maintenant) }))}
    />
  );
}
