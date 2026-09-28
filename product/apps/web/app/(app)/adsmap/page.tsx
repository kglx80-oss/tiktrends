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
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { SectionEssais } from '../jarvis/sections/SectionEssais';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'adsmap')!;

/**
 * ADSMAP · deux lectures du même graphe.
 *
 * La Table répond à « où en est ce test » et porte la compatibilité descendante
 * avec le tableur. La Carte répond à ce qu'aucune ligne ne dira jamais : d'où
 * vient ce gagnant, et qu'est-ce qu'on n'a pas encore essayé.
 */
export default async function AdsMapPage() {
  const s = await getSession();
  if (!s) redirect('/login');

  if (!canAccess(effectiveAccess(s), feature)) {
    const why = denyReason(effectiveAccess(s), feature);
    return (
      <main style={{ padding: '30px clamp(16px, 4vw, 36px) 60px', maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 32px)', fontWeight: 500, color: 'var(--ink)' }}>Adsmap</h1>
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
      </main>
    );
  }

  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) {
    return (
      <main style={{ padding: '30px clamp(16px, 4vw, 36px) 60px', maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 32px)', fontWeight: 500, color: 'var(--ink)' }}>Adsmap</h1>
        <div style={{ marginTop: 20 }}>
          <Empty
            tone="todo" title="Sélectionne une marque active."
            why="Adsmap travaille marque par marque · chacune a sa carte, ses lots et ses seuils."
            action={{ label: 'Choisir une marque', href: '/brands' }}
          />
        </div>
      </main>
    );
  }

  const batches = await listBatchesAction();
  // Date de dernière mesure · un verdict de la semaine dernière présenté sans
  // date se lit comme un verdict d'aujourd'hui.
  const [row] = db
    ? await db.select({ at: schema.brands.adsmapSyncedAt }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1)
    : [];
  const peutMesurer = roleAtLeast(s.role, 'admin');

  return (
    <main style={{ padding: 'clamp(16px, 4vw, 32px) clamp(16px, 4vw, 32px) 60px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(26px, 4vw, 30px)', fontWeight: 500, color: 'var(--ink)' }}>Adsmap</h1>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>· {brand.name}</span>
        <span style={{ flex: 1, minWidth: 12 }} />
        {/* Il ne reste ici que ce qui AGIT sur la carte · mesurer, partager.
            Les six écrans du module vivent dans le rail, comme ceux du Studio :
            une barre de sept boutons n'est plus une navigation, c'est une
            barre d'outils saturée qu'on cesse de lire. */}
        {peutMesurer && <ShareButton />}
        {peutMesurer && <SyncButton syncedAt={row?.at ? row.at.toISOString() : null} />}
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 12, maxWidth: 720, lineHeight: 1.55 }}>
        Chaque test, son verdict, et ce qu’il t’apprend pour le suivant.
      </p>

      {/* Raccourcis locaux DISCRETS · préparer un test en amont, voir les suites en
          aval, sauter au cumul. Le rail garde la navigation complète du module ·
          ce ne sont pas des blocs, juste des liens repérables sous l'en-tête. */}
      <nav aria-label="Raccourcis Adsmap" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 14px' }}>
        {peutMesurer && <LienLocal href="/adsmap/lots" label="Préparer un test" />}
        <LienLocal href="/adsmap/suites" label="Voir les suites" />
        <LienLocal href="#appris" label="Apprentissages" ancre />
      </nav>

      <PageInfo title="lire cette carte">
        Une ad n’entre en test qu’avec une <b>hypothèse</b> et <b>une seule variable</b> modifiée : c’est ce qui permet
        d’attribuer un résultat à une cause. Le verdict est <b>calculé</b>, pas saisi · un astérisque signale un test
        hors protocole, dont la conclusion ne vaut que par comparaison au sein du lot. Le <b>CPA</b> est suivi de sa
        borne haute : avec peu d’achats, l’écart entre les deux dit à quel point le chiffre est encore incertain.
        L’onglet <b>Carte</b> montre la même chose autrement : avatar → désir → angle → concept → ad, avec les
        <b> branches mortes</b> en pointillé · un angle jamais décliné ou une gagnante jamais itérée ne se voient
        que là.
      </PageInfo>

      <Views batches={batches} canBuild={peutMesurer} />

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
