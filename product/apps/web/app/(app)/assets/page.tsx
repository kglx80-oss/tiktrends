import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import { roleAtLeast } from '../../../lib/rbac';
import { getActiveBrand } from '../../../lib/brands';
import { storageConfigured } from '@tiktrends/integrations';
import { listAssets } from '../../actions/assets';
import { getDriveState } from '../../actions/drive';
import { PageInfo } from '../../../components/PageInfo';
import { AssetsLibrary } from './AssetsLibrary';
import { DriveConnect } from './DriveConnect';

export const dynamic = 'force-dynamic';

const DRIVE_ERR: Record<string, string> = {
  drive_config: 'Connexion Drive non configurée (variables Google manquantes).',
  drive_state: 'Session OAuth invalide, réessaie la connexion Drive.',
  drive_session: 'Session expirée, reconnecte-toi puis relance la connexion Drive.',
  drive_norefresh: 'Google n’a pas renvoyé de jeton. Révoque l’accès dans ton compte Google puis reconnecte.',
  drive_exchange: 'Échec de l’échange OAuth avec Google. Réessaie.',
};

export default async function AssetsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'member')) redirect('/dashboard');

  const sp = (await searchParams) ?? {};
  const okDrive = sp.ok === 'drive';
  const errDrive = typeof sp.e === 'string' && sp.e.startsWith('drive') ? (DRIVE_ERR[sp.e] || 'Erreur de connexion Drive.') : '';

  const isAdmin = roleAtLeast(s.role, 'admin');
  const [assets, brand, driveState] = await Promise.all([
    listAssets(),
    getActiveBrand(s.workspaceId),
    isAdmin ? getDriveState() : Promise.resolve(null),
  ]);
  const imgCount = assets.filter((a) => a.kind === 'image').length;
  const storageOn = storageConfigured();

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Assets</h1>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>BIBLIOTHÈQUE</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{assets.length} asset(s){imgCount ? ` · ${imgCount} image(s) mobilisable(s) par l'IA` : ''}</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 14 }}>
        Tes rushs, images, vidéos, audio et imports (Drive, liens). {brand ? <>Rattachés à <b>{brand.name}</b> par défaut, ou communs à l'espace.</> : 'Communs à ton espace de travail.'}
      </p>
      <PageInfo title="bibliothèque d'assets">
        Centralise ici tes médias. Les <b>images</b> marquées « IA » servent automatiquement de références lors des
        générations (Pubs IA, Image IA) pour ta marque · quand la bibliothèque est remplie, l'IA s'en sert d'office.
        {storageOn
          ? <> Le <b>stockage objet est actif</b> : téléverse directement images, <b>vidéos</b> et audio (jusqu'à 1 Go).</>
          : <> Sans stockage objet configuré, les images sont optimisées et les vidéos/audio s'ajoutent par lien (Drive, URL).</>}
      </PageInfo>

      {(okDrive || errDrive) && (
        <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 12, fontSize: 12.5, border: '1px solid var(--line-2)', background: errDrive ? 'rgba(255,120,140,.08)' : 'rgba(126,232,191,.08)', color: errDrive ? '#ff9db0' : '#7ee8bf' }}>
          {errDrive || 'Google Drive connecté · choisis un dossier à synchroniser ci-dessous.'}
        </div>
      )}

      {driveState && (
        <div style={{ marginTop: 16 }}>
          <DriveConnect state={driveState} />
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <AssetsLibrary initial={assets} brandName={brand?.name ?? null} storageEnabled={storageConfigured()} />
      </div>
    </main>
  );
}
