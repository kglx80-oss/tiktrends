import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { canAccess, FEATURES } from '../../../../lib/rbac';
import { effectiveAccess } from '../../../../lib/access';
import { getActiveBrand } from '../../../../lib/brands';
import { jarvisStats, jarvisMeasuredMemory } from '../../../../lib/jarvis-memory';
import { PageInfo } from '../../../../components/PageInfo';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'adsmap')!;

const DIM_LABEL: Record<string, string> = {
  mechanism: 'Mécanismes', hook_type: 'Types d’accroche', format: 'Formats',
  length_bucket: 'Durées', awareness: 'Stades de conscience', avatar: 'Avatars',
  talent: 'Talents', opening_type: 'Ouvertures', element: 'Éléments réutilisés',
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

  const [{ stats, globalRate, nAds }, memoire] = await Promise.all([
    jarvisStats(brand.id, s.workspaceId),
    jarvisMeasuredMemory(brand.id, s.workspaceId),
  ]);

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
