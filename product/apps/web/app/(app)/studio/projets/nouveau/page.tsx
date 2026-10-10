import { redirect } from 'next/navigation';
import {
  aPermissionEspace, briefDepuisTest, capacitesDuRefus, etatNouveauProjet, lienRetourVeille, lireContexteNouveauProjet,
  notesContexte, objectifDepuisIteration, titreNouveauProjetParDefaut, CHEMIN_PROJETS, OBJECTIF_MAX, LIBELLES_TYPE_PROJET,
  type EtatRepriseIteration,
} from '@tiktrends/core';
import { getSession } from '../../../../../lib/auth';
import { getActiveBrand } from '../../../../../lib/brands';
import { effectiveAccess } from '../../../../../lib/access';
import { FEATURES, canAccess } from '../../../../../lib/rbac';
import { gardeSources } from '../../../../../lib/studios/sources/acces';
import { refusCapacite } from '../../../../../lib/studios/interrupteurs';
import { chargerSources } from '../../../../../lib/studios/sources/sources';
import { adsDeLaMarque } from '../../../../../lib/adsmap-marque';
import { adDetailAction } from '../../../../actions/adsmap-verdict';
import { CapaciteNonActive } from '../../../../../components/studios/CapaciteNonActive';
import { PreparationProjet } from '../../../../../components/studios/projet/PreparationProjet';
import { cadrePage, h1, sub } from '../../../../../components/ui';

export const dynamic = 'force-dynamic';

const ADSMAP = FEATURES.find((f) => f.key === 'adsmap')!;

/**
 * Préparer un projet · l'arrivée des anciens liens de création (Pubs IA, Image
 * IA, Vidéo IA, Textes IA, Veille, Adsmap, Radar, concurrents) et du geste
 * « Nouveau projet ».
 *
 * LECTURE SEULE à l'ouverture : rien n'est créé, généré ni facturé. Le contexte
 * de l'adresse (`lireContexteNouveauProjet`, noyau) est relu sous les droits
 * du serveur :
 *  · l'annonce sauvegardée (`ref`) est relue dans la portée de l'espace et des
 *    marques (`chargerSources`) · lisible, elle sera la source du projet ;
 *  · le test Adsmap (`iter`) est relu seulement avec l'accès Adsmap et dans la
 *    marque active · gagnant arbitré, son brief d'itération devient l'objectif ;
 *  · ce qui n'est pas repris est DIT (`notesContexte`), l'objectif reste
 *    modifiable · rien n'est perdu en silence.
 * Seul le clic « Créer le projet » écrit (`creerProjetDepuisContexte`).
 */
export default async function PreparerProjetPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const c = lireContexteNouveauProjet(await searchParams);

  const g = await gardeSources('studio.read');
  if (!g.ok) redirect(CHEMIN_PROJETS);
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return <main style={cadrePage}><CapaciteNonActive capacites={capacitesDuRefus(coupe)} /></main>;

  const active = await getActiveBrand(s.workspaceId);
  const peutProposer = aPermissionEspace(g.ctx.permissions, 'studio.propose');
  const etat = etatNouveauProjet({ peutProposer, marqueActive: active ? { id: active.id, name: active.name } : null });

  // L'annonce sauvegardée · relue dans la portée (lecture seule).
  let annonce: { annonceur: string } | null = null;
  if (c.ref) {
    const r = await chargerSources(g.ctx, [{ type: 'sauvegarde', id: c.ref }], { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
    if (r.ok && r.sources[0]) annonce = { annonceur: r.sources[0].annonceur || 'une annonce sauvegardée' };
  }

  // Le test Adsmap · accès Adsmap ET marque active, sinon refus sans détail.
  let iteration: EtatRepriseIteration = null;
  let depuisTest: { objectif: string; titre: string } | null = null;
  if (c.iter) {
    const adsmapOuvert = canAccess(effectiveAccess(s), ADSMAP);
    const dansMarque = adsmapOuvert && active ? (await adsDeLaMarque(s.workspaceId, active.id, [c.iter])).has(c.iter) : false;
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

  const objectif = [depuisTest?.objectif ?? '', c.objectif].filter(Boolean).join('\n').slice(0, OBJECTIF_MAX);
  const marqueNom = etat.etat === 'pret' ? etat.marque.nom : '';
  const titre = depuisTest?.titre ?? (annonce ? `D’après ${annonce.annonceur}` : titreNouveauProjetParDefaut(c.type, marqueNom || 'ta marque'));

  return (
    <main style={cadrePage}>
      <h1 style={h1}>Préparer un projet</h1>
      <p style={sub}>
        {c.aContexte
          ? 'Le contexte de ton lien est repris ci-dessous · relis-le, ajuste l’objectif, puis crée le projet. Rien n’est généré ni facturé ici.'
          : `Un projet ${LIBELLES_TYPE_PROJET[c.type]?.toLowerCase() ?? ''} pour ta marque active · rien n’est généré ni facturé ici.`}
      </p>
      <PreparationProjet
        etat={etat}
        initial={{ type: c.type, titre, objectif }}
        annonce={annonce && c.ref ? { ref: c.ref, annonceur: annonce.annonceur } : null}
        iterationReprise={iteration?.etat === 'reprise'}
        notes={notesContexte(c, { refJointe: !!annonce, iteration })}
        retourVeille={c.retourVeille ? { href: lienRetourVeille(c.retourVeille) ?? '/veille', rv: c.retourVeille } : null}
      />
    </main>
  );
}
