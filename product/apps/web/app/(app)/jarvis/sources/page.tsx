import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../../lib/auth';
import { canAccess, FEATURES, roleAtLeast } from '../../../../lib/rbac';
import { effectiveAccess } from '../../../../lib/access';
import { isFounder } from '../../../../lib/founder';
import { getActiveBrand } from '../../../../lib/brands';
import { jarvisStats, jarvisMeasuredMemory } from '../../../../lib/jarvis-memory';
import { jarvisSnapshot, STATE_LABEL, type JarvisLayer } from '../../../../lib/jarvis-state';
import { spendStatus } from '../../../../lib/spend-guard';
import { currentDeployment } from '../../../../lib/deployment';
import { partDeMax, libelleTauxFraction } from '@tiktrends/core';
import { PageInfo } from '../../../../components/PageInfo';
import { Icon } from '../../../../components/Icon';
import { JarvisRules } from '../JarvisRules';
import { JarvisTraining } from '../JarvisTraining';
import { DescribePanel } from '../DescribePanel';
import { Empty } from '../../../../components/Empty';
import { BarreValeur } from '../../../../components/BarreValeur';

export const dynamic = 'force-dynamic';

const adsmap = FEATURES.find((f) => f.key === 'adsmap')!;

/**
 * Sources de Jarvis · ce qu'il sait de CETTE marque, et où il l'a appris.
 *
 * ── Ce que cette page est, et n'est plus ─────────────────────────────────────
 *
 * Elle a d'abord tout porté · mémoire, essais, attribution, accroches, marché,
 * réglages · un « Sources & bilan » fourre-tout coiffé du chat. La direction
 * validée l'a corrigé : chaque famille vit désormais à SA destination, là où on
 * la consulte vraiment ·
 *   · les essais, notes et relectures → Adsmap (la carte des tests) ;
 *   · l'attribution et la tendance → le bilan avancé d'Analytics ;
 *   · le marché → la Veille ;
 *   · les accroches et consignes → le contexte de marque, dans le chat.
 *
 * Il reste ici la SOURCE au sens strict : ce que Jarvis a mesuré de la marque
 * (sa mémoire), de quoi la nourrir (décrire les créas), l'état de ses couches, et
 * — pour le fondateur seul — les réglages maison et l'exploitation.
 *
 * ── Un point d'accès, et il ne bouge pas ─────────────────────────────────────
 *
 * Rien ne devient visible pour quelqu'un qui ne le voyait pas déjà : la mémoire
 * mesurée reste ouverte aux comptes Plus (`voitMemoire`), les réglages, les
 * moteurs et la dépense restent derrière `isFounder`.
 */
