import { redirect } from 'next/navigation';
import {
  outilsResultats, redirectionTestProfond,
  accrocheResultats, barresCpa, categorieVariable, compteLotsEnAttente, indexAutresLots, indexLotVedette, kpisResultats,
  phraseLot, plateformesLot, lienLotSpatial, LIBELLE_NIVEAU, presentationLot, sousNavResultats, suiteLot, syntheseLot, volumeMinimumLot, etatLotSpatial,
} from '@tiktrends/core';
import { VueEnsemble, type AutreLot, type LotVedette } from '../../../../spatial/vues/resultats/VueEnsemble';
import { RefusResultats } from '../../../../spatial/vues/resultats/communs';
import { chargerApprentissages, chargerConnexion, chargerLots, chargerMesures, gardeResultats } from './donnees';

export const dynamic = 'force-dynamic';

const PERIODE_JOURS = 14;
const JOUR = 86_400_000;

/** Résultats · vue d'ensemble · mêmes gardes que l'Adsmap V5 (`app/(app)/adsmap`). */
export default async function ResultatsSpatial({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const g = await gardeResultats();
  if (!g.ok) return <RefusResultats titre="Résultats" raison={g.raison} />;
  // Le lien profond de l'ancienne Adsmap (`?ad=<id>`, Studios, suites, radar) · la fiche du test.
  const profond = redirectionTestProfond(await searchParams);
  if (profond) redirect(profond);

  const maintenant = new Date();
  const fin = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()) + JOUR);
  const debut = new Date(fin.getTime() - PERIODE_JOURS * JOUR);
  const avant = new Date(debut.getTime() - PERIODE_JOURS * JOUR);
  const [d, connexion, cur, prec, appris] = await Promise.all([
    chargerLots(g.s.workspaceId, g.marque.id, maintenant),
    chargerConnexion(g.marque.id),
    chargerMesures(g.marque.id, debut, fin),
    chargerMesures(g.marque.id, avant, debut),
    chargerApprentissages(g.s.workspaceId, g.marque.id),
  ]);
  const vides = (a: typeof prec) => a.impressions === 0 && a.depense === 0;

  const lus = d.lots.map((l) => ({ l, etat: etatLotSpatial(l, d.ctx), pres: presentationLot(l, d.ctx), syn: syntheseLot(l, d.config.targetCpa), aDesVerdicts: l.ads.some((a) => a.verdict) }));
  const iv = indexLotVedette(lus);
  const autres = indexAutresLots(lus, iv).map((i) => lus[i]!);
  const enAttente = compteLotsEnAttente(lus.filter((_, i) => i !== iv).map((x) => x.etat));

  let vedette: LotVedette | null = null;
  if (iv >= 0) {
    const { l, etat, pres, syn } = lus[iv]!;
    const barres = barresCpa(l.ads);
    const volume = volumeMinimumLot(l);
    const lecons = appris.filter((a) => a.adId && l.ads.some((x) => x.id === a.adId) && a.statut === 'validated' && !a.refute);
    vedette = {
      statut: etat === 'a_conclure' ? { libelle: 'À conclure', classe: 'g' } : { libelle: pres.statut.libelle, classe: pres.statut.classe },
      meta: [`Lot #${l.numero}`, `${d.ctx.fenetreJours} jours`, plateformesLot(l), volume !== null ? `${volume.toLocaleString('fr-FR')} impressions minimum par variante` : null].filter(Boolean).join(' · '),
      titre: l.but?.trim() || pres.titre,
      variantes: l.ads.map((a, i) => ({
        id: a.id, texte: a.texte ?? ' ', image: a.image, variante: a.variante, categorie: categorieVariable(a.variable),
        gagnante: syn.gagnante === a.id, barre: barres[i]!,
      })),
      note: `Coût par achat de chaque variante · la barre la plus haute coûte le moins. Verdict du moteur sur la cible de ${d.config.targetCpa.toLocaleString('fr-FR')} € par achat.`,
      passe: `${syn.titre} · ${syn.phrase}`,
      retient: lecons[0]
        ? { texte: lecons[0].enonce, niveau: syn.niveau, detail: `${LIBELLE_NIVEAU[syn.niveau]} · dans tes apprentissages` }
        : { texte: 'Ce que le lot t’apprend s’écrit en le concluant · le chiffre seul ne dit pas pourquoi.', niveau: syn.niveau, detail: `${LIBELLE_NIVEAU[syn.niveau]} · à écrire en concluant le lot` },
      ensuite: suiteLot(etat, syn),
      suite: { libelle: 'Préparer la suite', href: '/adsmap/suites' },
      lot: { libelle: etat === 'a_conclure' ? `Conclure le lot #${l.numero}` : 'Voir le détail', href: lienLotSpatial(l.id) },
    };
  }

  const cartes: AutreLot[] = autres.map(({ l, etat, pres, syn }) => ({
    id: l.id,
    alerte: etat === 'a_importer',
    statut: etat === 'diffusion' ? { libelle: `En cours · jour ${pres.jour ?? 1} sur ${pres.fenetre}`, classe: 'c' } : etat === 'a_importer' ? { libelle: 'Terminé · mesures à importer', classe: 'w' } : pres.statut,
    titre: pres.titre,
    pubs: l.ads.slice(0, 2).map((a) => ({ texte: a.texte ?? ' ', image: a.image })),
    progression: etat === 'diffusion' ? pres.anneau.part : null,
    texte: phraseLot(pres, syn, l.ads.length),
    // Un membre n'importe pas (page réservée) · il suit le lot.
    action: pres.action.href === '/adsmap/import' && !g.admin ? { libelle: 'Voir le lot', href: lienLotSpatial(l.id) } : pres.action,
  }));

  return (
    <VueEnsemble
      sousNav={sousNavResultats({ admin: g.admin })}
      sous={connexion.metaConnecte ? `${PERIODE_JOURS} derniers jours · Meta` : `${PERIODE_JOURS} derniers jours · aucun compte Meta connecté`}
      accroche={accrocheResultats(iv >= 0 ? { numero: lus[iv]!.l.numero, synthese: lus[iv]!.syn, aConclure: lus[iv]!.etat === 'a_conclure' } : null, enAttente)}
      kpis={kpisResultats(cur, vides(prec) ? null : prec)}
      vedette={vedette}
      autres={cartes}
      commencer={g.admin ? { libelle: 'Préparer un lot', href: '/adsmap/lots' } : { libelle: 'Voir les hypothèses', href: '/adsmap/hypotheses' }}
      outils={outilsResultats({ admin: g.admin })}
    />
  );
}
