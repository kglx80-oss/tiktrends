import { PARAM_LOT_IMPORT, estLotImporte, listeLotImport, lotCibleImport, lotImport, mesuresDuLot, quandCourt, remontees, sousNavResultats } from '@tiktrends/core';
import { Importer } from '../../../../../spatial/vues/resultats/Importer';
import { RefusResultats } from '../../../../../spatial/vues/resultats/communs';
import { chargerConnexion, chargerLots, gardeResultats } from '../donnees';
import { lireRemontees } from '../../../../../lib/adsmap-mesures';

export const dynamic = 'force-dynamic';

/**
 * Importer · réservé aux administrateurs, comme la page V5 (`app/(app)/adsmap/import`).
 * `?lot=` (`PARAM_LOT_IMPORT` · le geste « Importer les mesures du lot #n » de
 * l'Accueil) ouvre l'écran sur CE lot · ses variantes, leur nom régie et leur
 * état de mesure, et le compte des annonces d'un export qui vont à lui · un lot
 * hors des lots lus pour la marque active de l'espace est ignoré
 * (`lotCibleImport`). Rien n'est écrit à l'affichage.
 * La liste « Lot » (I06 · `listeLotImport`) · les lots de la marque qui
 * attendent des mesures, parmi ceux DÉJÀ lus ici (`chargerLots` · même ordre,
 * même borne), regroupés par cas (`casMesuresLot` · « mesures manquantes »,
 * que la pastille du rail compte, puis « mesures en cours ») · la sélection
 * est l'adresse (`?lot=`) · « Tous les lots », l'écran tel qu'il était. Aucun
 * lot à choisir · aucune liste. La section du lot dit son cas (`mesuresDuLot`, la même règle).
 */
export default async function ImportSpatial({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const g = await gardeResultats('import');
  if (!g.ok) return <RefusResultats titre="Importer des résultats" raison={g.raison} />;

  const maintenant = new Date();
  const [d, c, journal, params] = await Promise.all([chargerLots(g.s.workspaceId, g.marque.id, maintenant), chargerConnexion(g.marque.id), lireRemontees(g.marque.id), searchParams]);
  const mesurees = [...d.lots.flatMap((l) => l.ads), ...d.horsLot].filter((a) => a.verdict?.calcule).length;
  const liste = remontees({
    mesureLe: c.mesureLe,
    journal,
    variantesMesurees: mesurees,
    lotsImportes: d.lots.filter((l) => estLotImporte({ status: l.statut, launchedAt: l.lanceLe })).map((l) => ({ numero: l.numero, variantes: l.ads.length, le: l.creeLe })),
  });
  const cible = lotCibleImport(d.lots, params[PARAM_LOT_IMPORT]);
  const lot = cible
    ? {
      ...lotImport(cible, cible.ads.map((a) => ({
        code: a.variante, nomRegie: a.nomGenere, statut: a.statut, plateforme: a.plateforme,
        verdict: a.verdict ? { calcule: a.verdict.calcule, statut: a.verdict.statut, calculeLe: a.verdict.calculeLe, impressions: a.verdict.impressions, depense: a.verdict.depense } : null,
      })), d.config, { ...d.ctx, lanceLe: cible.lanceLe }),
      mesures: mesuresDuLot(cible, d.ctx, d.config),
    }
    : null;

  return (
    <Importer
      sousNav={sousNavResultats({ admin: g.admin })}
      meta={{ connecte: c.metaConnecte, mesure: c.mesureLe ? quandCourt(c.mesureLe, maintenant) : null }}
      remontees={liste.map((r) => ({ ...r, quand: quandCourt(r.le, maintenant) }))}
      lot={lot}
      liste={listeLotImport(d.lots, cible?.id ?? null, d.ctx, d.config)}
    />
  );
}
