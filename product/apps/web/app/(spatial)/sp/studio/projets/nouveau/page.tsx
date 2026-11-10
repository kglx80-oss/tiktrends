import { redirect } from 'next/navigation';
import {
  aPermissionEspace, briefDepuisTest, capacitesDuRefus, etatNouveauProjet, lienRetourVeille, lireContexteNouveauProjet, lireRefsNouveauProjet,
  notesContexte, objectifDepuisIteration, refusStudiosSpatial, titreNouveauProjetParDefaut, REFUS_SELECTION_PROJET,
  CHEMIN_PROJETS, OBJECTIF_MAX, TYPES_NOUVEAU_PROJET,
  type EtatRepriseIteration, type TypeNouveauProjet,
} from '@tiktrends/core';
import { getSession } from '../../../../../../lib/auth';
import { getActiveBrand, listBrands } from '../../../../../../lib/brands';
import { effectiveAccess } from '../../../../../../lib/access';
import { FEATURES, canAccess, roleAtLeast } from '../../../../../../lib/rbac';
import { gardeSources } from '../../../../../../lib/studios/sources/acces';
import { refusCapacite } from '../../../../../../lib/studios/interrupteurs';
import { chargerSources } from '../../../../../../lib/studios/sources/sources';
import { adsDeLaMarque } from '../../../../../../lib/adsmap-marque';
import { adDetailAction } from '../../../../../actions/adsmap-verdict';
import { ouvrirAssistantProjet } from '../../../../../actions/studios/assistant';
import type { DepartAssistant } from '../../../../../actions/studios/departs-assistant';
import { couleursDeLaMarque } from '../../../../../../lib/studios/palette-marque';
import { NouveauProjet } from '../../../../../../spatial/vues/studios/NouveauProjet';
import { relireSelectionProjet } from '../../../../../../lib/sauvegardes-projet';
import { RefusStudios } from '../../../../../../spatial/vues/studios/Refus';
import { relireMediasBrief } from '../../../../../../lib/studios/medias-brief';

export const dynamic = 'force-dynamic';

const FEATURE_ADSMAP = FEATURES.find((f) => f.key === 'adsmap')!;

/**
 * « Nouveau projet » (Spatial) · mêmes gardes et même relecture du contexte que
 * la préparation V5 (`app/(app)/studio/projets/nouveau`) :
 *  · l'annonce sauvegardée (`ref`) est relue dans la portée (`chargerSources`) ;
 *  · le test Adsmap (`iter`, reprise d'itération) n'est repris qu'avec l'accès
 *    Adsmap, dans la marque active, et s'il est une gagnante arbitrée avec un
 *    apprentissage (`briefDepuisTest`) · son brief devient l'objectif ;
 *  · les médias de la Bibliothèque (`media`, lot 12 · « Ajouter au brief »)
 *    sont relus dans l'espace et pour la marque active (`relireMediasBrief`) ·
 *    seuls les retenus sont proposés comme références, versés à « Continuer »
 *    avec le rôle et la portée choisis (`verserSelectionDansProjet`) ;
 *  · ce qui n'est pas repris est DIT (`notesContexte`).
 * L'assistant RÉEL s'y déroule (brief structuré, stratégie, style, format et
 * devis) · LECTURE SEULE à l'ouverture, rien n'est créé avant « Continuer
 * vers la stratégie » (création gratuite), rien n'est débité sans devis
 * annoncé puis confirmé.
 */
