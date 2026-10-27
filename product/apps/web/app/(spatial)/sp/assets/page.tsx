import { redirect } from 'next/navigation';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { storageConfigured } from '@tiktrends/integrations';
import {
  connexionDrive, costFor, FUSEAU_ACCUEIL, donneesDrive, etatConnexionDrive, fusionnerBibliotheque, messageErreurConnexionDrive, messageServiceInactif, LIMITE_BIBLIOTHEQUE, LOT_ANALYSE_IMAGES,
  type DossierSource, type MediaSource,
} from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { roleAtLeast } from '../../../../lib/rbac';
import { refusEcritureBibliotheque, refusLectureBibliotheque, TEXTE_REFUS_BIBLIOTHEQUE } from '../../../../lib/bibliotheque-acces';
import { getActiveBrand } from '../../../../lib/brands';
import { listerSortiesStudiosBibliotheque, sortieCommeAsset } from '../../../../lib/studios/bibliotheque';
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
 * Sources · les médias (`listAssets`), les sorties livrées des projets Studios
 * et les créations des anciens studios (lecture seule), fusionnés comme en V5
 * (`fusionnerBibliotheque`) ; les dossiers (`library_folders`, corbeille
 * comprise) dans la portée de la marque active (ou communs), et le rangement et
 * les droits de chaque média, relus dans l'espace de la session. L'état Google
 * Drive n'est lu que pour un administrateur (comme en V5).
 */
export default async function BibliothequeSpatiale({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (refusLectureBibliotheque(s)) redirect('/dashboard');
  const refusEcriture = refusEcritureBibliotheque(s);
  const admin = roleAtLeast(s.role, 'admin');

  const [historique, studios, anciennes, marque, driveState] = await Promise.all([
    listAssets(),
    listerSortiesStudiosBibliotheque(),
    listerCreationsHistoriques(),
    getActiveBrand(s.workspaceId),
    admin ? getDriveState() : Promise.resolve(null),
  ]);
  const items = fusionnerBibliotheque(fusionnerBibliotheque(historique, studios.map(sortieCommeAsset), LIMITE_BIBLIOTHEQUE), anciennes.map(creationCommeAsset), LIMITE_BIBLIOTHEQUE);

  // Rangement, droits et type réel des médias de la bibliothèque · relus dans l'espace (jamais pris du navigateur).
  const idsMedias = items.filter((a) => !a.studio && !a.historique).map((a) => a.id);
  const extras = new Map<string, { folderId: string | null; rights: string | null; mimeType: string | null }>();
  let dossiers: DossierSource[] = [];
  if (db) {
    const F = schema.libraryFolders;
    const [lignes, rows] = await Promise.all([
      idsMedias.length
        ? db.select({ id: schema.assets.id, folderId: schema.assets.folderId, rights: schema.assets.rights, mimeType: schema.assets.mimeType })
          .from(schema.assets).where(and(eq(schema.assets.workspaceId, s.workspaceId), inArray(schema.assets.id, idsMedias)))
        : Promise.resolve([]),
      // Même portée que les médias · la marque active et les dossiers communs, sinon tout l'espace.
      db.select({ id: F.id, parentId: F.parentId, name: F.name, locked: F.locked, deletedAt: F.deletedAt, createdAt: F.createdAt }).from(F)
        .where(and(eq(F.workspaceId, s.workspaceId), ...(marque ? [or(eq(F.brandId, marque.id), isNull(F.brandId))!] : []))),
    ]);
    for (const l of lignes) extras.set(l.id, { folderId: l.folderId, rights: l.rights, mimeType: l.mimeType });
    dossiers = rows.map((d) => ({ ...d, deletedAt: d.deletedAt ? (d.deletedAt as Date).toISOString() : null, createdAt: (d.createdAt as Date).toISOString() }));
  }

  const medias: MediaSource[] = items.map((a) => ({
    id: a.id, name: a.name, kind: a.kind, source: a.source, url: a.url, thumbUrl: a.thumbUrl, sizeBytes: a.sizeBytes, createdAt: a.createdAt,
    mimeType: extras.get(a.id)?.mimeType ?? null, folderId: extras.get(a.id)?.folderId ?? null, rights: extras.get(a.id)?.rights ?? null,
    ...(a.studio ? { studio: { projetId: a.studio.projetId, projetTitre: a.studio.projetTitre, href: a.studio.href } } : {}),
    ...(a.historique ? { historique: a.historique } : {}),
    // Usage par l'IA (geste de l'écran V5) · seulement pour un média de la bibliothèque.
    ...(!a.studio && !a.historique ? { ia: { utilisable: a.useForAi, template: a.isTemplate, tags: a.tags ?? [] } } : {}),
  }));
  const sansTags = items.filter((a) => !a.studio && !a.historique && a.kind === 'image' && !(a.tags ?? []).length).length;
  const raisonAnalyse = refusEcriture ? TEXTE_REFUS_BIBLIOTHEQUE[refusEcriture] : !anthropicConfigured() ? messageServiceInactif('analyse_image') : null;

  // Retour de la connexion Google · la copie client existante, accordée à l'état AFFICHÉ.
  const sp = (await searchParams) ?? {};
  const retourDrive = sp.ok === 'drive' ? 'Google Drive connecté · choisis un dossier à synchroniser.'
    : typeof sp.e === 'string' && sp.e.startsWith('drive') ? messageErreurConnexionDrive(sp.e, etatConnexionDrive(driveState)) : null;

  return (
    <Bibliotheque
      donnees={donneesDrive({ dossiers, medias })}
      lectureSeule={refusEcriture ? TEXTE_REFUS_BIBLIOTHEQUE[refusEcriture] : null}
      stockage={storageConfigured()}
      drive={connexionDrive(driveState, FUSEAU_ACCUEIL)}
      maintenant={new Date().toISOString()}
      retourDrive={retourDrive}
      gestion={{
        // Même prix que l'écran V5 (`costFor('tag_image', 1)` par image), annoncé avant le clic.
        analyse: { cout: unlimitedCredits(s.user.email) ? null : costFor('tag_image', 1), raison: raisonAnalyse, sansTags, maxLot: LOT_ANALYSE_IMAGES },
        selecteurDrive: !!driveState?.pickerReady,
        admin,
      }}
    />
  );
}
