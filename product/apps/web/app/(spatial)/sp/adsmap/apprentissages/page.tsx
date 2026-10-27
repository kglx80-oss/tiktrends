import {
  attendArbitrage, etatApprentissage, iconeApprentissage, lienLotSpatial, niveauPreuveApprentissage, piedApprentissage,
  preuveApprentissage, sousNavResultats, syntheseLot, etatLotSpatial, type FaitsApprentissage,
} from '@tiktrends/core';
import { Apprentissages, type CarteApprentissage } from '../../../../../spatial/vues/resultats/Apprentissages';
import { RefusResultats } from '../../../../../spatial/vues/resultats/communs';
import { chargerApprentissages, chargerLots, gardeResultats, type AdLue, type LotLu } from '../donnees';

export const dynamic = 'force-dynamic';

/** Apprentissages · nouvelle adresse · mêmes gardes que l'Adsmap V5. */
export default async function ApprentissagesSpatial() {
  const g = await gardeResultats();
  if (!g.ok) return <RefusResultats titre="Apprentissages" raison={g.raison} />;

  const [d, appris] = await Promise.all([chargerLots(g.s.workspaceId, g.marque.id), chargerApprentissages(g.s.workspaceId, g.marque.id)]);
  const parAd = new Map<string, { ad: AdLue; lot: LotLu | null }>();
  for (const l of d.lots) for (const a of l.ads) parAd.set(a.id, { ad: a, lot: l });
  for (const a of d.horsLot) parAd.set(a.id, { ad: a, lot: null });

  // « À valider » · un lot prêt à conclure attend son apprentissage.
  const aValider: CarteApprentissage[] = d.lots.filter((l) => etatLotSpatial(l, d.ctx) === 'a_conclure').map((l) => {
    const s = syntheseLot(l, d.config.targetCpa);
    const n = l.ads.filter(attendArbitrage).length;
    return {
      id: `lot-${l.id}`, niveau: s.niveau, icone: iconeApprentissage(l.ads[0]?.variable), etat: 'valider',
      titre: `Lot #${l.numero} · ${s.titre}`, preuve: null,
      pied: `${n} variante${n > 1 ? 's' : ''} à arbitrer · l’apprentissage s’écrit en concluant`, usage: null,
      action: { libelle: 'Valider', href: lienLotSpatial(l.id) },
    };
  });

  const cartes: CarteApprentissage[] = appris.map((a) => {
    const lien = a.adId ? parAd.get(a.adId) : undefined;
    const f: FaitsApprentissage = {
      id: a.id, enonce: a.enonce, statut: a.statut, refute: a.refute, source: a.source, creeLe: a.creeLe,
      ad: lien ? { ...lien.ad, lot: lien.lot ? { id: lien.lot.id, numero: lien.lot.numero } : null } : null,
    };
    const etat = etatApprentissage(f);
    const preuve = lien?.lot ? preuveApprentissage(lien.ad.id, lien.lot.ads) : null;
    return {
      id: a.id, niveau: niveauPreuveApprentissage(f), icone: iconeApprentissage(lien?.ad.variable), etat, titre: a.enonce,
      preuve: preuve ? preuve.map((x) => ({ texte: ' ', image: x.ad.image, libelle: x.libelle, part: x.part, gagne: x.gagne })) : null,
      pied: piedApprentissage(f), usage: null,
      action: etat === 'valide' ? { libelle: 'Itérer', href: '/adsmap/suites' }
        : etat === 'retester' ? { libelle: 'Tester', href: '/adsmap/hypotheses' }
          : { libelle: 'Voir le lot', href: lien?.lot ? lienLotSpatial(lien.lot.id) : '/adsmap/lots' },
    };
  });

  return <Apprentissages sousNav={sousNavResultats({ admin: g.admin })} cartes={[...aValider, ...cartes]} />;
}