export default async function JarvisPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'member')) redirect('/dashboard');

  const fondateur = isFounder(s.user.email);
  const voitMemoire = canAccess(effectiveAccess(s), adsmap);
  const brand = await getActiveBrand(s.workspaceId);

  if (!brand) {
    return (
      <main style={{ padding: '30px clamp(16px, 4vw, 36px) 60px', maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 32px)', fontWeight: 500, color: 'var(--ink)' }}>Sources de Jarvis</h1>
        <div style={{ marginTop: 20 }}>
          <Empty
            tone="todo" title="Sélectionne une marque active."
            why="Jarvis apprend marque par marque · sa mémoire n’a de sens que rapportée à une marque précise."
            action={{ label: 'Choisir une marque', href: '/brands' }}
          />
        </div>
      </main>
    );
  }

  const [row] = db
    ? await db.select({
        creativeRules: schema.brands.creativeRules,
        jarvisLearnings: schema.brands.jarvisLearnings,
        jarvisTrainedAt: schema.brands.jarvisTrainedAt,
      }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1)
    : [];

  const snapshot = await jarvisSnapshot(brand.id, s.workspaceId);

  // On ne charge que ce qu'on affiche · la mémoire mesurée derrière l'offre, la
  // dépense derrière le fondateur.
  const [memoire, stats, depense] = await Promise.all([
    voitMemoire ? jarvisMeasuredMemory(brand.id, s.workspaceId) : Promise.resolve(''),
    voitMemoire ? jarvisStats(brand.id, s.workspaceId) : Promise.resolve(null),
    fondateur ? spendStatus() : Promise.resolve(null),
  ]);
  // Ce que ce serveur exécute · fondateur seulement, information d'exploitation.
  const deploiement = fondateur ? await currentDeployment() : null;

  return (
    <main style={{ padding: '30px clamp(16px, 4vw, 36px) 60px', maxWidth: 1180, margin: '0 auto' }}>
      {/* On arrive ici depuis la conversation · on doit pouvoir y retourner d'un geste. */}
      <Link href="/jarvis" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--muted)', textDecoration: 'none', marginBottom: 12 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        Retour à la conversation
      </Link>
      {/* En-tête sobre (charte) · plus de bandeau dégradé ni de tuile d'icône rose. */}
      <div style={{ padding: '4px 0 18px', marginBottom: 20, borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', color: 'var(--muted)', flexShrink: 0 }}><Icon name="brain" size={22} /></span>
          <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 32px)', fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--ink)' }}>Sources de Jarvis</h1>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>· {brand.name}</span>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--ink-2)', maxWidth: 640, lineHeight: 1.5 }}>
          Ce que Jarvis a mesuré de cette marque, et de quoi le nourrir · les essais, l’attribution
          et le marché se lisent à leur destination (Adsmap, Analytics, Veille).
        </p>
      </div>

      {/* Ce que CE serveur exécute · fondateur seulement. */}
      {deploiement && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          margin: '18px 0 0', padding: '10px 14px', borderRadius: 12,
          border: `1px solid ${deploiement.ok ? 'var(--line)' : 'rgba(245,166,35,.45)'}`,
          background: deploiement.ok ? 'var(--surface)' : 'rgba(245,166,35,.08)',
        }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>
            Ce serveur
          </span>
          <span style={{ fontSize: 12.5, color: deploiement.ok ? 'var(--ink-2)' : '#f5b043', lineHeight: 1.5, flex: '1 1 260px' }}>
            {deploiement.summary}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            maquette v{deploiement.renderVersion} · {deploiement.applied ?? '—'}/{deploiement.inBuild} migrations
            {deploiement.build ? ` · ${deploiement.build}` : ''}
          </span>
        </div>
      )}

      {/* 1 · L'état réel · avant toute promesse. */}
      <h2 style={{ margin: '30px 0 4px', fontSize: 19, fontWeight: 500, color: 'var(--ink)' }}>Ce qui tourne, en ce moment</h2>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--muted)', maxWidth: 720, lineHeight: 1.55 }}>
        Chaque couche dit si elle est alimentée, sur quel volume, et le geste qui l’allume quand elle ne l’est pas.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 11, marginBottom: 26 }}>
        {snapshot.layers.map((l) => <Layer key={l.key} l={l} />)}
      </div>

      {!voitMemoire && (
        <div style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: '20px 22px', marginBottom: 24 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>La mémoire mesurée demande l’offre Plus.</p>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 640 }}>
            Les couches ci-dessus tournent déjà. Ce qui s’ajoute avec Adsmap, c’est ce que Jarvis apprend
            de tes propres tests · les chiffres, les accroches qui ont gagné, et la vérification qu’il
            améliore vraiment les résultats.
          </p>
          <Link href="/billing" style={{ display: 'inline-block', marginTop: 12, padding: '9px 18px', borderRadius: 999, background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 800, fontSize: 12.5, textDecoration: 'none' }}>
            Voir les formules ›
          </Link>
        </div>
      )}

      {/* 2 · Ce qu'il a appris de cette marque · la mémoire mesurée. */}
      {stats && <MemoryBlock stats={stats} memoire={memoire} />}

      {/* 3 · De quoi nourrir cette mémoire · décrire les créas. */}
      {voitMemoire && <div id="decrire"><DescribePanel /></div>}

      {/* 4 · Les gestes qui nourrissent les couches, et où Jarvis rend ce qu'il sait. */}
      <h2 id="actions" style={{ margin: '30px 0 4px', fontSize: 19, fontWeight: 500, color: 'var(--ink)' }}>Ce qu’on lui demande</h2>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--muted)', maxWidth: 720, lineHeight: 1.55 }}>
        Les gestes qui nourrissent les couches ci-dessus, et les écrans où Jarvis rend ce qu’il a appris.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 11, marginBottom: 22 }}>
        <Action href="/adsmap" title="Adsmap" desc="Essais, notes et relectures · d’où vient tout ce que Jarvis sait." gate={voitMemoire} />
        <Action href="/analytics" title="Analytics" desc="Le bilan avancé · est-ce que Jarvis fait bouger tes résultats ?" gate={voitMemoire} />
        <Action href="/veille" title="Veille" desc="Ce que fait le marché, décrit avec la même grille que tes créas." gate={voitMemoire} />
        <Action href="/adsmap/suites" title="Suites" desc="Ce qu’il faut faire d’un test arbitré · et ce qu’il ne faut pas retoucher." gate={voitMemoire} />
      </div>

      {/* 5 · Ce que Jarvis coûte · fondateur uniquement, comme /admin/depenses. */}
      {depense && (
        <section style={{ marginTop: 22, padding: '15px 18px', borderRadius: 14, border: `1px solid ${depense.blocked ? '#ff8095' : 'var(--line)'}`, background: 'var(--surface)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Ce que Jarvis coûte</h2>
            <span style={{ flex: 1 }} />
            <Link href="/admin/depenses" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>Détail ›</Link>
          </div>
          <p style={{ margin: '7px 0 0', fontSize: 12.5, color: depense.blocked ? '#ff8095' : 'var(--ink-2)', lineHeight: 1.55 }}>
            {depense.summary} Aucun appel ne part sans passer par ce plafond · y compris les tiens.
          </p>
        </section>
      )}

      {/* 6 · Les réglages maison · fondateur seulement, comme avant. */}
      {fondateur && (
        <>
          <h2 style={{ margin: '32px 0 4px', fontSize: 19, fontWeight: 500, color: 'var(--ink)' }}>Réglages maison</h2>
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--muted)', maxWidth: 720, lineHeight: 1.55 }}>
            Ta couche par-dessus les modèles · visible de toi seul.
          </p>
          <div id="entrainement">
            <JarvisTraining brandName={brand.name} initial={row?.jarvisLearnings ?? ''} trainedAt={row?.jarvisTrainedAt ? row.jarvisTrainedAt.toISOString() : null} />
          </div>
          <div id="regles" style={{ marginTop: 22 }}>
            <JarvisRules brandName={brand.name} initial={row?.creativeRules ?? ''} />
          </div>

          <h2 style={{ margin: '28px 0 12px', fontSize: 19, fontWeight: 500, color: 'var(--ink)' }}>Moteurs orchestrés</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {ENGINES.map((e) => (
              <div key={e.name} style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: '14px 16px' }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', padding: '2px 7px', borderRadius: 999, color: 'var(--accent-strong)', border: '1px solid var(--line-2)' }}>{e.tag}</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginTop: 8 }}>{e.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>{e.role}</div>
              </div>
            ))}
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--muted)' }}>
            Les moteurs sont interchangeables (surchargeables par configuration) : Jarvis reste ta couche, quel que soit le fournisseur.
          </p>
        </>
      )}
    </main>
  );
}

