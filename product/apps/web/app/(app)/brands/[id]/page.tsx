import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../../lib/auth';
import { roleAtLeast } from '../../../../lib/rbac';
import { ensureBrandEnriched } from '../../../../lib/enrich';
import { anthropicConfigured } from '../../../../lib/ai-status';
import { updateBrandAction } from '../../../actions/brands';
import {
  addPersonaAction, deletePersonaAction, addScenarioAction, deleteScenarioAction,
  addProductAction, deleteProductAction, importProductsAction, generateFullBrandAction,
} from '../../../actions/brand-detail';
import { input, lbl, Msg } from '../../../../components/ui';
import { BrandOverviewForm } from '../../../../components/BrandOverviewForm';
import { ShopifyConnect } from './ShopifyConnect';
import { BrandDA } from './BrandDA';

export const dynamic = 'force-dynamic';

type Tab = 'overview' | 'audience' | 'products' | 'competitors';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'overview', label: 'Aperçu' }, { key: 'audience', label: 'Audience' },
  { key: 'products', label: 'Produits' }, { key: 'competitors', label: 'Concurrents' },
];
const OK: Record<string, string> = { saved: 'Profil mis à jour.', created: 'Marque créée.', shopify: 'Boutique Shopify connectée : produits, images et DA importés.', generated: 'Profil généré depuis le site (profil, audience, concurrents).', persona: 'Persona ajouté.', scenario: 'Scénario ajouté.', product: 'Produit ajouté.', imported: 'Produits importés.' };
const ERR: Record<string, string> = { nourl: 'Renseigne le site de la marque pour importer.', ai: "IA non configurée sur le serveur.", credits: 'Crédits insuffisants.', import: "L'import a échoué, réessaie.", generate: "La génération a échoué, réessaie." };

