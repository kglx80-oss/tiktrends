import { redirect } from 'next/navigation';
import {
  REFUS_GESTE_JARVIS, lienJarvisContexte, lireCommentaireCible, lireGesteEssaiJarvis, lireNoeudCible, modeDisposition, modeGraphe, preparationTesterJarvis, segmentReserveProjets,
  variablesRattachement, type PreparationTesterJarvis,
} from '@tiktrends/core';
import { lireGesteEssaiPourProjet } from '../../../../../../lib/jarvis-gestes';
import { getSession } from '../../../../../../lib/auth';
import { Projet } from '../../../../../../spatial/vues/projet/Projet';
import { EtatProjet } from '../../../../../../spatial/vues/projet/EtatProjet';
import { chargerProjet } from './donnees';

export const dynamic = 'force-dynamic';

/**
 * Fiche d'un projet · Spatial (`/studio/projets/[id]`, maquette `projet`).
 * Mêmes gardes que la page V5 · session, garde studio (rôle, formule,
 * capacité « projets »), portée marque. `?version=<id>` ouvre une version
 * antérieure en lecture seule. `?disposition=libre` ouvre le canvas en
 * disposition libre (les couloirs restent le défaut) · `&graphe=lignee` y montre
 * la lignée du projet au lieu du graphe de production (lot 11). Hors portée ou inconnu ·
 * la même page neutre.
 *
 * Lot 5 quater (RJ G07) · `?geste=tester&reponse=<uuid>&contexte=…&id=…` ·
 * « Tester » depuis une réponse de Jarvis · la réponse et la liste fermée des
 * variantes du contexte sont RELUES (`lireGesteEssaiPourProjet`), la règle du
 * noyau rejouée (`preparationTesterJarvis`) · la variante doit être une
 * variante de CE projet, lue par cette page · l'onglet Créations s'ouvre, le
 * rattachement (ou le lot d'essai) pré-rempli · rien n'est rattaché ni préparé
 * sans le clic. Refusé, la phrase neutre, rien de pré-rempli.
 *
 * « Mes mentions » · `?commentaire=<uuid>` ouvre l'onglet Activité sur ce
 * commentaire (son ancre `#commentaire-<id>`, son filtre ouvert s'il est
 * résolu) · `&noeud=<clé>` choisit ce nœud dans la lignée (`#note-<id>`) ·
 * seulement des identifiants, relus par les lectures de la fiche · un
 * commentaire d'ailleurs n'est simplement pas dans la liste.
 */
export default async function ProjetSpatial({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { id } = await params;
  const sp = await searchParams;
  // Un segment fixe (`nouveau`) n'est jamais lu comme un projet · son propre écran Spatial (segment statique) le sert avant `[id]`.
  if (segmentReserveProjets(id)) return <EtatProjet projectId={id} raison={{ type: 'introuvable', message: 'Ce projet n’existe pas ou n’est pas accessible.' }} />;
  const r = await chargerProjet(s, id, typeof sp.version === 'string' ? sp.version : undefined);
  if (!r.ok) return <EtatProjet raison={r.raison} projectId={id} />;
  // « Demander à Jarvis » (lot 5) · posé seulement quand la conversation du projet est ouverte à la personne.
  const jarvis = r.props.jarvis.conversationOuverte ? lienJarvisContexte('projet', r.props.projet.id) : null;
  const geste = lireGesteEssaiJarvis(sp, 'tester');
  let tester: PreparationTesterJarvis | null = null;
  if (geste.etat !== 'absente') {
    const refus: PreparationTesterJarvis = { varianteId: null, mode: null, variable: null, essaiVariable: null, note: REFUS_GESTE_JARVIS };
    const lu = geste.etat === 'ok' ? await lireGesteEssaiPourProjet(s, geste) : null;
    const variantes = r.props.creations.variantes;
    const p = lu ? preparationTesterJarvis(lu.texte, {
      projectId: r.props.projet.id, variantes: lu.variantes, exclus: lu.exclus,
      admises: (v) => variablesRattachement(variantes.find((x) => x.id === v.varianteId)?.rattachement.aUnParent ?? false),
    }) : refus;
    // La variante pré-remplie est une de CELLES que cette page a lues · sinon rien (aucune autre source ne choisit pour elle).
    tester = p.varianteId && !variantes.some((x) => x.id === p.varianteId) ? refus : p;
  }
  // Lot 11 · le graphe du canvas libre lu dans l'adresse (production par défaut) · rien n'est écrit.
  const libre = r.props.libre?.ok ? { ok: true as const, canvas: { ...r.props.libre.canvas, grapheInitial: modeGraphe(sp.graphe), noeudInitial: lireNoeudCible(sp) } } : r.props.libre;
  // « Mes mentions » · le commentaire visé ouvre l'onglet Activité (s'il est offert à la session).
  const commentaire = lireCommentaireCible(sp);
  const activite = commentaire && r.props.activite ? { ...r.props.activite, commentaireCible: commentaire } : r.props.activite;
  return (
    <Projet {...r.props} libre={libre} activite={activite} dispositionInitiale={modeDisposition(typeof sp.disposition === 'string' ? sp.disposition : undefined)} demanderJarvis={jarvis ? { href: jarvis } : null}
      {...(commentaire && activite ? { ongletInitial: 'activite' as const } : {})}
      {...(tester ? { ongletInitial: 'crea' as const, creations: { ...r.props.creations, jarvis: tester } } : {})} />
  );
}
