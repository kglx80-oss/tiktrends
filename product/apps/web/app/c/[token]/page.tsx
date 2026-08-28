import type { Metadata } from 'next';
import { clientViewByToken } from '../../../lib/client-view';

export const dynamic = 'force-dynamic';

/**
 * Vue client d'une carte ADSMAP (§12).
 *
 * Page publique, hors de l'espace de travail : pas de session, pas de menu, pas
 * de marque TikTrends. Ce que le client doit voir, c'est le travail de SON
 * agence · un bandeau produit à cet endroit fait passer l'agence pour un
 * revendeur.
 *
 * Ce qui est affiché est choisi en amont, dans `clientViewByToken` : ni dépense,
 * ni CPA, ni hypothèse, ni apprentissage. La sélection SQL est la frontière ·
 * masquer à l'affichage laisserait les valeurs voyager jusqu'au navigateur.
 */

export const metadata: Metadata = {
  title: 'Résultats créatifs',
  // Un lien de partage n'a rien à faire dans un index de moteur de recherche.
  robots: { index: false, follow: false },
};

const VERDICT_LABEL: Record<string, string> = {
  winner: 'Gagnante', baby_winner: 'Gagnante naissante', relative_winner: 'Gagnante',
  loser: 'Écartée', inconclusive: 'Non concluant', insufficient_delivery: 'Non concluant',
};
const VERDICT_TON: Record<string, { bg: string; fg: string; bd: string }> = {
  winner: { bg: 'rgba(126,232,191,.12)', fg: '#7ee8bf', bd: 'rgba(126,232,191,.4)' },
  baby_winner: { bg: 'rgba(245,166,35,.12)', fg: '#ffcf8f', bd: 'rgba(245,166,35,.4)' },
  relative_winner: { bg: 'rgba(126,232,191,.08)', fg: '#a5dcc4', bd: 'rgba(126,232,191,.28)' },
  loser: { bg: 'transparent', fg: 'var(--muted)', bd: 'var(--line-2)' },
  inconclusive: { bg: 'transparent', fg: 'var(--muted)', bd: 'var(--line-2)' },
  insufficient_delivery: { bg: 'transparent', fg: 'var(--muted)', bd: 'var(--line-2)' },
};
const FORMAT_LABEL: Record<string, string> = {
  video_ugc: 'UGC', video_vsl: 'VSL', video_demo: 'Démo', video_story: 'Story',
  static: 'Visuel', image_carousel: 'Carrousel', gif: 'GIF',
};

export default async function ClientCardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const vue = await clientViewByToken(token);

  if (!vue) {
    return (
      <main style={wrap}>
        <div style={{ border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface)', padding: '40px 26px', textAlign: 'center' }}>
          <div style={{ fontSize: 30 }}>🔒</div>
          <p style={{ margin: '12px 0 0', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Ce lien n’est plus valable.</p>
          <p style={{ margin: '7px auto 0', fontSize: 13, color: 'var(--muted)', maxWidth: 400, lineHeight: 1.6 }}>
            Demande un lien à jour à la personne qui t’a partagé cette page.
          </p>
        </div>
      </main>
    );
  }

  const pct = (x: number) => `${Math.round(x * 100)} %`;
  const gagnantes = vue.ads.filter((a) => ['winner', 'baby_winner', 'relative_winner'].includes(a.verdict));
  const autres = vue.ads.filter((a) => !['winner', 'baby_winner', 'relative_winner'].includes(a.verdict));

  return (
    <main style={wrap}>
      <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, color: 'var(--ink)' }}>{vue.brandName}</h1>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 7, marginBottom: 22, maxWidth: 640, lineHeight: 1.6 }}>
        Les créas testées et ce qu’elles ont donné. Chaque ligne est un test dont le résultat a été
        arbitré · les tests en cours n’apparaissent pas tant qu’ils ne sont pas conclus.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 24 }}>
        <Stat label="Créas testées" value={String(vue.counts.tested)} />
        <Stat label="Gagnantes" value={String(vue.counts.winners)} strong />
        <Stat label="Taux de réussite" value={vue.hitRate === null ? '—' : pct(vue.hitRate)} sub="sur les tests conclus" />
      </div>

      {vue.ads.length === 0 ? (
        <div style={{ border: '1px dashed var(--line-2)', borderRadius: 16, padding: '34px 24px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)', fontWeight: 700 }}>Aucun test conclu pour l’instant.</p>
          <p style={{ margin: '6px auto 0', fontSize: 12.5, color: 'var(--muted)', maxWidth: 420, lineHeight: 1.6 }}>
            Les résultats apparaîtront ici au fur et à mesure que les tests en cours arrivent à leur terme.
          </p>
        </div>
      ) : (
        <>
          {gagnantes.length > 0 && <Groupe titre="Ce qui a gagné" ads={gagnantes} />}
          {autres.length > 0 && <Groupe titre="Les autres tests" ads={autres} />}
        </>
      )}

      {vue.updatedAt && (
        <p style={{ marginTop: 22, fontSize: 11.5, color: 'var(--muted)' }}>
          Mis à jour le {new Date(vue.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}.
        </p>
      )}
    </main>
  );
}

function Groupe({ titre, ads }: { titre: string; ads: Array<{ variantCode: string; concept: string; angle: string | null; format: string; verdict: string; launchedAt: string | null }> }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h2 style={{ margin: '0 0 10px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>{titre}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ads.map((a, i) => {
          const ton = VERDICT_TON[a.verdict] ?? VERDICT_TON.inconclusive!;
          return (
            <div key={`${a.concept}-${a.variantCode}-${i}`} style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', padding: '11px 14px',
            }}>
              <span style={{ flex: '1 1 240px', minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.35 }}>{a.concept}</span>
                {a.angle && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{a.angle}</span>}
              </span>
              <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{FORMAT_LABEL[a.format] ?? a.format}</span>
              {a.launchedAt && (
                <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {new Date(a.launchedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                </span>
              )}
              <span style={{
                padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
                background: ton.bg, color: ton.fg, border: `1px solid ${ton.bd}`,
              }}>
                {VERDICT_LABEL[a.verdict] ?? a.verdict}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div style={{ border: `1px solid ${strong ? 'rgba(126,232,191,.3)' : 'var(--line)'}`, borderRadius: 13, background: 'var(--surface)', padding: '12px 14px' }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: strong ? '#7ee8bf' : 'var(--ink)', marginTop: 4, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

const wrap = { padding: '44px 26px 70px', maxWidth: 860, margin: '0 auto' } as const;
