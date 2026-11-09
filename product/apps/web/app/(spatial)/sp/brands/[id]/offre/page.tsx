import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  costFor, listePropre, morceauxTexte, prixEuros, resumeProduits, statutFicheProduit, messageServiceInactif,
  detailOffre, lienNouveauProjet, LIBELLES_STATUT_ALLEGATION, LIBELLES_TYPE_OFFRE, manquesOffres, ordonnerOffres, pastilleManquesOffres, signalAllegation, statutAllegation,
  accesHypothese, accesTestsOffre, bilanTestsOffre, choixIterationSpatial, entreesLectureOffres, gestesLectureGroupe, lectureOffres, lotsDuGroupe, noteGestesSilenceFiche,
  regleLectureOffres, testsDeLOffre, NOTE_GESTES_FICHE_OFFRE, type LectureGroupes, type PersonaRef,
} from '@tiktrends/core';
import { effectiveAccess } from '../../../../../../lib/access';
import { FEATURES, canAccess, denyReason } from '../../../../../../lib/rbac';
import { offresEtTests } from '../../../../../../lib/offres-tests';
import { iterationPlanAction } from '../../../../../actions/adsmap-iterate';
import { chargerLots, type DonneesLots } from '../../../adsmap/donnees';
import {
  addProductAction, deleteProductAction, importProductsAction, syncShopifyProductsAction,
  archiverAllegationAction, archiverOffreAction, enregistrerAllegationAction, enregistrerOffreAction,
} from '../../../../../actions/brand-detail';
import { brandMediaPreview } from '../../../../../../lib/brand-media-url';
import { Offre } from '../../../../../../spatial/vues/marque/Offre';
import type { LigneKv } from '../../../../../../spatial/vues/marque/base';
import { chargerMarque, propsSync } from '../donnees';

export const dynamic = 'force-dynamic';

const RESULTATS = FEATURES.find((f) => f.key === 'adsmap')!;

/** L'import des produits depuis le site · mêmes conditions que l'écran V5 (site renseigné, IA configurée), prix annoncé. */
function importer(c: Awaited<ReturnType<typeof chargerMarque>>) {
  const raison = !c.b.url ? 'Renseigne le site de la marque pour importer' : !c.aiReady ? messageServiceInactif('ia_profil') : null;
  return { action: raison ? null : importProductsAction, cout: c.unlimited ? null : costFor('brief'), raison };
}

