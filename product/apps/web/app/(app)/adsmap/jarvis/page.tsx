import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { canAccess, FEATURES } from '../../../../lib/rbac';
import { effectiveAccess } from '../../../../lib/access';
import { getActiveBrand } from '../../../../lib/brands';
import { jarvisStats, jarvisMeasuredMemory, jarvisHookView } from '../../../../lib/jarvis-memory';
import { PageInfo } from '../../../../components/PageInfo';
import { DescribePanel } from './DescribePanel';
import { MarketPanel } from './MarketPanel';
import { attributionViewAction } from '../../../actions/adsmap-attribution';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'adsmap')!;

const DIM_LABEL: Record<string, string> = {
  mechanism: 'Mécanismes', hook_type: 'Types d’accroche', format: 'Formats',
  length_bucket: 'Durées', awareness: 'Stades de conscience', avatar: 'Avatars',
  talent: 'Talents', opening_type: 'Ouvertures', element: 'Éléments réutilisés',
};
const HOOK_TON: Record<string, { bd: string; fg: string; label: string }> = {
  proven: { bd: 'rgba(126,232,191,.45)', fg: '#7ee8bf', label: 'a gagné ici' },
  market: { bd: 'rgba(245,166,35,.4)', fg: '#ffcf8f', label: 'marché' },
  untested: { bd: 'var(--line-2)', fg: 'var(--muted)', label: 'jamais tranchée' },
  refuted: { bd: 'rgba(254,44,85,.4)', fg: '#ff8095', label: 'a perdu ici' },
};

const ORDRE = ['mechanism', 'element', 'hook_type', 'opening_type', 'format', 'length_bucket', 'awareness', 'talent', 'avatar'];

/**
 * Ce que Jarvis a appris de cette marque.
 *
 * Une IA qui s'améliore sans qu'on voie sur quoi est une boîte noire : on affiche
 * donc exactement le tableau qui lui est injecté, et le texte brut en pied de page.
 * Un client qui voit « listicle, 3 gagnantes sur 8 » comprend pourquoi les
 * propositions changent · sinon il croit à un caprice du modèle.
 */
