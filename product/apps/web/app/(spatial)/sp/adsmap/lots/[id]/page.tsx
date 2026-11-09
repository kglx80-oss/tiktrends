import { notFound } from 'next/navigation';
import {
  attendArbitrage, barresCpa, coachLot, controlesLot, lotArbitrable, plateformesLot, presentationLot, syntheseLot, verdictAffiche,
  LIBELLE_VERDICT, LIBELLE_NATURE_LOT, natureLot, lienFicheTest, libelleStatutTest, conclusionLot, referenceConclusion, lienJarvisContexte,
  entreesLecturePersonas, lecturePersonas, libelleAttribution, regleLecturePersonas,
  apprentissagesDepuisReponse, lireGesteConclusion, REFUS_GESTE_JARVIS,
} from '@tiktrends/core';
import { personasEtTests } from '../../../../../../lib/personas-tests';
import { lireReponseJarvis } from '../../../../../../lib/jarvis-gestes';
import { batchDetailAction } from '../../../../../actions/adsmap-batch';
import { Lot } from '../../../../../../spatial/vues/resultats/Lot';
import { ActionsLot, DupliquerLot, type PropsActionsLot } from '../../../../../../spatial/vues/resultats/ActionsLot';
import { RefusResultats } from '../../../../../../spatial/vues/resultats/communs';
import { chargerLots, gardeResultats } from '../../donnees';

export const dynamic = 'force-dynamic';

/**
 * Fiche d'un lot · nouvelle adresse (l'Adsmap V5 ouvrait le lot dans la liste,
 * `?lot=`). Lisible par tout membre qui ouvre Adsmap (comme `batchDetailAction`) ·
 * composer, préparer et lancer restent réservés aux admins (actions gardées),
 * arbitrer est ouvert aux membres (comme `validateVerdictAction`), dupliquer
 * reste aux admins (comme `createBatchAction`).
 *
 * La conclusion du lot entier (`conclusionLot`) se lit contre les AUTRES lots
 * de la marque, déjà chargés ici · aucune lecture de plus.
 *
 * `?conclure=jarvis&reponse=<uuid>` (lot 5 bis · « Conclure le lot » sous une
 * réponse de Jarvis) · la réponse est RELUE dans la portée (espace, marque
 * active, personne) · l'apprentissage de chaque variante à arbitrer est
 * pré-rempli par ce que la réponse dit d'ELLE seule (`apprentissagesDepuisReponse`,
 * noyau), modifiable · rien n'est validé sans le clic « Valider le verdict ».
 */
export default async function LotSpatial({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)]);
  const g = await gardeResultats();
  if (!g.ok) return <RefusResultats titre="Lot de test" raison={g.raison} />;

  const [d, pt] = await Promise.all([chargerLots(g.s.workspaceId, g.marque.id), personasEtTests(g.s.workspaceId, g.marque.id)]);
  const l = d.lots.find((x) => x.id === id);
  if (!l) notFound();
  // Lot 9 · le persona de chaque variante (carte ou brief, jamais fusionnés) et la lecture par persona de TOUTE la marque.
  const attribution = (adId: string) => pt.parAd.get(adId) ?? null;
  const lecture = lecturePersonas(entreesLecturePersonas(d.lots, (adId) => attribution(adId)?.persona ?? null), pt.personas);
  const duLot = new Set(l.ads.map((a) => attribution(a.id)?.persona?.id).filter((x): x is string => !!x));

  const pres = presentationLot(l, d.ctx);
  const syn = syntheseLot(l, d.config.targetCpa);
  const barres = barresCpa(l.ads);
  const conclusion = conclusionLot(l, pres.etat, referenceConclusion(d.lots, l.id));

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
    const aArbitrer = l.ads.filter(attendArbitrage);
    // Depuis une réponse de Jarvis · relue dans la portée, pré-remplit sans rien valider.
    const geste = lireGesteConclusion(sp);
    const texte = geste.etat === 'ok' ? await lireReponseJarvis(g.s, g.marque.id, geste.reponse) : null;
    const jarvis = geste.etat === 'absente' ? null
      : texte ? apprentissagesDepuisReponse(texte, aArbitrer.map((a) => ({ adId: a.id, variante: a.variante })))
        : { textes: {}, note: REFUS_GESTE_JARVIS };
    actions = {
      mode: 'arbitrage', lotId: l.id,
      aArbitrer: aArbitrer.map((a) => ({
        id: a.id, variante: a.variante, calcule: a.verdict!.calcule!,
        verdict: LIBELLE_VERDICT[verdictAffiche(a.verdict) ?? a.verdict!.calcule!].court, raison: a.verdict!.raison,
      })),
      ...(jarvis ? { jarvis } : {}),
    };
  }

  return (
    <Lot
      sous={[`Lot #${l.numero}`, LIBELLE_NATURE_LOT[natureLot({ status: l.statut, launchedAt: l.lanceLe })].court, plateformesLot(l), `${d.ctx.fenetreJours} jours`].filter(Boolean).join(' · ')}
      titre={l.but?.trim() || `Lot #${l.numero}`}
      verdict={{ gagnant: !!syn.gagnante, titre: syn.titre, phrase: syn.phrase, niveau: syn.niveau }}
      variantes={l.ads.map((a, i) => {
        const v = verdictAffiche(a.verdict);
        return { id: a.id, texte: a.texte ?? ' ', image: a.image, gagnante: syn.gagnante === a.id, barre: barres[i]!, tag: `${a.variante} · ${v ? LIBELLE_VERDICT[v].court.toLowerCase() : 'en mesure'}` };
      })}
      controles={controlesLot(l, pres, d.config.minImpressions)}
      coach={coachLot(pres, syn, l.ads.length)}
      conclusion={conclusion}
      personas={{
        variantes: l.ads.map((a) => {
          const at = attribution(a.id);
          return { id: a.id, variante: a.variante, personaId: at?.persona?.id ?? null, desaccord: !!at?.desaccord, libelle: at ? libelleAttribution(at) : 'Aucun persona · ni la carte ni le brief n’en nomment un' };
        }),
        groupes: lecture.groupes.filter((x) => duLot.has(x.persona.id)).map((x) => ({ id: x.persona.id, nom: x.persona.nom, lecture: x.lecture, phrase: x.phrase })),
        parle: lecture.parle, phrase: lecture.phrase, regle: regleLecturePersonas(),
      }}
      jarvis={(() => { const href = g.jarvis ? lienJarvisContexte('lot', l.id) : null; return href ? { href } : null; })()}
      actions={<>
        {actions && <ActionsLot {...actions} />}
        <DupliquerLot lotId={l.id} numero={l.numero} variantes={l.ads.length} raison={g.admin ? null : 'Dupliquer un lot est réservé aux admins de l’espace, comme en créer un.'} />
      </>}
      reserves={[LIBELLE_NATURE_LOT[natureLot({ status: l.statut, launchedAt: l.lanceLe })].phrase, l.protocole?.resume ?? null].filter((x): x is string => !!x)}
      fiches={l.ads.map((a) => {
        const v = verdictAffiche(a.verdict);
        return { href: lienFicheTest(a.id), libelle: `${a.variante} · ${a.concept}`, detail: `${libelleStatutTest(a.statut)} · ${v ? LIBELLE_VERDICT[v].court : 'pas de verdict'}` };
      })}
    />
  );
}
