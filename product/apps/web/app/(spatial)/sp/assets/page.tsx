import { redirect } from 'next/navigation';
import { storageConfigured } from '@tiktrends/integrations';
import {
  connexionDrive, costFor, lireLienInterne, fichierLienALire, resoudreLienInterne, DRIVE_CONNEXION_INACTIVE, DRIVE_SELECTEUR_INACTIF, FUSEAU_ACCUEIL, etatConnexionDrive, FENETRE_BIBLIOTHEQUE, lireFiltreTag, messageErreurConnexionDrive, messageServiceInactif, LOT_ANALYSE_IMAGES,
  type DossierSource, type MediaSource,
} from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { roleAtLeast } from '../../../../lib/rbac';
import { refusEcritureBibliotheque, refusLectureBibliotheque, TEXTE_REFUS_BIBLIOTHEQUE } from '../../../../lib/bibliotheque-acces';
import { getActiveBrand } from '../../../../lib/brands';
import { listerSortiesStudiosBibliotheque, sortieCommeAsset } from '../../../../lib/studios/bibliotheque';
import { lireUtilisationsBibliotheque } from '../../../../lib/studios/bibliotheque-utilisations';
import { listerCreationsHistoriques, creationCommeAsset } from '../../../../lib/creations-historiques';
import { lireComptes, lireDossiersPortee, lireFenetre, lireMediaCible } from '../../../../lib/bibliotheque-pages';
import { getDriveState } from '../../../actions/drive';
import { anthropicConfigured } from '../../../../lib/ai-status';
import { unlimitedCredits } from '../../../../lib/credits';
import { Bibliotheque } from '../../../../spatial/vues/bibliotheque/Bibliotheque';

export const dynamic = 'force-dynamic';

/**
 * « Bibliothèque » Spatial · mêmes gardes et mêmes sources que `/assets` (V5).
 *
 * LECTURE · `refusLectureBibliotheque` (plancher de rôle) · sinon retour à
 * l'accueil. ÉCRITURE · `refusEcritureBibliotheque` (rôle ET offre) · refusée,
 * l'écran s'ouvre en lecture seule avec la vraie raison (les actions serveur la
 * revérifient de toute façon).
 *
 * Sources · les médias de la bibliothèque · une FENÊTRE (les
 * `FENETRE_BIBLIOTHEQUE` plus récents, vivants, et autant de la corbeille ·
 * `lireFenetre`) et les COMPTES EXACTS de toute la portée (une requête
 * agrégée · `lireComptes`) · chaque nombre de l'écran est exact, chaque liste
 * partielle le dit et se complète par « Charger plus » (curseur de la
 * fenêtre passé à l'écran · `pageBibliothequeAction`), la recherche porte sur
 * tout l'espace. Les sorties livrées des projets Studios et les créations des
 * anciens studios (lecture seule) gardent chacune leur borne, dite à l'écran
 * quand elle est atteinte (`tronque`). Les dossiers (`library_folders`,
 * corbeille comprise) dans la portée de la marque active (ou communs), le
 * rangement et les droits de chaque média lus dans la même requête que lui.
 * L'état Google Drive n'est lu que pour un administrateur (comme en V5).
 *
 * « Utilisé dans » · les projets Studios VISIBLES de la session (même lecture
 * que la page Studios) dont la version courante cite un fichier dans ses
 * références (`lireUtilisationsBibliotheque`, deux requêtes, bornée).
 *
 * Tags de couleur · chaque dossier porte son `color_tag` ; `?tag=<clé>` ouvre
 * l'écran filtré sur ce tag (clé hors catalogue · aucun filtre, `lireFiltreTag`).
 *
 * Lien interne (« Copier le lien ») · `?fichier=<id>` ouvre l'aperçu de ce
 * fichier, `?dossier=<id>` ce dossier. Lu ICI, après les gardes de la page
 * (un lecteur client est renvoyé à l'accueil comme sans paramètre), et résolu
 * dans les seules données lues pour cette session (`ouvertureLienInterne` ·
 * espace de la session, portée de la marque, hors corbeille) · un fichier d'un
 * autre espace, d'une marque hors portée, à la corbeille ou inconnu rend la
 * page exactement comme sans paramètre. Aucun jeton, aucune table · l'adresse
 * ne donne aucun droit.
 *
 * Au-delà de la fenêtre · `?fichier=<id>` d'un fichier absent de la liste
 * fait lire CE SEUL fichier (`fichierLienALire`, puis `lireMediaCible` · même
 * portée, hors corbeille, rangement compris, une lecture). Il n'entre dans les
 * données de l'écran que si le lien le rouvre (`resoudreLienInterne` ·
 * dossier parent et ancêtres hors corbeille) · sinon la page est rendue
 * exactement comme sans paramètre.
 */
