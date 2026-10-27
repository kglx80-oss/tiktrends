import { lireFiltresTests, reperesTests, sousNavResultats } from '@tiktrends/core';
import { listAdsAction, listBatchesAction } from '../../../../actions/adsmap';
import { Tests } from '../../../../../spatial/vues/resultats/Tests';
import { RefusResultats } from '../../../../../spatial/vues/resultats/communs';
import { gardeResultats } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * Tous les tests · la table de l'ancienne Adsmap (`?vue=table`) · mêmes gardes,
 * mêmes lectures (`listAdsAction`, filtres lus dans l'adresse et validés par le
 * noyau). Lecture seule · les gestes passent par la fiche et les actions existantes.
 */
export default async function TestsSpatial({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const g = await gardeResultats();
  if (!g.ok) return <RefusResultats titre="Tous les tests" raison={g.raison} />;

  const filtres = lireFiltresTests(await searchParams);
  const [r, lots] = await Promise.all([listAdsAction(filtres), listBatchesAction()]);
  const lignes = r.error ? null : (r.rows ?? []);

  return (
    <Tests
      sousNav={sousNavResultats({ admin: g.admin })}
      sous={`Résultats · ${g.marque.nom}`}
      lots={lots.map((l) => ({ id: l.id, number: l.number, ads: l.ads }))}
      filtres={filtres}
      lignes={lignes}
      erreur={r.error ?? null}
      reperes={reperesTests(lignes ?? [])}
      admin={g.admin}
    />
  );
}
