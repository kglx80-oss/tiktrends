import { sousNavResultats } from '@tiktrends/core';
import { curationViewAction } from '../../../../actions/adsmap-curation';
import { Tri } from '../../../../../spatial/vues/resultats/Tri';
import { RefusResultats } from '../../../../../spatial/vues/resultats/communs';
import { gardeResultats } from '../donnees';

export const dynamic = 'force-dynamic';

const premier = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * Tri des propositions · l'écran de tri de l'ancienne Adsmap · mêmes gardes,
 * lecture par `curationViewAction` (recherche `q` et borne `n` lues dans
 * l'adresse, bornées par l'action) · la fusion reste réservée aux admins.
 */
export default async function TriSpatial({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const g = await gardeResultats();
  if (!g.ok) return <RefusResultats titre="Tri des propositions" raison={g.raison} />;

  const sp = await searchParams;
  const n = Number.parseInt(premier(sp.n), 10);
  const r = await curationViewAction({ q: premier(sp.q).trim().slice(0, 120), limit: Number.isFinite(n) && n > 0 ? n : 20 });
  return <Tri sousNav={sousNavResultats({ admin: g.admin })} sous={`Résultats · ${g.marque.nom}`} vue={r.view ?? null} erreur={r.error ?? null} fusion={g.admin} />;
}