/* -------------------------------------------------------------------------- */

const ENGINES: Array<{ tag: string; name: string; role: string }> = [
  { tag: 'IMAGE', name: 'Nano Banana 2 (Gemini)', role: 'Mise en scène produit fidèle' },
  { tag: 'VIDÉO', name: 'Kling 2.5 turbo pro', role: 'Animation des visuels' },
  { tag: 'COPY', name: 'Claude', role: 'Concepts, angles, copywriting' },
];

const TON: Record<string, { fg: string; bd: string }> = {
  on: { fg: '#7ee8bf', bd: 'rgba(126,232,191,.42)' },
  partial: { fg: '#ffcf8f', bd: 'rgba(245,166,35,.38)' },
  off: { fg: 'var(--muted)', bd: 'var(--line)' },
  always: { fg: 'var(--muted)', bd: 'var(--line)' },
};

function Layer({ l }: { l: JarvisLayer }) {
  const t = TON[l.state] ?? TON.off!;
  return (
    <div style={{ border: `1px solid ${t.bd}`, borderRadius: 14, background: 'var(--surface)', padding: '13px 15px', display: 'grid', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-flex', color: t.fg }}><Icon name={l.icon} size={17} /></span>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', flex: 1 }}>{l.title}</span>
        <span style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: t.fg, padding: '2px 7px', borderRadius: 999, border: `1px solid ${t.bd}`, whiteSpace: 'nowrap' }}>
          {STATE_LABEL[l.state]}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>{l.what}</div>
      <div style={{ fontSize: 11.5, color: t.fg === 'var(--muted)' ? 'var(--muted)' : t.fg, fontWeight: 600 }}>{l.detail}</div>
      {l.fix && (
        <Link href={l.fix.href} style={{ fontSize: 11.5, color: 'var(--accent-strong)', fontWeight: 700, textDecoration: 'none' }}>
          {l.fix.label} ›
        </Link>
      )}
    </div>
  );
}

function Action({ href, title, desc, gate }: { href: string; title: string; desc: string; gate: boolean }) {
  const inner = (
    <>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: gate ? 'var(--ink)' : 'var(--muted)' }}>
        {title} {!gate && <span style={{ display: 'inline-flex', verticalAlign: '-2px' }}><Icon name="lock" size={13} /></span>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.5 }}>{desc}</div>
    </>
  );
  const style = { border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: '13px 15px', textDecoration: 'none', display: 'block' } as const;
  return gate ? <Link href={href} style={style}>{inner}</Link> : <div style={{ ...style, opacity: 0.6 }}>{inner}</div>;
}

