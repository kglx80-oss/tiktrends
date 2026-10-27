import { notFound } from 'next/navigation';
import {
  attendArbitrage, barresCpa, coachLot, controlesLot, lotArbitrable, plateformesLot, presentationLot, syntheseLot, verdictAffiche,
  LIBELLE_VERDICT, LIBELLE_NATURE_LOT, natureLot, lienFicheTest, libelleStatutTest,
} from '@tiktrends/core';
import { batchDetailAction } from '../../../../../actions/adsmap-batch';
import { Lot } from '../../../../../../spatial/vues/resultats/Lot';
import { ActionsLot, type PropsActionsLot } from '../../../../../../spatial/vues/resultats/ActionsLot';
import { RefusResultats } from '../../../../../../spatial/vues/resultats/communs';
import { chargerLots, gardeResultats } from '../../donnees';

export const dynamic = 'force-dynamic';

/**
 * Fiche d'un lot · nouvelle adresse (l'Adsmap V5 ouvrait le lot dans la liste,
 * `?lot=`). Lisible par tout membre qui ouvre Adsmap (comme `batchDetailAction`) ·
 * composer, préparer et lancer restent réservés aux admins (actions gardées),
 * arbitrer est ouvert aux membres (comme `validateVerdictAction`).
 */
export default async function LotSpatial({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gardeResultats();
  if (!g.ok) return <RefusResultats titre="Lot de test" raison={g.raison} />;

  const d = await chargerLots(g.s.workspaceId, g.marque.id);
  const l = d.lots.find((x) => x.id === id);
  if (!l) notFound();

  const pres = presentationLot(l, d.ctx);
  const syn = syntheseLot(l, d.config.targetCpa);
  const barres = barresCpa(l.ads);

  let actions: PropsActionsLot | null = null;
  if (g.admin && (pres.etat === 'composition' || pres.etat === 'pret')) {
    const fiche = await batchDetailAction(l.id);
    const b = fiche.detail?.brief;
    const detail = new Map((fiche.detail?.ads ?? []).map((a) => [a.id, a]));
    actions = {
      mode: 'composition', lotId: l.id, pret: pres.etat === 'pret',
      variantes: l.ads.map((a) => ({
        id: a.id, variante: a.variante, concept: a.concept, manques: a.manques, nom: a.nomGenere,
        blocage: detail.get(a.id)?.blocking ?? null, avis: detail.get(a.id)?.prelaunch?.summary ?? null, adset: detail.get(a.id)?.adsetName ?? null,
      })),
      // Le vivier · mêmes règles que `candidatesAction` (hors lot, pas encore lancées).
      vivier: d.horsLot.filter((a) => a.statut === 'draft' || a.statut === 'proposed' || a.statut === 'ready')
        .map((a) => ({ id: a.id, variante: a.variante, concept: a.concept, manques: a.manques, nom: a.nomGenere })),
      brief: b ? { campagne: b.campaignName, structure: b.structure, budgetJour: b.dailyBudgetPerAd, jours: b.durationDays, audience: b.audienceRule, total: b.totalBudget, conclusivite: b.conclusiveness } : null,
    };
  } else if (lotArbitrable(pres.etat)) {
    actions = {
      mode: 'arbitrage', lotId: l.id,
      aArbitrer: l.ads.filter(attendArbitrage).map((a) => ({
        id: a.id, variante: a.variante, calcule: a.verdict!.calcule!,
        verdict: LIBELLE_VERDICT[verdictAffiche(a.verdict) ?? a.verdict!.calcule!].court, raison: a.verdict!.raison,
      })),
    };
  }

  return (
    <Lot
      sous={`Lot #${l.numero} · ${plateformesLot(l)} · ${d.ctx.fenetreJours} jours`}
      titre={l.but?.trim() || `Lot #${l.numero}`}
      verdict={{ gagnant: !!syn.gagnante, titre: syn.titre, phrase: syn.phrase, niveau: syn.niveau }}
      variantes={l.ads.map((a, i) => {
        const v = verdictAffiche(a.verdict);
        return { id: a.id, texte: a.texte ?? ' ', image: a.image, gagnante: syn.gagnante === a.id, barre: barres[i]!, tag: `${a.variante} · ${v ? LIBELLE_VERDICT[v].court.toLowerCase() : 'en mesure'}` };
      })}
      controles={controlesLot(l, pres, d.config.minImpressions)}
      coach={coachLot(pres, syn, l.ads.length)}
      actions={actions ? <ActionsLot {...actions} /> : null}
      reserves={[LIBELLE_NATURE_LOT[natureLot({ status: l.statut, launchedAt: l.lanceLe })].phrase, l.protocole?.resume ?? null].filter((x): x is string => !!x)}
      fiches={l.ads.map((a) => {
        const v = verdictAffiche(a.verdict);
        return { href: lienFicheTest(a.id), libelle: `${a.variante} · ${a.concept}`, detail: `${libelleStatutTest(a.statut)} · ${v ? LIBELLE_VERDICT[v].court : 'pas de verdict'}` };
      })}
    />
  );
}