const area = { ...input, minHeight: 74, resize: 'vertical' as const, lineHeight: 1.5, fontFamily: 'inherit' };
const card = { border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: 14, marginBottom: 12 } as const;
const sectionH = { margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' } as const;
const j = (a?: string[] | null) => (a ?? []).join(', ');
const delBtn = { padding: '7px 11px', borderRadius: 999, border: '1px solid rgba(255,77,109,.3)', background: 'transparent', color: '#ff9db0', fontWeight: 600, fontSize: 12, cursor: 'pointer' } as const;
const addBtn = { padding: '9px 15px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' } as const;

export default async function BrandDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; ok?: string; e?: string; n?: string; m?: string }>;
}) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  const { id } = await params;
  const { tab: tabRaw, ok, e, n, m } = await searchParams;
  const tab: Tab = (TABS.some((t) => t.key === tabRaw) ? tabRaw : 'overview') as Tab;

  if (!db) notFound();
  const [b0] = await db.select({ id: schema.brands.id }).from(schema.brands).where(and(eq(schema.brands.id, id), eq(schema.brands.workspaceId, s.workspaceId))).limit(1);
  if (!b0) notFound();
  // Enrichissement automatique (DA, produits, photos) · sans bouton, avant l'affichage.
  await ensureBrandEnriched(id);
  const [b] = await db.select().from(schema.brands).where(eq(schema.brands.id, id)).limit(1);
  if (!b) notFound();

  const [personas, scenarios, products, adAccounts] = await Promise.all([
    db.select().from(schema.personas).where(eq(schema.personas.brandId, id)),
    db.select().from(schema.scenarios).where(eq(schema.scenarios.brandId, id)),
    db.select().from(schema.products).where(eq(schema.products.brandId, id)),
    db.select().from(schema.adAccounts).where(eq(schema.adAccounts.brandId, id)),
  ]);
  const competitors = b.competitors ?? [];
  const aiReady = anthropicConfigured();

  const initials = b.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 940, margin: '0 auto' }}>
      <Link href="/brands" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>‹ Marques</Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '10px 0 4px', flexWrap: 'wrap' }}>
        <span style={{ width: 46, height: 46, borderRadius: 12, background: 'var(--grad-accent)', color: '#0d070c', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16 }}>{initials}</span>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>{b.name}</h1>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{[b.category || b.industry, b.url].filter(Boolean).join(' · ') || 'Profil à compléter'}</div>
        </div>
        <span style={{ flex: 1 }} />
        <Link href="/connections" style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid var(--line-2)', color: 'var(--ink-2)', fontWeight: 700, fontSize: 12.5, textDecoration: 'none' }}>Connexions</Link>
      </div>

      {/* Sous-navigation */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--line)', margin: '16px 0 20px', flexWrap: 'wrap' }}>
        {TABS.map((t) => {
          const active = t.key === tab;
          const count = t.key === 'audience' ? personas.length + scenarios.length : t.key === 'products' ? products.length : t.key === 'competitors' ? competitors.length : 0;
          return (
            <Link key={t.key} href={`/brands/${id}?tab=${t.key}`} style={{
              padding: '9px 14px', fontSize: 13.5, fontWeight: active ? 800 : 600, textDecoration: 'none',
              color: active ? 'var(--accent-strong)' : 'var(--muted)',
              borderBottom: `2px solid ${active ? 'var(--accent-strong)' : 'transparent'}`, marginBottom: -1,
            }}>{t.label}{count ? <span style={{ fontSize: 11, marginLeft: 6, color: 'var(--muted)' }}>{count}</span> : null}</Link>
          );
        })}
      </div>

      {ok && OK[ok] && <Msg kind="ok">{OK[ok]}{ok === 'imported' && n ? ` (${n})` : ''}</Msg>}
      {e && ERR[e] && <Msg kind="err">{ERR[e]}{m ? ` · ${m}` : ''}</Msg>}

      {/* ---------------- APERÇU ---------------- */}
      {tab === 'overview' && (() => {
        // Score de complétude du profil (comme le « brand context » d'Atria).
        const checks = [
          !!b.description, !!b.usp, !!b.audience, !!b.category, !!b.categoryNeeds,
          !!b.tone, (b.industryTags ?? []).length > 0, (b.colors ?? []).length > 0,
          scenarios.length > 0, personas.length > 0, products.length > 0, competitors.length > 0,
        ];
        const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
        const cards: Array<{ n: number; label: string; tab: Tab }> = [
          { n: adAccounts.length, label: 'Comptes pub', tab: 'products' },
          { n: scenarios.length, label: 'Scénarios', tab: 'audience' },
          { n: personas.length, label: 'Personas', tab: 'audience' },
          { n: products.length, label: 'Produits', tab: 'products' },
          { n: competitors.length, label: 'Concurrents', tab: 'competitors' },
        ];
        return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'var(--surface)' }}>
              <span style={{ position: 'relative', width: 30, height: 30, borderRadius: '50%', background: `conic-gradient(var(--accent-strong) ${score * 3.6}deg, var(--line-2) 0)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: 'var(--ink)' }}>{score}</span>
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>Contexte de marque</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Plus le profil est complet, meilleures sont les créas générées.</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 24 }}>
            {cards.map((c) => (
              <Link key={c.label} href={`/brands/${id}?tab=${c.tab}`} style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: '14px 16px', textDecoration: 'none' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{c.n}</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>{c.label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--accent-strong)', fontWeight: 700, marginTop: 8 }}>Voir ›</div>
              </Link>
            ))}
          </div>

          {/* Générer tout le profil depuis le site (profil + audience + concurrents) */}
          <form action={generateFullBrandAction} style={{ border: '1px solid var(--line-2)', borderRadius: 16, background: 'linear-gradient(180deg, rgba(254,44,85,.08), var(--surface))', padding: '16px 18px', margin: '4px 0 22px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <input type="hidden" name="brandId" value={b.id} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>✦ Générer tout le profil depuis le site</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2 }}>
                {aiReady ? <>L'IA lit <b>{b.url || 'le site'}</b> et remplit profil, USP, audience, personas, scénarios et concurrents. Ne remplace pas ce que tu as déjà saisi.</> : <>Nécessite la clé IA serveur.</>}
              </div>
            </div>
            <button type="submit" disabled={!aiReady} style={{ padding: '11px 20px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13.5, cursor: aiReady ? 'pointer' : 'default', background: 'var(--grad-accent)', color: '#0d070c', opacity: aiReady ? 1 : .5, whiteSpace: 'nowrap' }}>Générer maintenant</button>
          </form>

          <BrandDA brandId={b.id} logoUrl={b.logoUrl ?? null} colors={b.colors ?? []} fonts={b.fonts ?? []} />

        <BrandOverviewForm init={{
          id: b.id, name: b.name, url: b.url ?? '', description: b.description ?? '', usp: b.usp ?? '',
          audience: b.audience ?? '', category: b.category ?? '', categoryNeeds: b.categoryNeeds ?? '',
          moreAbout: b.moreAbout ?? '', industry: b.industry ?? '', industryTags: j(b.industryTags),
          tone: b.tone ?? '', languages: j(b.languages), colors: j(b.colors), fonts: j(b.fonts),
          preferredWords: j(b.preferredWords), avoidWords: j(b.avoidWords), competitors: competitors.join('\n'),
        }} />
        </div>
        );
      })()}

      {/* ---------------- AUDIENCE ---------------- */}
      {tab === 'audience' && (
        <div>
          <h2 style={sectionH}>Scénarios <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 500 }}>{scenarios.length}</span></h2>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted)' }}>Contextes d'usage pour adapter chaque créa au bon moment.</p>
          {scenarios.map((sc) => (
            <div key={sc.id} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <b style={{ color: 'var(--ink)', fontSize: 14, flex: 1 }}>{sc.title}</b>
                <form action={deleteScenarioAction}><input type="hidden" name="brandId" value={id} /><input type="hidden" name="id" value={sc.id} /><button style={delBtn}>Retirer</button></form>
              </div>
              {sc.context && <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink-2)' }}>{sc.context}</p>}
            </div>
          ))}
          <form action={addScenarioAction} style={{ ...card, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <input type="hidden" name="brandId" value={id} />
            <div style={{ flex: '1 1 200px' }}><label style={lbl}>Titre</label><input name="title" placeholder="Session de travail nocturne" style={input} /></div>
            <div style={{ flex: '2 1 260px' }}><label style={lbl}>Contexte</label><input name="context" placeholder="Lieu, moment, situation" style={input} /></div>
            <button style={addBtn}>+ Ajouter</button>
          </form>

          <h2 style={{ ...sectionH, marginTop: 24 }}>Personas <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 500 }}>{personas.length}</span></h2>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted)' }}>Les personnes à qui s'adressent les créas.</p>
          {personas.map((p) => (
            <div key={p.id} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <b style={{ color: 'var(--ink)', fontSize: 14, flex: 1 }}>{p.name}</b>
                <form action={deletePersonaAction}><input type="hidden" name="brandId" value={id} /><input type="hidden" name="id" value={p.id} /><button style={delBtn}>Retirer</button></form>
              </div>
              {p.description && <p style={{ margin: '6px 0 8px', fontSize: 13, color: 'var(--ink-2)' }}>{p.description}</p>}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5 }}>
                {(p.pains ?? []).length > 0 && <span style={{ color: 'var(--muted)' }}>Frustrations : <span style={{ color: 'var(--ink-2)' }}>{(p.pains ?? []).join(', ')}</span></span>}
                {(p.desires ?? []).length > 0 && <span style={{ color: 'var(--muted)' }}>Désirs : <span style={{ color: 'var(--ink-2)' }}>{(p.desires ?? []).join(', ')}</span></span>}
              </div>
            </div>
          ))}
          <form action={addPersonaAction} style={{ ...card }}>
            <input type="hidden" name="brandId" value={id} />
            <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 220px' }}><label style={lbl}>Nom</label><input name="name" placeholder="L'étudiante déterminée" style={input} /></div>
              <div style={{ flex: '2 1 260px' }}><label style={lbl}>Description</label><input name="description" style={input} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 200px' }}><label style={lbl}>Frustrations <span style={{ color: 'var(--muted)' }}>(virgules)</span></label><input name="pains" style={input} /></div>
              <div style={{ flex: '1 1 200px' }}><label style={lbl}>Désirs <span style={{ color: 'var(--muted)' }}>(virgules)</span></label><input name="desires" style={input} /></div>
              <button style={addBtn}>+ Ajouter</button>
            </div>
          </form>
        </div>
      )}

      {/* ---------------- PRODUITS ---------------- */}
      {tab === 'products' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <h2 style={sectionH}>Produits <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 500 }}>{products.length}</span></h2>
            <span style={{ flex: 1 }} />
            <form action={importProductsAction}>
              <input type="hidden" name="brandId" value={id} />
              <button disabled={!aiReady || !b.url} title={!b.url ? 'Renseigne le site' : !aiReady ? 'IA non configurée' : 'Importe les produits depuis le site'} style={{ ...addBtn, opacity: aiReady && b.url ? 1 : .5, cursor: aiReady && b.url ? 'pointer' : 'default' }}>✦ Importer depuis le site</button>
            </form>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted)' }}>Les produits aident l'IA à générer des créas qui parlent vraiment de ton offre.</p>

          <ShopifyConnect brandId={id} initialDomain={b.shopifyDomain ?? null} />

          {products.map((p) => (
            <div key={p.id} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {p.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--line-2)' }} />
                )}
                <b style={{ color: 'var(--ink)', fontSize: 14, flex: 1, minWidth: 160 }}>{p.name}</b>
                {p.price != null && <span style={{ fontSize: 12.5, color: 'var(--accent-strong)', fontWeight: 700 }}>{p.price} €</span>}
                {p.url && <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--muted)' }}>fiche ↗</a>}
                <form action={deleteProductAction}><input type="hidden" name="brandId" value={id} /><input type="hidden" name="id" value={p.id} /><button style={delBtn}>Supprimer</button></form>
              </div>
              {p.description && <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink-2)' }}>{p.description}</p>}
              {p.usp && <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'pre-line' }}>{p.usp}</p>}
            </div>
          ))}
          {products.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>Aucun produit. Ajoute-en un, ou importe-les depuis le site.</p>}

          <form action={addProductAction} style={{ ...card }}>
            <input type="hidden" name="brandId" value={id} />
            <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '2 1 220px' }}><label style={lbl}>Nom du produit *</label><input name="name" required style={input} /></div>
              <div style={{ flex: '2 1 220px' }}><label style={lbl}>URL fiche</label><input name="url" style={input} /></div>
              <div style={{ flex: '0 1 110px' }}><label style={lbl}>Prix (€)</label><input name="price" inputMode="decimal" style={input} /></div>
            </div>
            <div style={{ marginBottom: 10 }}><label style={lbl}>Description</label><textarea name="description" style={area} /></div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}><label style={lbl}>Bénéfices / USP</label><input name="usp" style={input} /></div>
              <button style={addBtn}>+ Ajouter le produit</button>
            </div>
          </form>
        </div>
      )}

      {/* ---------------- CONCURRENTS ---------------- */}
      {tab === 'competitors' && (
        <form action={updateBrandAction}>
          <input type="hidden" name="id" value={b.id} />
          {/* on renvoie les autres champs inchangés pour ne pas les écraser */}
          <input type="hidden" name="name" value={b.name} />
          <input type="hidden" name="url" value={b.url ?? ''} />
          <input type="hidden" name="description" value={b.description ?? ''} />
          <input type="hidden" name="usp" value={b.usp ?? ''} />
          <input type="hidden" name="audience" value={b.audience ?? ''} />
          <input type="hidden" name="category" value={b.category ?? ''} />
          <input type="hidden" name="categoryNeeds" value={b.categoryNeeds ?? ''} />
          <input type="hidden" name="moreAbout" value={b.moreAbout ?? ''} />
          <input type="hidden" name="industry" value={b.industry ?? ''} />
          <input type="hidden" name="industryTags" value={j(b.industryTags)} />
          <input type="hidden" name="tone" value={b.tone ?? ''} />
          <input type="hidden" name="languages" value={j(b.languages)} />
          <input type="hidden" name="colors" value={j(b.colors)} />
          <input type="hidden" name="fonts" value={j(b.fonts)} />
          <input type="hidden" name="preferredWords" value={j(b.preferredWords)} />
          <input type="hidden" name="avoidWords" value={j(b.avoidWords)} />
          <h2 style={sectionH}>Concurrents <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 500 }}>{competitors.length}</span></h2>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted)' }}>On surveille ces marques pour que tu saches toujours où tu te situes. Tu pourras les suivre en direct depuis l'Inspo une fois les bibliothèques branchées.</p>
          {competitors.length > 0 && (
            <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
              {competitors.map((c, i) => (
                <Link key={i} href={`/brands/${id}/competitors/${encodeURIComponent(c)}`} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', padding: '11px 14px', textDecoration: 'none' }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: '#1b1420', border: '1px solid var(--line-2)', color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>{c.trim().slice(0, 2).toUpperCase()}</span>
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{c}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-strong)' }}>Analyser ›</span>
                </Link>
              ))}
            </div>
          )}
          <label style={lbl}>Marques concurrentes <span style={{ color: 'var(--muted)' }}>(une par ligne)</span></label>
          <textarea name="competitors" defaultValue={competitors.join('\n')} style={{ ...area, minHeight: 140 }} />
          <div style={{ marginTop: 12 }}><button type="submit" style={{ ...addBtn, padding: '11px 20px', fontSize: 13.5 }}>Enregistrer les concurrents</button></div>
        </form>
      )}

      {/* Comptes pub · rappel */}
      {tab === 'products' && adAccounts.length === 0 && (
        <div style={{ border: '1px dashed var(--line-2)', borderRadius: 14, padding: 14, color: 'var(--muted)', fontSize: 12.5, marginTop: 6 }}>
          Aucun compte publicitaire branché. Connecte Meta / TikTok depuis <Link href="/connections" style={{ color: 'var(--accent-strong)' }}>Connexions</Link> pour analyser tes vraies performances.
        </div>
      )}
    </main>
  );
}

function F({ label, hint, flex, children }: { label: string; hint?: string; flex?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14, flex: flex ?? '1 1 auto' }}>
      <label style={lbl}>{label}{hint && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {hint}</span>}</label>
      {children}
    </div>
  );
}