const DIM_LABEL: Record<string, string> = {
  mechanism: 'Mécanismes', hook_type: 'Types d’accroche', format: 'Formats',
  length_bucket: 'Durées', awareness: 'Stades de conscience', avatar: 'Avatars',
  talent: 'Talents', opening_type: 'Ouvertures', element: 'Éléments réutilisés',
  layout: 'Mises en page',
};
const ORDRE = ['mechanism', 'element', 'hook_type', 'opening_type', 'layout', 'format', 'length_bucket', 'awareness', 'talent', 'avatar'];

function MemoryBlock({ stats, memoire }: { stats: Awaited<ReturnType<typeof jarvisStats>>; memoire: string }) {
  const utiles = stats.stats.filter((r) => r.nConclusive >= 3 && r.hitRate !== null);
  const parDim = ORDRE
    .map((d) => ({ dim: d, rows: utiles.filter((r) => r.dimension === d).sort((a, b) => (b.hitRate ?? 0) - (a.hitRate ?? 0)) }))
    .filter((g) => g.rows.length > 0);
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  const globalRate = stats.globalRate;

  return (
    <>
      <h2 style={{ margin: '4px 0 4px', fontSize: 19, fontWeight: 500, color: 'var(--ink)' }}>Ce qu’il a appris de cette marque</h2>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--muted)', maxWidth: 760, lineHeight: 1.55 }}>
        Mesuré sur les tests de cette marque, pas déduit de règles générales. La répartition par
        dimension ci-dessous est <b>historique · indicative</b> · elle oriente chaque génération.
      </p>

      <PageInfo title="lire ce tableau">
        Deux taux, à ne pas confondre. Le <b>taux validé</b> (en tête) ne compte que les tests évalués
        au protocole · s’il n’y en a aucun, il est « {libelleTauxFraction(null)} », jamais 0 % · c’est le
        même chiffre qu’Adsmap. La <b>répartition historique</b> (par dimension) inclut les gagnantes
        relatives et les tests hors protocole · elle oriente, elle ne se revendique pas. Une ligne
        n’apparaît qu’à partir de <b>trois</b> tests concluants · en dessous, ce serait une anecdote
        présentée comme une loi.
      </PageInfo>

      {parDim.length === 0 ? (
        <Empty
          tone="wait" title="Rien d’appris pour l’instant."
          why={stats.nAds > 0
            ? `${stats.nAds} ad(s) suivies, mais aucun verdict concluant sur au moins trois tests d’un même type. Une ligne n’apparaît qu’à partir de trois · en dessous, ce serait une anecdote présentée comme une loi.`
            : 'Jarvis apprend des verdicts, pas des intentions · sa mémoire se remplit quand des tests sont arbitrés.'}
        />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 18 }}>
            <Stat
              label="Taux de réussite validé"
              value={libelleTauxFraction(stats.tauxProtocole.taux)}
              sub={`${stats.tauxProtocole.succes} / ${stats.tauxProtocole.evaluables} test(s) évaluable(s) au protocole`}
              strong
            />
            <Stat label="Ads suivies" value={String(stats.nAds)} />
            <Stat label="Signaux exploitables" value={String(utiles.length)} sub="au moins 3 tests" />
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            {parDim.map(({ dim, rows }) => (
              <section key={dim} style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: '15px 18px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>{DIM_LABEL[dim] ?? dim}</h3>
                <div style={{ display: 'grid', gap: 8 }}>
                  {rows.map((r) => {
                    const au_dessus = globalRate !== null && r.hitRate! > globalRate;
                    return (
                      <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 210, fontSize: 12.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.key}>{r.key}</span>
                        <div style={{ flex: 1, position: 'relative' }}>
                          <BarreValeur
                            part={partDeMax(r.hitRate ?? 0, 1)} hauteur={9} piste="var(--paper)"
                            couleur={au_dessus ? 'linear-gradient(90deg,#4fd1a5,#7ee8bf)' : 'var(--grad-accent)'}
                          />
                          {globalRate !== null && (
                            <div title="Moyenne historique de la marque" style={{ position: 'absolute', left: `${partDeMax(globalRate, 1) * 100}%`, top: -2, width: 1, height: 13, background: 'var(--muted)' }} />
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
            <details style={{ marginTop: 16 }}>
              <summary style={{ fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer' }}>Voir la mémoire de performance utilisée pour la génération</summary>
              <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                Part MESURÉE du contexte, injectée telle quelle · les autres éléments (usages du marché, accroches, préférences d’angles) ne sont pas affichés ici.
              </p>
              <pre style={{ marginTop: 10, padding: '14px 16px', borderRadius: 12, background: 'var(--paper)', border: '1px solid var(--line)', fontSize: 11.5, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', lineHeight: 1.6, fontFamily: 'ui-monospace, monospace' }}>
                {memoire}
              </pre>
            </details>
          )}
        </>
      )}
    </>
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
