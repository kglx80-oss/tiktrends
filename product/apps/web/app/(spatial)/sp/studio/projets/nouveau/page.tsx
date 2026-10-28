import { redirect } from 'next/navigation';
import {
  aPermissionEspace, briefDepuisTest, capacitesDuRefus, etatNouveauProjet, lienRetourVeille, lireContexteNouveauProjet,
  notesContexte, objectifDepuisIteration, refusStudiosSpatial, titreNouveauProjetParDefaut,
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
import { NouveauProjet } from '../../../../../../spatial/vues/studios/NouveauProjet';
import { RefusStudios } from '../../../../../../spatial/vues/studios/Refus';

export const dynamic = 'force-dynamic';

const FEATURE_ADSMAP = FEATURES.find((f) => f.key === 'adsmap')!;

/**
 * « Nouveau projet » (Spatial) · mêmes gardes et même relecture du contexte que
 * la préparation V5 (`app/(app)/studio/projets/nouveau`) :
 *  · l'annonce sauvegardée (`ref`) est relue dans la portée (`chargerSources`) ;
 *  · le test Adsmap (`iter`, reprise d'itération) n'est repris qu'avec l'accès
 *    Adsmap, dans la marque active, et s'il est une gagnante arbitrée avec un
 *    apprentissage (`briefDepuisTest`) · son brief devient l'objectif ;
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
  if (c.ref) {
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

  const marqueNom = etat.etat === 'pret' ? etat.marque.nom : '';
  const objectif = [depuisTest && c.iter ? `Test source Adsmap : ${c.iter}` : '', depuisTest?.objectif ?? '', c.objectif].filter(Boolean).join('\n').slice(0, OBJECTIF_MAX);
  const titresParDefaut = Object.fromEntries(TYPES_NOUVEAU_PROJET.map((t) => [t, titreNouveauProjetParDefaut(t, marqueNom || 'ta marque')])) as Record<TypeNouveauProjet, string>;
  const titre = depuisTest?.titre ?? (annonce ? `D’après ${annonce.annonceur}` : titresParDefaut[c.type]);

  // Personas Adsmap et produits (avec leurs photos) de la marque active · la lecture de l'assistant, aucune écriture.
  const ouverture = etat.etat === 'pret' ? await ouvrirAssistantProjet() : null;
  const personas = ouverture?.ok ? ouverture.props.personas : [];
  const produits = ouverture?.ok ? ouverture.props.produits : [];
  const marques = (await listBrands(s.workspaceId)).filter((b) => g.ctx.marques.includes(b.id)).map((b) => ({ id: b.id, nom: b.name, active: b.id === active?.id }));

  // Le départ repris · l'annonce relue devient une référence (attachée au projet à sa création), le test gagnant devient le départ.
  const reference: DepartAssistant | null = annonce && c.ref
    ? { origine: 'veille', id: c.ref, titre: `D’après ${annonce.annonceur}`, intention: '', sources: [{ type: 'sauvegarde', id: c.ref }], testId: null }
    : null;
  const depart: DepartAssistant | null = depuisTest && c.iter
    ? { origine: 'iteration', id: c.iter, titre, intention: objectif, sources: [], testId: c.iter }
    : reference;
  const repris = [
    annonce ? `Source jointe au projet à sa création · l’annonce sauvegardée de ${annonce.annonceur}.` : '',
    iteration?.etat === 'reprise' ? 'Le brief du test Adsmap gagnant est repris dans l’intention · relis-le avant de continuer.' : '',
  ].filter(Boolean);

  return (
    <NouveauProjet
      sous={marqueNom ? `Studios · ${marqueNom}` : 'Studios'}
      etat={etat}
      marques={marques}
      ajouterMarque={roleAtLeast(s.role, 'admin') ? '/brands/new' : null}
      // Un lien porteur de contexte (test, annonce, objectif) ouvre directement le brief, où le repris est dit.
      initial={{ type: c.type, titre, intention: objectif, etape: c.aContexte ? 'brief' : 'start' }}
      titresParDefaut={titresParDefaut}
      personas={personas}
      produits={produits}
      contexte={{
        depart, references: reference ? [reference] : [], repris,
        notes: notesContexte(c, { refJointe: !!annonce, iteration }),
        retourVeille: c.retourVeille ? { href: lienRetourVeille(c.retourVeille) ?? '/veille' } : null,
      }}
    />
  );
}
