import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { canAccess, denyReason, FEATURES, roleAtLeast } from '../../../lib/rbac';
import { SyncButton } from './SyncButton';
import { ShareButton } from './ShareButton';
import { getActiveBrand } from '../../../lib/brands';
import { listBatchesAction } from '../../actions/adsmap';
import { PageInfo } from '../../../components/PageInfo';
import { Views } from './Views';
import { effectiveAccess } from '../../../lib/access';
import { Empty } from '../../../components/Empty';
import { Icon } from '../../../components/Icon';
import { CIBLE_TACTILE_MIN, lireLienProfondAdsmap } from '@tiktrends/core';
import { adsDeLaMarque } from '../../../lib/adsmap-marque';
import { SectionEssais } from '../jarvis/sections/SectionEssais';
import { cadrePage, colonneLecture, h1 } from '../../../components/ui';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'adsmap')!;

/**
 * ADSMAP · deux lectures du même graphe.
 *
 * La Table répond à « où en est ce test » et porte la compatibilité descendante
 * avec le tableur. La Carte répond à ce qu'aucune ligne ne dira jamais : d'où
 * vient ce gagnant, et qu'est-ce qu'on n'a pas encore essayé.
 */
export default async function AdsMapPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');

  if (!canAccess(effectiveAccess(s), feature)) {
    const why = denyReason(effectiveAccess(s), feature);
    return (
      <main style={cadrePage}><div style={colonneLecture('fil')}>
        <h1 style={h1}>Adsmap</h1>
        <div style={{ marginTop: 20, padding: 28, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface)', textAlign: 'center' }}>
          <div style={{ color: 'var(--muted)' }}><Icon name="lock" size={34} /></div>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, maxWidth: 460, margin: '10px auto 0', lineHeight: 1.6 }}>
            {why === 'plan'
              ? 'Adsmap est disponible à partir de l’offre Plus.'
              : 'Ton rôle ne permet pas d’accéder à Adsmap.'}
          </p>
          {why === 'plan' && (
            <Link href="/billing" style={{ display: 'inline-block', marginTop: 16, padding: '9px 18px', borderRadius: 999, background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 800, fontSize: 13, textDecoration: 'none' }}>
              Voir les formules ›
            </Link>
          )}
        </div>
      </div></main>
    );
  }

  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) {
    return (
      <main style={cadrePage}><div style={colonneLecture('fil')}>
        <h1 style={h1}>Adsmap</h1>
        <div style={{ marginTop: 20 }}>
          <Empty
            tone="todo" title="Sélectionne une marque active."
            why="Adsmap travaille marque par marque · chacune a sa carte, ses lots et ses seuils."
            action={{ label: 'Choisir une marque', href: '/brands' }}
          />
        </div>
      </div></main>
    );
  }

  const batches = await listBatchesAction();
  // Date de dernière mesure · un verdict de la semaine dernière présenté sans
  // date se lit comme un verdict d'aujourd'hui.
  const [row] = db
    ? await db.select({ at: schema.brands.adsmapSyncedAt }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1)
    : [];
  const peutMesurer = roleAtLeast(s.role, 'admin');

  // Le lien profond d'une carte du Studio (I1) · `?ad=<id>&depuis=studio` ouvre
  // le panneau de CE test. Lecture seule · l'ouvrir n'écrit rien. On ne l'ouvre
  // que si l'ad appartient à la marque active · sinon on le dit, sans afficher
  // le test d'une autre marque sous le nom de celle-ci.
  const profond = lireLienProfondAdsmap(await searchParams);
  const testProfond = profond.adId
    ? { adId: profond.adId, depuisStudio: profond.depuisStudio, introuvable: !(await adsDeLaMarque(s.workspaceId, brand.id, [profond.adId])).has(profond.adId) }
    : null;

  return (
    <main style={cadrePage}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={h1}>Adsmap</h1>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>· {brand.name}</span>
        <span style={{ flex: 1, minWidth: 12 }} />
        {/* Il ne reste ici que ce qui AGIT sur la carte · mesurer, partager.
            Les six écrans du module vivent dans le rail, comme ceux du Studio :
            une barre de sept boutons n'est plus une navigation, c'est une
            barre d'outils saturée qu'on cesse de lire. */}
        {peutMesurer && <ShareButton />}
        {peutMesurer && <SyncButton syncedAt={row?.at ? row.at.toISOString() : null} />}
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 3, marginBottom: 8, maxWidth: 720, lineHeight: 1.5 }}>
        Chaque test, son verdict, et ce qu’il t’apprend pour le suivant.
      </p>

      {/* Raccourcis locaux et aide sur UNE seule rangée · préparer un test en amont,
          voir les suites en aval, sauter au cumul, lire la carte. Le rail garde la
          navigation complète · on regroupe pour dégager le haut sans rien retirer. */}
      <nav aria-label="Raccourcis et aide Adsmap" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 10px' }}>
        {peutMesurer && <LienLocal href="/adsmap/lots" label="Préparer un test" />}
        <LienLocal href="/adsmap/suites" label="Voir les suites" />
        <LienLocal href="#appris" label="Apprentissages" ancre />
        <PageInfo title="lire cette carte" mb={0} minHeight={CIBLE_TACTILE_MIN}>
          Une ad n’entre en test qu’avec une <b>hypothèse</b> et <b>une seule variable</b> modifiée : c’est ce qui permet
          d’attribuer un résultat à une cause. Le verdict est <b>calculé</b>, pas saisi · un astérisque signale un test
          hors protocole, dont la conclusion ne vaut que par comparaison au sein du lot. Le <b>CPA</b> est suivi de sa
          borne haute : avec peu d’achats, l’écart entre les deux dit à quel point le chiffre est encore incertain.
          L’onglet <b>Carte</b> montre la même chose autrement : avatar → désir → angle → concept → ad, avec les
          <b> branches mortes</b> en pointillé · un angle jamais décliné ou une gagnante jamais itérée ne se voient
          que là.
        </PageInfo>
      </nav>

      <Views batches={batches} canBuild={peutMesurer} testProfond={testProfond} marque={brand.name} />

      {/* Ce que Jarvis a appris de ces tests · essais, Score Jarvis, relectures.
          Le cumul vit là où on lit les tests, plus sous la conversation. Self-porté
          (offre Plus, marque active) · l'écran Adsmap est déjà derrière la même
          porte, la section double la garde par sûreté et rend null sinon. */}
      <SectionEssais />
    </main>
  );
}

/**
 * Lien local discret · même repère tactile que le reste (cible 44), sans le poids
 * d'un bouton d'action. Interne via `Link`, ancre de page via `<a>` (le hash ne
 * change pas de route · Link le traiterait comme une navigation).
 */
function LienLocal({ href, label, ancre = false }: { href: string; label: string; ancre?: boolean }) {
  const style = {
    display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN,
    padding: '6px 13px', borderRadius: 999, border: '1px solid var(--line-2)',
    background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 12.5, fontWeight: 600,
    textDecoration: 'none', whiteSpace: 'nowrap',
  } as const;
  return ancre ? <a href={href} style={style}>{label}</a> : <Link href={href} style={style}>{label}</Link>;
}
