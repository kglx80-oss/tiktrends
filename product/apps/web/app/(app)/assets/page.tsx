import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import { roleAtLeast } from '../../../lib/rbac';
import { getActiveBrand } from '../../../lib/brands';
import { storageConfigured } from '@tiktrends/integrations';
import { listAssets } from '../../actions/assets';
import { PageInfo } from '../../../components/PageInfo';
import { AssetsLibrary } from './AssetsLibrary';

export const dynamic = 'force-dynamic';

export default async function AssetsPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'member')) redirect('/dashboard');

  const [assets, brand] = await Promise.all([listAssets(), getActiveBrand(s.workspaceId)]);
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

      <div style={{ marginTop: 16 }}>
        <AssetsLibrary initial={assets} brandName={brand?.name ?? null} storageEnabled={storageConfigured()} />
      </div>
    </main>
  );
}
