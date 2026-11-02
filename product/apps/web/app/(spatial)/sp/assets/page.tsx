import { redirect } from 'next/navigation';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { storageConfigured } from '@tiktrends/integrations';
import {
  connexionDrive, costFor, lireLienInterne, fichierLienALire, resoudreLienInterne, DRIVE_CONNEXION_INACTIVE, DRIVE_SELECTEUR_INACTIF, FUSEAU_ACCUEIL, etatConnexionDrive, fusionnerBibliotheque, lireFiltreTag, messageErreurConnexionDrive, messageServiceInactif, LIMITE_BIBLIOTHEQUE, LOT_ANALYSE_IMAGES,
  type DossierSource, type MediaSource,
} from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { roleAtLeast } from '../../../../lib/rbac';
import { refusEcritureBibliotheque, refusLectureBibliotheque, TEXTE_REFUS_BIBLIOTHEQUE } from '../../../../lib/bibliotheque-acces';
import { getActiveBrand } from '../../../../lib/brands';
import { listerSortiesStudiosBibliotheque, sortieCommeAsset } from '../../../../lib/studios/bibliotheque';
import { lireUtilisationsBibliotheque } from '../../../../lib/studios/bibliotheque-utilisations';
import { listerCreationsHistoriques, creationCommeAsset } from '../../../../lib/creations-historiques';
import { listAssets } from '../../../actions/assets';
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
 * Sources · les médias (`listAssets`, corbeille exclue), les fichiers mis à la
 * corbeille (`listAssets({ corbeille: true })`, montrés dans la seule section
 * « Corbeille »), les sorties livrées des projets Studios
 * et les créations des anciens studios (lecture seule), fusionnés comme en V5
 * (`fusionnerBibliotheque`) ; les dossiers (`library_folders`, corbeille
 * comprise) dans la portée de la marque active (ou communs), et le rangement et
 * les droits de chaque média, relus dans l'espace de la session. L'état Google
 * Drive n'est lu que pour un administrateur (comme en V5).
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
 * Au-delà des 400 médias chargés · `?fichier=<id>` d'un fichier absent de la
 * liste fait lire CE SEUL fichier (`fichierLienALire`, puis
 * `listAssets({ id })` · même garde, même espace, même portée, hors corbeille ;
 * son rangement relu avec les autres, dans la même requête). Il n'entre dans
 * les données de l'écran que si le lien le rouvre (`resoudreLienInterne` ·
 * dossier parent et ancêtres hors corbeille) · sinon la page est rendue
 * exactement comme sans paramètre.
 */