export default async function BibliothequeSpatiale({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (refusLectureBibliotheque(s)) redirect('/dashboard');
  const refusEcriture = refusEcritureBibliotheque(s);
  const admin = roleAtLeast(s.role, 'admin');

  // La portée de la session · l'espace et la marque active (ses médias et les communs), la même que `listAssets`.
  const marque = await getActiveBrand(s.workspaceId);
  const portee = { workspaceId: s.workspaceId, marque: marque?.id ?? null };
  const [vivants, jetes, comptes, lignesDossiers, studios, anciennes, driveState, utilisations] = await Promise.all([
    // La fenêtre (les plus récents, vivants puis corbeille) et les comptes EXACTS de toute la portée · la suite vient par « Charger plus ».
    lireFenetre(portee, { corbeille: false, limite: FENETRE_BIBLIOTHEQUE }),
    lireFenetre(portee, { corbeille: true, limite: FENETRE_BIBLIOTHEQUE }),
    lireComptes(portee),
    lireDossiersPortee(portee),
    listerSortiesStudiosBibliotheque(),
    listerCreationsHistoriques(),
    admin ? getDriveState() : Promise.resolve(null),
    // « Utilisé dans » · les projets Studios que la session voit et qui citent un fichier (lecture seule, bornée · null sans lecture Studios).
    lireUtilisationsBibliotheque(),
  ]);
  // Les sources en lecture seule gardent chacune leur borne · elles ne poussent plus les médias hors de la fenêtre.
  const lecture = [...studios.map(sortieCommeAsset), ...anciennes.map(creationCommeAsset)].map((a): MediaSource => ({
    id: a.id, name: a.name, kind: a.kind, source: a.source, url: a.url, thumbUrl: a.thumbUrl, sizeBytes: a.sizeBytes, createdAt: a.createdAt,
    ...(a.studio ? { studio: { projetId: a.studio.projetId, projetTitre: a.studio.projetTitre, href: a.studio.href } } : {}),
    ...(a.historique ? { historique: a.historique } : {}),
  }));
  const medias = [...vivants.medias, ...jetes.medias, ...lecture];

  // Lien interne vers un fichier au-delà de ce que l'écran charge · lu SEUL, rangement compris (aucune lecture sinon).
  const sp = (await searchParams) ?? {};
  const lu = lireLienInterne(sp);
  const aLire = fichierLienALire(lu, medias);
  const cible = aLire ? await lireMediaCible(portee, aLire) : null;
  const dossiers: DossierSource[] = lignesDossiers.map((d) => ({ ...d, deletedAt: d.deletedAt ? (d.deletedAt as Date).toISOString() : null, createdAt: (d.createdAt as Date).toISOString() }));

  // Les images sans tags de toute la portée (comptes exacts · le critère de l'analyse en lot).
  const sansTags = comptes.filter((c) => !c.supprime).reduce((a, c) => a + c.sansTags, 0);
  const raisonAnalyse = refusEcriture ? TEXTE_REFUS_BIBLIOTHEQUE[refusEcriture] : !anthropicConfigured() ? messageServiceInactif('analyse_image') : null;

  // Retour de la connexion Google · la copie client existante, accordée à l'état AFFICHÉ.
  const retourDrive = sp.ok === 'drive' ? 'Google Drive connecté · choisis un dossier à synchroniser.'
    : typeof sp.e === 'string' && sp.e.startsWith('drive') ? messageErreurConnexionDrive(sp.e, etatConnexionDrive(driveState)) : null;

  const bornes = { creations: !!studios.tronque, anciens: !!anciennes.tronque };
  const { donnees, ouverture } = resoudreLienInterne({ dossiers, medias, comptes, bornes }, cible, lu);
  return (
    <Bibliotheque
      donnees={donnees}
      lectureSeule={refusEcriture ? TEXTE_REFUS_BIBLIOTHEQUE[refusEcriture] : null}
      stockage={storageConfigured()}
      drive={connexionDrive(driveState, FUSEAU_ACCUEIL)}
      maintenant={new Date().toISOString()}
      retourDrive={retourDrive}
      filtreTag={lireFiltreTag(sp.tag)}
      utilisations={utilisations}
      ouverture={ouverture}
      pagination={{ vivants: vivants.curseur, corbeille: jetes.curseur }}
      gestion={{
        // Même prix que l'écran V5 (`costFor('tag_image', 1)` par image), annoncé avant le clic.
        analyse: { cout: unlimitedCredits(s.user.email) ? null : costFor('tag_image', 1), raison: raisonAnalyse, sansTags, maxLot: LOT_ANALYSE_IMAGES },
        selecteurDrive: !!driveState?.pickerReady,
        admin,
        messageDrive: driveState && !driveState.available ? DRIVE_CONNEXION_INACTIVE : driveState?.connected && !driveState.pickerReady ? DRIVE_SELECTEUR_INACTIF : null,
      }}
    />
  );
}
