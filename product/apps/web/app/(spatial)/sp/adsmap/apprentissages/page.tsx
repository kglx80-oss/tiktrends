import {
  attendArbitrage, etatApprentissage, iconeApprentissage, lienLotSpatial, niveauPreuveApprentissage, piedApprentissage,
  preuveApprentissage, sousNavResultats, syntheseLot, etatLotSpatial, actionApprentissage, tiroirApprentissage, refusVersRegles,
  conclusionLot, referenceConclusion, regleDejaPresente, departDepuisApprentissage, noteDepartApprentissage, type FaitsApprentissage, type LectureConclusion,
} from '@tiktrends/core';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { refusJarvis, TEXTE_REFUS_JARVIS } from '../../../../../lib/jarvis-acces';
import { Apprentissages, type CarteApprentissage } from '../../../../../spatial/vues/resultats/Apprentissages';
import { RefusResultats } from '../../../../../spatial/vues/resultats/communs';
import { chargerApprentissages, chargerLots, gardeResultats, type AdLue, type LotLu } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * Apprentissages · nouvelle adresse · mêmes gardes que l'Adsmap V5.
 *
 * « Ajouter aux règles de la marque » s'ouvre aux mêmes personnes que l'écriture
 * des règles (`saveJarvisRulesAction` · admin et Jarvis ouvert) · « Rejeter »
 * aux mêmes que la validation d'un verdict (membre Adsmap). Fermé, chaque geste
 * dit pourquoi. « En tirer une hypothèse » (RJ A04) · la garde de
 * `creerHypotheseAction` (membre Adsmap, marque active), la même que celle de
 * cette page · il est offert sur chaque apprentissage écrit, rejeté compris
 * (il sert alors à le retester · `departDepuisApprentissage`).
 */
export default async function ApprentissagesSpatial() {
  const g = await gardeResultats();
  if (!g.ok) return <RefusResultats titre="Apprentissages" raison={g.raison} />;

  const [d, appris, regles] = await Promise.all([
    chargerLots(g.s.workspaceId, g.marque.id), chargerApprentissages(g.s.workspaceId, g.marque.id),
    // Le texte RÉEL des règles de la marque · « déjà dans les règles » s'y lit, pas dans une trace.
    db ? db.select({ r: schema.brands.creativeRules }).from(schema.brands).where(eq(schema.brands.id, g.marque.id)).limit(1).then((x) => x[0]?.r ?? '') : Promise.resolve(''),
  ]);
  const parAd = new Map<string, { ad: AdLue; lot: LotLu | null }>();
  for (const l of d.lots) for (const a of l.ads) parAd.set(a.id, { ad: a, lot: l });
  for (const a of d.horsLot) parAd.set(a.id, { ad: a, lot: null });
  const conclusions = new Map<string, LectureConclusion>(d.lots.map((l) => [l.id, conclusionLot(l, etatLotSpatial(l, d.ctx), referenceConclusion(d.lots, l.id))]));
  const refusJ = refusJarvis(g.s);
  const fermeRegles = !g.admin ? 'Passer un apprentissage dans les règles est réservé aux admins de l’espace, comme écrire une règle.' : refusJ ? TEXTE_REFUS_JARVIS[refusJ] : null;

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
      portee: a.portee, confiance: a.confiance, versRegles: a.versRegles,
    };
    const etat = etatApprentissage(f);
    const dansLesRegles = regleDejaPresente(regles, a.enonce);
    const preuve = lien?.lot ? preuveApprentissage(lien.ad.id, lien.lot.ads) : null;
    return {
      id: a.id, niveau: niveauPreuveApprentissage(f), icone: iconeApprentissage(lien?.ad.variable), etat, titre: a.enonce,
      preuve: preuve ? preuve.map((x) => ({ texte: ' ', image: x.ad.image, libelle: x.libelle, part: x.part, gagne: x.gagne })) : null,
      pied: piedApprentissage(f), usage: dansLesRegles ? 'dans les règles de la marque' : null,
      action: actionApprentissage(f),
      tiroir: tiroirApprentissage(f, lien?.lot ? conclusions.get(lien.lot.id) ?? null : null),
      gestes: {
        learningId: a.id,
        regles: refusVersRegles(f, dansLesRegles) ?? fermeRegles,
        rejete: a.statut === 'validated' ? a.refute : null,
        hypothese: {
          depart: departDepuisApprentissage(a.enonce, { variable: lien?.ad.variable, rejete: a.refute }),
          note: noteDepartApprentissage({ rejete: a.refute }),
        },
      },
    };
  });

  return <Apprentissages sousNav={sousNavResultats({ admin: g.admin })} cartes={[...aValider, ...cartes]} filtresEtat />;
}