export default async function JarvisPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!canAccess(effectiveAccess(s), feature)) redirect('/adsmap');
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) redirect('/adsmap');

  const [{ stats, globalRate, nAds }, memoire, hooks, attribution] = await Promise.all([
    jarvisStats(brand.id, s.workspaceId),
    jarvisMeasuredMemory(brand.id, s.workspaceId),
    jarvisHookView(brand.id, s.workspaceId),
    attributionViewAction(),
  ]);
  const attr = attribution.view;

  const utiles = stats.filter((r) => r.nConclusive >= 3 && r.hitRate !== null);
  const parDim = ORDRE
    .map((d) => ({ dim: d, rows: utiles.filter((r) => r.dimension === d).sort((a, b) => (b.hitRate ?? 0) - (a.hitRate ?? 0)) }))
    .filter((g) => g.rows.length > 0);

  const pct = (x: number) => `${Math.round(x * 100)} %`;

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 1020, margin: '0 auto' }}>
      <Link href="/adsmap" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>‹ ADSMAP</Link>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '10px 0 4px' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Ce que Jarvis a appris</h1>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>· {brand.name}</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 18, maxWidth: 760, lineHeight: 1.6 }}>
        Mesuré sur les tests de cette marque, pas déduit de règles générales. Ce tableau est
        exactement ce qui est injecté dans chaque génération.
      </p>

      <PageInfo title="lire ce tableau">
        Le taux se lit sur les tests <b>concluants</b> : une ad non concluante n’apprend rien et ne compte
        nulle part. Une ligne n’apparaît qu’à partir de <b>trois</b> tests · en dessous, ce serait une
        anecdote présentée comme une loi. Jarvis applique la même règle : ce qu’il ne sait pas, il ne le dit pas.
      </PageInfo>

      {parDim.length === 0 ? (
        <div style={{ border: '1px dashed var(--line-2)', borderRadius: 16, padding: '34px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 26 }}>🧠</div>
          <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--ink)', fontWeight: 700 }}>Rien d’appris pour l’instant.</p>
          <p style={{ margin: '6px auto 0', fontSize: 12.5, color: 'var(--muted)', maxWidth: 480, lineHeight: 1.6 }}>
            {nAds > 0
              ? `${nAds} ad(s) suivies, mais aucun verdict concluant sur au moins trois tests d’un même type. Jarvis continue de travailler sur les règles maison en attendant.`
              : 'Importe ton tableau ou lance un premier lot : Jarvis apprend des verdicts, pas des intentions.'}
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 20 }}>
            <Stat label="Taux de réussite" value={globalRate === null ? '—' : pct(globalRate)} sub="gagnantes / concluantes" strong />
            <Stat label="Ads suivies" value={String(nAds)} />
            <Stat label="Signaux exploitables" value={String(utiles.length)} sub="au moins 3 tests" />
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            {parDim.map(({ dim, rows }) => (
              <section key={dim} style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: '15px 18px' }}>
                <h2 style={{ margin: '0 0 12px', fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>{DIM_LABEL[dim] ?? dim}</h2>
                <div style={{ display: 'grid', gap: 8 }}>
                  {rows.map((r) => {
                    const au_dessus = globalRate !== null && r.hitRate! > globalRate;
                    return (
                      <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 210, fontSize: 12.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.key}>{r.key}</span>
                        <div style={{ flex: 1, height: 9, background: 'var(--paper)', borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
                          <div style={{ width: `${(r.hitRate ?? 0) * 100}%`, height: '100%', borderRadius: 999, background: au_dessus ? 'linear-gradient(90deg,#4fd1a5,#7ee8bf)' : 'var(--grad-accent)' }} />
                          {globalRate !== null && (
                            <div title="Moyenne de la marque" style={{ position: 'absolute', left: `${globalRate * 100}%`, top: -2, width: 1, height: 13, background: 'var(--muted)' }} />
                          )}
                        </div>
                        <span style={{ width: 48, textAlign: 'right', fontSize: 12.5, fontWeight: 800, color: au_dessus ? '#7ee8bf' : 'var(--ink-2)' }}>{pct(r.hitRate!)}</span>
                        <span style={{ width: 84, textAlign: 'right', fontSize: 11.5, color: 'var(--muted)' }}>
                          {r.nWinners + r.nBaby}/{r.nConclusive} tests
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {memoire && (
            <details style={{ marginTop: 18 }}>
              <summary style={{ fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer' }}>Voir le texte exact injecté dans les générations</summary>
              <pre style={{ marginTop: 10, padding: '14px 16px', borderRadius: 12, background: 'var(--paper)', border: '1px solid var(--line)', fontSize: 11.5, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', lineHeight: 1.6, fontFamily: 'ui-monospace, monospace' }}>
                {memoire}
              </pre>
            </details>
          )}
        </>
      )}

      {/* La description des créas est ce qui alimente la moitié des dimensions
          ci-dessus · l'encart reste visible même quand le tableau est vide, parce
          que c'est justement là qu'il sert le plus. */}
      {/* Le contrôle AVANT tout le reste · un outil qui ne vérifie pas ses
          propres règles n'apprend pas, il accumule. */}
      {attr && (
        <section style={{
          marginTop: 22, padding: '16px 18px', borderRadius: 14,
          border: `1px solid ${attr.overall.conclusive ? 'rgba(126,232,191,.4)' : 'var(--line)'}`,
          background: 'var(--surface)',
        }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>
            Est-ce que Jarvis améliore vraiment les résultats ?
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: 720 }}>
            Les créas générées <b>avec</b> la mémoire, comparées à celles générées <b>sans</b>, sur les
            tests arbitrés. On ne cherche pas quelle accroche a produit quelle gagnante — c’est
            indécidable — mais si l’ensemble fait bouger le taux.
          </p>
          <p style={{
            margin: '11px 0 0', padding: '10px 13px', borderRadius: 10,
            background: 'var(--paper)', border: '1px solid var(--line)',
            fontSize: 12.5, fontWeight: 600, lineHeight: 1.55,
            color: attr.overall.conclusive
              ? (attr.overall.liftPoints ?? 0) > 0 ? '#7ee8bf' : '#ff8095'
              : 'var(--ink)',
          }}>
            {attr.overall.summary}
          </p>

          {attr.parts.some((p) => p.liftPoints !== null) && (
            <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
              {attr.parts.filter((p) => p.liftPoints !== null).map((p) => (
                <div key={p.part} style={{ display: 'flex', alignItems: 'baseline', gap: 9, fontSize: 12, flexWrap: 'wrap' }}>
                  <span style={{ width: 180, color: 'var(--ink-2)' }}>{p.label}</span>
                  <span style={{ fontWeight: 700, color: p.conclusive ? ((p.liftPoints ?? 0) > 0 ? '#7ee8bf' : '#ff8095') : 'var(--muted)' }}>
                    {(p.liftPoints ?? 0) > 0 ? '+' : ''}{Math.round((p.liftPoints ?? 0) * 100)} pt
                  </span>
                  <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>
                    {p.withIt.wins}/{p.withIt.n} contre {p.withoutIt.wins}/{p.withoutIt.n}
                    {!p.conclusive && ' · pas encore tranché'}
                  </span>
                </div>
              ))}
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                Ces trois lignes ne s’additionnent pas · une génération peut bénéficier des trois, ce
                sont trois comparaisons distinctes.
              </p>
            </div>
          )}

          <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
            Ce n’est pas une expérience contrôlée : le groupe témoin est plus ancien, et une marque qui
            progresse progresserait de toute façon. On ne conclut donc que si les intervalles de
            confiance ne se chevauchent pas.
          </p>
        </section>
      )}

      {/* Les accroches AVANT les panneaux d'action : c'est ce qu'on vient lire.
          Un tableau de catégories ne se réécrit pas, une phrase si. */}
      <section style={{ marginTop: 22, padding: '16px 18px', borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface)' }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Les accroches, mot pour mot</h2>
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: 720 }}>
          Le tableau du dessus donne des <b>catégories</b> · celui-ci donne les <b>phrases</b>. On n’écrit
          pas une publicité à partir d’une catégorie. Ces accroches sont injectées telles quelles dans
          chaque génération, avec ce qu’elles ont donné.
        </p>
        <p style={{ margin: '9px 0 0', fontSize: 12.5, color: 'var(--ink)', fontWeight: 600, lineHeight: 1.5 }}>
          {hooks.summary}
        </p>

        {hooks.entries.length > 0 && (
          <div style={{ marginTop: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {hooks.entries.slice(0, 14).map((h, i) => {
              const t = HOOK_TON[h.evidence] ?? HOOK_TON.untested!;
              return (
                <div key={`${h.evidence}-${i}`} style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 999, fontSize: 9.5, fontWeight: 800,
                    textTransform: 'uppercase', letterSpacing: '.04em', color: t.fg, border: `1px solid ${t.bd}`, whiteSpace: 'nowrap',
                  }}>{t.label}</span>
                  <span style={{ flex: '1 1 300px', minWidth: 0, fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.45 }}>
                    « {h.text} »
                  </span>
                  {h.evidence === 'market' && h.maxDaysRunning && (
                    <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {h.maxDaysRunning} j en ligne{h.advertisers > 1 ? ` · ${h.advertisers} annonceurs` : ''}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {hooks.counts.market > 0 && (
          <p style={{ margin: '12px 0 0', fontSize: 11, color: '#ffcf8f', lineHeight: 1.5 }}>
            Les accroches de concurrents ne sont jamais recopiées · le prompt l’interdit explicitement
            et demande d’en reprendre la mécanique, pas les mots.
          </p>
        )}
      </section>

      <DescribePanel />

      {/* La mémoire marché vient APRÈS la mémoire mesurée, à l'écran comme dans
          le prompt : ce que la marque a payé pour apprendre prime sur ce qu'on
          devine des autres. */}
      <MarketPanel />
    </main>
  );
}

function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div style={{ border: `1px solid ${strong ? 'rgba(254,44,85,.22)' : 'var(--line)'}`, borderRadius: 13, background: 'var(--surface)', padding: '12px 14px' }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color: strong ? 'var(--accent-strong)' : 'var(--ink)', marginTop: 4, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}
