import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import { roleAtLeast } from '../../../lib/rbac';
import { getActiveBrand } from '../../../lib/brands';
import { storageConfigured } from '@tiktrends/integrations';
import { messageErreurConnexionDrive, etatConnexionDrive, fusionnerBibliotheque, LIMITE_BIBLIOTHEQUE } from '@tiktrends/core';
import { listAssets } from '../../actions/assets';
import { getDriveState } from '../../actions/drive';
import { listerSortiesStudiosBibliotheque, sortieCommeAsset } from '../../../lib/studios/bibliotheque';
import { listerCreationsHistoriques, creationCommeAsset } from '../../../lib/creations-historiques';
import { PageInfo } from '../../../components/PageInfo';
import { AssetsLibrary } from './AssetsLibrary';
import { DriveConnect } from './DriveConnect';
import { cadrePage, cadreSignal, h1 } from '../../../components/ui';

export const dynamic = 'force-dynamic';

export default async function AssetsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'member')) redirect('/dashboard');

  const sp = (await searchParams) ?? {};
  const okDrive = sp.ok === 'drive';
  const isAdmin = roleAtLeast(s.role, 'admin');
  const [historique, studios, anciennes, brand, driveState] = await Promise.all([
    listAssets(),
    listerSortiesStudiosBibliotheque(),
    listerCreationsHistoriques(),
    getActiveBrand(s.workspaceId),
    isAdmin ? getDriveState() : Promise.resolve(null),
  ]);
  // Une seule bibliothèque · les sorties LIVRÉES des projets Studios (lecture
  // seule, servies par leur route gardée) rejoignent les médias historiques,
  // du plus récent au plus ancien (`fusionnerBibliotheque`, noyau).
  // Les créations des anciens studios (retirés le 10/10) y entrent aussi, en
  // lecture seule · la bibliothèque est désormais leur seul accès.
  const assets = fusionnerBibliotheque(fusionnerBibliotheque(historique, studios.map(sortieCommeAsset), LIMITE_BIBLIOTHEQUE), anciennes.map(creationCommeAsset), LIMITE_BIBLIOTHEQUE);
  const nStudios = assets.filter((a) => a.studio).length;
  const nAnciennes = assets.filter((a) => a.historique).length;
  // Copie client du retour Google · aucun nom de variable ni de protocole, et
  // jamais un geste absent de l'écran · le message suit l'état Drive AFFICHÉ
  // (recette #106 · `messageErreurConnexionDrive`, garde assets-retour-drive).
  const errDrive = typeof sp.e === 'string' && sp.e.startsWith('drive') ? messageErreurConnexionDrive(sp.e, etatConnexionDrive(driveState)) : '';
  // Mobilisables par l'IA · la bibliothèque historique seulement (une sortie Studios n'a pas de bascule IA).
  const imgCount = assets.filter((a) => a.kind === 'image' && !a.studio && !a.historique).length;
  const storageOn = storageConfigured();

  return (
    <main style={cadrePage}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={h1}>Bibliothèque</h1>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', padding: '3px 9px', borderRadius: 999, color: 'var(--on-accent)', background: 'var(--grad-accent)' }}>BIBLIOTHÈQUE</span>
        <span style={{ flex: 1 }} />
        {/* Portée du compteur · médias de la BIBLIOTHÈQUE (importés ou téléversés),
            sorties livrées des projets Studios et créations des anciens studios. */}
        <span title="Médias importés ou téléversés, sorties livrées des projets Studios et créations des anciens studios" style={{ fontSize: 12.5, color: 'var(--muted)' }}>{assets.length} asset(s) en bibliothèque{nStudios ? ` dont ${nStudios} issu(s) des Studios` : ''}{nAnciennes ? `${nStudios ? ',' : ' dont'} ${nAnciennes} création(s) historique(s)` : ''}{imgCount ? ` · ${imgCount} image(s) mobilisable(s) par l'IA` : ''}</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 14 }}>
        Tes rushs, images, vidéos, audio et imports (Drive, liens), les sorties livrées de tes projets Studios et les créations des anciens studios (en lecture seule). {brand ? <>Rattachés à <b>{brand.name}</b> par défaut, ou communs à l'espace.</> : 'Communs à ton espace de travail.'}
      </p>
      <PageInfo title="bibliothèque d'assets">
        Centralise ici tes médias. Les <b>images</b> marquées « IA » servaient de références aux anciens studios de
        génération, retirés le 10/10 · les projets Studios ne les lisent pas encore (leur produit et leurs références se choisissent dans le projet).
        {storageOn
          ? <> Le <b>stockage objet est actif</b> : téléverse directement images, <b>vidéos</b> et audio (jusqu'à 1 Go).</>
          : <> Sans stockage objet configuré, les images sont optimisées et les vidéos/audio s'ajoutent par lien (Drive, URL).</>}
      </PageInfo>

      {(okDrive || errDrive) && (
        // Retour de connexion · rôle `signal` · sa couleur sémantique, pas la bordure des contrôles (lot 19D).
        <div style={{ marginTop: 14, padding: '10px 14px', fontSize: 12.5, ...cadreSignal(errDrive ? 'rgba(255,77,109,.4)' : 'rgba(24,204,140,.4)'), background: errDrive ? 'rgba(255,120,140,.08)' : 'rgba(126,232,191,.08)', color: errDrive ? '#ff9db0' : '#7ee8bf' }}>
          {errDrive || 'Google Drive connecté · choisis un dossier à synchroniser ci-dessous.'}
        </div>
      )}

      {driveState && (
        <div style={{ marginTop: 16 }}>
          <DriveConnect state={driveState} />
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <AssetsLibrary initial={assets} brandName={brand?.name ?? null} storageEnabled={storageConfigured()} isAdmin={isAdmin} />
      </div>
    </main>
  );
}