export default async function OffreSpatiale({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await chargerMarque(id);
  const { b } = c;
  const produits = await db!.select().from(schema.products).where(eq(schema.products.brandId, b.id));
  // Lot 9 bis · les offres et les allégations de CETTE marque (de l'espace de la session · `chargerMarque`), archivées comprises.
  const O = schema.offers, C = schema.brandClaims;
  const [lignesOffres, lignesAllegations] = await Promise.all([
    db!.select().from(O).where(and(eq(O.brandId, b.id), eq(O.workspaceId, c.s.workspaceId))).orderBy(asc(O.createdAt)),
    db!.select().from(C).where(and(eq(C.brandId, b.id), eq(C.workspaceId, c.s.workspaceId))).orderBy(asc(C.createdAt)),
  ]);
  const offres = ordonnerOffres(lignesOffres.map((o) => ({ id: o.id, intitule: o.label, type: o.kind, conditions: o.conditions, active: o.active })));
  const allegations = [...lignesAllegations.filter((a) => !a.archivedAt), ...lignesAllegations.filter((a) => a.archivedAt)];
  const lus = produits.map((x) => ({ nom: x.name, prix: x.price, image: !!x.imageUrl, description: x.description }));

  // « Dans les tests » · les verdicts de la marque lus par offre (`lectureOffres`), les portes d'Adsmap et la marque ACTIVE,
  // comme la fiche persona · le plan d'itération n'est lu que si une offre SE DÉTACHE · rien n'est écrit ici.
  const acces = effectiveAccess(c.s);
  const adsmap = canAccess(acces, RESULTATS) ? 'ok' as const : denyReason(acces, RESULTATS) === 'plan' ? 'plan' as const : 'role' as const;
  const ferme = accesTestsOffre({ adsmap, marqueActive: c.estActive });
  const hypothese = accesHypothese({ adsmap, marqueActive: c.estActive });
  let tests: { d: DonneesLots; lecture: LectureGroupes; offre: (adId: string) => PersonaRef | null; planIds: ReadonlySet<string> } | null = null;
  if (!ferme) {
    const [d, ot] = await Promise.all([chargerLots(c.s.workspaceId, b.id), offresEtTests(c.s.workspaceId, b.id)]);
    const offre = (adId: string) => ot.parAd.get(adId)?.offre ?? null;
    const lecture = lectureOffres(entreesLectureOffres(d.lots, offre), ot.offres);
    const detache = lecture.groupes.some((x) => x.lecture === 'au_dessus' || x.lecture === 'en_dessous');
    const planIds = detache
      ? new Set(choixIterationSpatial((await iterationPlanAction()).view?.rows ?? [], () => undefined, { peutIterer: true }).filter((x) => x.selectionnable).map((x) => x.adId))
      : new Set<string>();
    tests = { d, lecture, offre, planIds };
  }
  const dansLesTests = (offreId: string) => {
    if (!tests) return { ferme: true as const, raison: ferme! };
    const t = testsDeLOffre(tests.lecture, offreId);
    const ids = tests.d.lots.flatMap((l) => l.ads).filter((a) => tests!.offre(a.id)?.id === offreId).map((a) => a.id);
    const gestes = t.groupe ? gestesLectureGroupe({ ref: t.groupe.ref, lecture: t.groupe.lecture, k: t.groupe.k, n: t.groupe.n, reference: t.groupe.reference },
      { groupe: 'offre', note: NOTE_GESTES_FICHE_OFFRE, prioritaires: [], testsDeLaMarque: ids, planIds: tests.planIds }) : null;
    return {
      ferme: false as const, ...bilanTestsOffre(tests.d.lots, tests.offre, offreId), lecture: t.lecture, phrase: t.phrase, regle: null,
      lotsDeTest: lotsDuGroupe(tests.d.lots, tests.offre, offreId),
      gestes, silence: !gestes && t.lecture !== 'aucun' ? noteGestesSilenceFiche('Cette offre') : null,
      raisonHypothese: hypothese.ouvert ? null : hypothese.raison,
    };
  };
  const premier = produits[0] ?? null;
  const interdits = listePropre(b.avoidWords, 8);
  const affirmer = premier ? morceauxTexte(premier.usp, 6) : [];
  const lignes: LigneKv[] = premier ? [
    premier.price != null ? { dt: 'Prix', dd: { type: 'texte', texte: prixEuros(premier.price) } } : { dt: 'Prix', dd: { type: 'vide', texte: 'Non renseigné' } },
    premier.description?.trim() ? { dt: 'Description', dd: { type: 'texte', texte: premier.description.trim() } } : { dt: 'Description', dd: { type: 'vide', texte: 'Non renseignée' } },
    affirmer.length ? { dt: 'Peut affirmer', dd: { type: 'pastilles', classe: 'g', pastilles: affirmer } } : { dt: 'Peut affirmer', dd: { type: 'vide', texte: 'Rien de renseigné' } },
    interdits.length ? { dt: 'Ne doit jamais dire', dd: { type: 'pastilles', classe: 'r', pastilles: interdits } } : { dt: 'Ne doit jamais dire', dd: { type: 'vide', texte: 'Aucun mot à éviter' } },
  ] : [];

  return (
    <Offre
      sousNav={c.sousNav} brandId={b.id} sync={propsSync(c)}
      produits={produits.map((x, i) => {
        const st = statutFicheProduit(lus[i]!);
        return { id: x.id, nom: x.name, image: x.imageUrl ? brandMediaPreview(b.id, x.imageUrl) : null, detail: st.detail, complet: st.complete };
      })}
      aCompleter={resumeProduits(lus).libelle}
      detail={premier ? { nom: premier.name, lignes } : null}
      ajouter={addProductAction}
      shopify={b.shopifyDomain ? { appel: syncShopifyProductsAction, domaine: b.shopifyDomain } : null}
      retours={c.retours}
      gestion={{
        retirer: deleteProductAction,
        importer: importer(c),
        boutique: { domaine: b.shopifyDomain ?? null, synchroniser: syncShopifyProductsAction },
      }}
      offres={{
        liste: offres.map((o) => ({
          id: o.id, intitule: o.intitule, detail: detailOffre(o), active: o.active,
          editable: { id: o.id, intitule: o.intitule, type: o.type, conditions: o.conditions },
          creerPub: !o.active
            ? { href: null, raison: 'Une offre archivée ne se choisit plus au brief · réactive-la d’abord' }
            : c.creerPub ? { href: lienNouveauProjet({ type: 'ads', offre: o.id }), raison: null } : { href: null, raison: 'Les Studios ne sont pas ouverts à ton rôle ou à ta formule' },
          tests: dansLesTests(o.id),
        })),
        regle: tests ? `Sur toute la marque · ${tests.lecture.phrase} ${regleLectureOffres()}` : null,
        manque: pastilleManquesOffres(manquesOffres(offres)),
        manquantes: manquesOffres(offres).map((t) => ({ type: t, libelle: LIBELLES_TYPE_OFFRE[t] })),
        gestes: { enregistrer: enregistrerOffreAction, archiver: archiverOffreAction, raison: null },
      }}
      allegations={{
        liste: allegations.map((a) => {
          const statut = statutAllegation(a.status);
          return {
            id: a.id, texte: a.text, preuve: a.proof, statut, libelleStatut: LIBELLES_STATUT_ALLEGATION[statut], signal: signalAllegation(statut),
            archivee: !!a.archivedAt, editable: { id: a.id, texte: a.text, preuve: a.proof, statut },
          };
        }),
        gestes: { enregistrer: enregistrerAllegationAction, archiver: archiverAllegationAction, raison: null },
      }}
    />
  );
}