export default async function BibliothequeSpatiale({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (refusLectureBibliotheque(s)) redirect('/dashboard');
  const refusEcriture = refusEcritureBibliotheque(s);
  const admin = roleAtLeast(s.role, 'admin');

  const [historique, jetes, studios, anciennes, marque, driveState, utilisations] = await Promise.all([
    listAssets(),
    listAssets({ corbeille: true }),
    listerSortiesStudiosBibliotheque(),
    listerCreationsHistoriques(),
    getActiveBrand(s.workspaceId),
    admin ? getDriveState() : Promise.resolve(null),
    // « Utilisé dans » · les projets Studios que la session voit et qui citent un fichier (lecture seule, bornée · null sans lecture Studios).
    lireUtilisationsBibliotheque(),
  ]);
  const vivants = fusionnerBibliotheque(fusionnerBibliotheque(historique, studios.map(sortieCommeAsset), LIMITE_BIBLIOTHEQUE), anciennes.map(creationCommeAsset), LIMITE_BIBLIOTHEQUE);
  const charges = [...vivants, ...jetes];

  // Lien interne vers un fichier au-delà de ce que l'écran charge · lu SEUL, par la même lecture que la liste (aucune lecture sinon).
  const sp = (await searchParams) ?? {};
  const lu = lireLienInterne(sp);
  const aLire = fichierLienALire(lu, charges);
  const cible = aLire ? ((await listAssets({ id: aLire }))[0] ?? null) : null;
  const items = cible ? [...charges, cible] : charges;

  // Rangement, droits, type réel et corbeille des médias de la bibliothèque · relus dans l'espace (jamais pris du navigateur).
  const idsMedias = items.filter((a) => !a.studio && !a.historique).map((a) => a.id);
  const extras = new Map<string, { folderId: string | null; rights: string | null; mimeType: string | null; deletedAt: string | null }>();
  let dossiers: DossierSource[] = [];
  if (db) {
    const F = schema.libraryFolders;
    const [lignes, rows] = await Promise.all([
      idsMedias.length
        ? db.select({ id: schema.assets.id, folderId: schema.assets.folderId, rights: schema.assets.rights, mimeType: schema.assets.mimeType, deletedAt: schema.assets.deletedAt })
          .from(schema.assets).where(and(eq(schema.assets.workspaceId, s.workspaceId), inArray(schema.assets.id, idsMedias)))
        : Promise.resolve([]),
      // Même portée que les médias · la marque active et les dossiers communs, sinon tout l'espace.
      db.select({ id: F.id, parentId: F.parentId, name: F.name, brandId: F.brandId, locked: F.locked, colorTag: F.colorTag, deletedAt: F.deletedAt, createdAt: F.createdAt }).from(F)
        .where(and(eq(F.workspaceId, s.workspaceId), ...(marque ? [or(eq(F.brandId, marque.id), isNull(F.brandId))!] : []))),
    ]);
    for (const l of lignes) extras.set(l.id, { folderId: l.folderId, rights: l.rights, mimeType: l.mimeType, deletedAt: l.deletedAt ? (l.deletedAt as Date).toISOString() : null });
    dossiers = rows.map((d) => ({ ...d, deletedAt: d.deletedAt ? (d.deletedAt as Date).toISOString() : null, createdAt: (d.createdAt as Date).toISOString() }));
  }

  const enMedia = (a: (typeof items)[number]): MediaSource => ({
    id: a.id, name: a.name, kind: a.kind, source: a.source, url: a.url, thumbUrl: a.thumbUrl, sizeBytes: a.sizeBytes, createdAt: a.createdAt,
    mimeType: extras.get(a.id)?.mimeType ?? null, folderId: extras.get(a.id)?.folderId ?? null, rights: extras.get(a.id)?.rights ?? null, deletedAt: extras.get(a.id)?.deletedAt ?? null,
    ...(a.studio ? { studio: { projetId: a.studio.projetId, projetTitre: a.studio.projetTitre, href: a.studio.href } } : {}),
    ...(a.historique ? { historique: a.historique } : {}),
    // Usage par l'IA (geste de l'écran V5) · seulement pour un média de la bibliothèque.
    ...(!a.studio && !a.historique ? { ia: { utilisable: a.useForAi, template: a.isTemplate, tags: a.tags ?? [] } } : {}),
  });
  const medias = charges.map(enMedia);
  const sansTags = vivants.filter((a) => !a.studio && !a.historique && a.kind === 'image' && !(a.tags ?? []).length).length;
  const raisonAnalyse = refusEcriture ? TEXTE_REFUS_BIBLIOTHEQUE[refusEcriture] : !anthropicConfigured() ? messageServiceInactif('analyse_image') : null;

  // Retour de la connexion Google · la copie client existante, accordée à l'état AFFICHÉ.
  const retourDrive = sp.ok === 'drive' ? 'Google Drive connecté · choisis un dossier à synchroniser.'
    : typeof sp.e === 'string' && sp.e.startsWith('drive') ? messageErreurConnexionDrive(sp.e, etatConnexionDrive(driveState)) : null;

  const { donnees, ouverture } = resoudreLienInterne({ dossiers, medias }, cible ? enMedia(cible) : null, lu);
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