export default async function NouveauProjetSpatial({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const c = lireContexteNouveauProjet(await searchParams);

  const g = await gardeSources('studio.read');
  if (!g.ok) redirect(CHEMIN_PROJETS);
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return <RefusStudios titre="Nouveau projet" sous="Studios" refus={refusStudiosSpatial({ capacites: capacitesDuRefus(coupe), code: coupe.code, plan: false, message: coupe.message, traceId: coupe.traceId })} />;

  const active = await getActiveBrand(s.workspaceId);
  const peutProposer = aPermissionEspace(g.ctx.permissions, 'studio.propose');
  const etat = etatNouveauProjet({ peutProposer, marqueActive: active && g.ctx.marques.includes(active.id) ? { id: active.id, name: active.name } : null });

  let annonce: { annonceur: string } | null = null;
  // Lot 6 bis (SV01) · plusieurs `ref` (sélection des Sauvegardes) · relues ENSEMBLE dans la marque active, ou aucune.
  const refs = lireRefsNouveauProjet(await searchParams);
  const selection = refs.length > 1 ? await relireSelectionProjet({ ...g.ctx, marques: active && g.ctx.marques.includes(active.id) ? [active.id] : [] }, refs, { veilleOuverte: g.veilleOuverte }) : null;
  if (c.ref && !selection) {
    const r = await chargerSources({ ...g.ctx, marques: active && g.ctx.marques.includes(active.id) ? [active.id] : [] }, [{ type: 'sauvegarde', id: c.ref }], { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
    if (r.ok && r.sources[0]) annonce = { annonceur: r.sources[0].annonceur || 'une annonce sauvegardée' };
  }

  let iteration: EtatRepriseIteration = null;
  let depuisTest: { objectif: string; titre: string } | null = null;
  if (c.iter) {
    const adsmapOuvert = canAccess(effectiveAccess(s), FEATURE_ADSMAP);
    const dansMarque = adsmapOuvert && active && g.ctx.marques.includes(active.id) ? (await adsDeLaMarque(s.workspaceId, active.id, [c.iter])).has(c.iter) : false;
    const d = dansMarque ? (await adDetailAction(c.iter)).detail : undefined;
    if (!d) iteration = { etat: 'refuse' };
    else {
      const b = briefDepuisTest({
        adId: d.id, variantCode: d.variantCode, concept: d.concept, angle: d.angle, persona: d.persona, personaId: d.personaId,
        verdictStatus: d.verdictStatus, validated: d.validated, comparable: d.comparable,
        testedVariable: d.testedVariable, variableValue: d.variableValue,
        metrics: { cpa: d.metrics.cpa, hookRate: d.metrics.hookRate, ctr: d.metrics.ctr },
        learnings: d.learnings.map((l) => ({ statement: l.statement, confidence: l.confidence, scope: l.scope })),
      });
      if (b.eligible) { iteration = { etat: 'reprise' }; depuisTest = objectifDepuisIteration(b); }
      else iteration = { etat: 'non_eligible', motif: b.motif };
    }
  }

  // Lot 12 · « Ajouter au brief » de la Bibliothèque · relus en portée, marque active, sans droit de proposer rien n'est relu.
  const medias = etat.etat === 'pret' && c.medias.length ? await relireMediasBrief(s.workspaceId, c.medias, etat.marque.id) : [];

  const marqueNom = etat.etat === 'pret' ? etat.marque.nom : '';
  const objectif = [depuisTest && c.iter ? `Test source Adsmap : ${c.iter}` : '', depuisTest?.objectif ?? '', selection?.ok ? selection.brief : '', c.objectif].filter(Boolean).join('\n').slice(0, OBJECTIF_MAX);
  const titresParDefaut = Object.fromEntries(TYPES_NOUVEAU_PROJET.map((t) => [t, titreNouveauProjetParDefaut(t, marqueNom || 'ta marque')])) as Record<TypeNouveauProjet, string>;
  const titre = depuisTest?.titre ?? (selection?.ok ? selection.titre : annonce ? `D’après ${annonce.annonceur}` : titresParDefaut[c.type]);

  // Personas Adsmap et produits (avec leurs photos) de la marque active · la lecture de l'assistant, aucune écriture.
  const ouverture = etat.etat === 'pret' ? await ouvrirAssistantProjet() : null;
  const personas = ouverture?.ok ? ouverture.props.personas : [];
  // Lot 9 · le persona du lien (« Créer une pub » d'une fiche persona) n'est présélectionné que s'il est proposé ici (marque active, portée).
  const personaInitial = c.persona ? personas.find((x) => x.id === c.persona) ?? null : null;
  // Lot 9 bis · l'offre du lien (« Créer une pub » d'une offre de la fiche) · seulement une offre ACTIVE de la marque active.
  const offres = ouverture?.ok ? ouverture.props.offres : [];
  const allegations = ouverture?.ok ? ouverture.props.allegations : [];
  const offreInitiale = c.offre ? offres.find((x) => x.brief.id === c.offre)?.brief ?? null : null;
  const produits = ouverture?.ok ? ouverture.props.produits : [];
  // Lot 8 · les pastilles de la palette (étape Style) · la fiche de la marque active, dans la portée.
  const palette = etat.etat === 'pret' ? await couleursDeLaMarque(s.workspaceId, etat.marque.id).catch(() => []) : [];
  const marques = (await listBrands(s.workspaceId)).filter((b) => g.ctx.marques.includes(b.id)).map((b) => ({ id: b.id, nom: b.name, active: b.id === active?.id }));

  // Le départ repris · l'annonce relue devient une référence (attachée au projet à sa création), le test gagnant devient le départ.
  const reference: DepartAssistant | null = selection?.ok ? selection.references[0]! : annonce && c.ref
    ? { origine: 'veille', id: c.ref, titre: `D’après ${annonce.annonceur}`, intention: '', sources: [{ type: 'sauvegarde', id: c.ref }], testId: null }
    : null;
  const depart: DepartAssistant | null = depuisTest && c.iter
    ? { origine: 'iteration', id: c.iter, titre, intention: objectif, sources: [], testId: c.iter }
    : reference;
  const repris = [
    annonce ? `Source jointe au projet à sa création · l’annonce sauvegardée de ${annonce.annonceur}.` : '',
    medias.length ? `${medias.length > 1 ? `${medias.length} fichiers` : 'Un fichier'} de la Bibliothèque ${medias.length > 1 ? 'deviendront des références' : 'deviendra une référence'} du projet à sa création · choisis le rôle et la portée dans « Références ».` : '',
    selection?.ok ? `${selection.references.length} sources jointes au projet à sa création · les annonces sauvegardées de ${[...new Set(selection.annonceurs)].join(', ')} · leurs tags et notes sont proposés dans ton intention, à relire (rien n’est généré).` : '',
    iteration?.etat === 'reprise' ? 'Le brief du test Adsmap gagnant est repris dans l’intention · relis-le avant de continuer.' : '',
  ].filter(Boolean);

  return (
    <NouveauProjet
      sous={marqueNom ? `Studios · ${marqueNom}` : 'Studios'}
      etat={etat}
      marques={marques}
      ajouterMarque={roleAtLeast(s.role, 'admin') ? '/brands/new' : null}
      // Un lien porteur de contexte (test, annonce, objectif) ouvre directement le brief, où le repris est dit.
      initial={{ type: c.type, titre, intention: objectif, etape: c.aContexte ? 'brief' : 'start', persona: personaInitial, offre: offreInitiale }}
      titresParDefaut={titresParDefaut}
      personas={personas}
      offres={offres}
      allegations={allegations}
      produits={produits}
      paletteMarque={palette}
      contexte={{
        depart, references: selection?.ok ? selection.references : reference ? [reference] : [], repris, medias,
        notes: selection ? [...(selection.ok ? [] : [REFUS_SELECTION_PROJET]), ...notesContexte({ ...c, ref: null }, { refJointe: false, iteration, personaRetenu: !!personaInitial, offreRetenue: !!offreInitiale, mediasRetenus: medias.length })] : notesContexte(c, { refJointe: !!annonce, iteration, personaRetenu: !!personaInitial, offreRetenue: !!offreInitiale, mediasRetenus: medias.length }),
        retourVeille: c.retourVeille ? { href: lienRetourVeille(c.retourVeille) ?? '/veille' } : null,
      }}
    />
  );
}
