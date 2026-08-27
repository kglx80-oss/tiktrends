'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { connectShopifyAction, syncShopifyAction, disconnectShopifyAction, connectMetaAction, syncMetaAction, disconnectMetaAction, selectMetaAccountAction, type ConnectionState } from '../../actions/connections';
import { ShopifyIcon, MetaIcon } from '../../../components/BrandIcons';

const fld = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--bg, #0d070c)', color: 'var(--ink)', fontSize: 13.5, outline: 'none' } as const;
const lbl = { fontSize: 12, color: 'var(--ink-2)', display: 'block', marginBottom: 5 } as const;
const primary = { padding: '9px 15px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' } as const;
const ghost = { padding: '9px 15px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' } as const;
const eur = (n: number, c?: string) => `${n.toLocaleString('fr-FR')} ${c || '€'}`;

export function DataConnections({ initial, brandName, metaOAuth = false, shopifyOAuth = false }: { initial: ConnectionState | null; brandName: string | null; metaOAuth?: boolean; shopifyOAuth?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const refresh = () => router.refresh();

  if (!brandName) {
    return <div style={{ border: '1px dashed var(--line-2)', borderRadius: 14, padding: 18, color: 'var(--muted)', fontSize: 13, marginBottom: 26 }}>Sélectionne une marque active pour brancher ses sources de données.</div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14, marginBottom: 28 }}>
      <ShopifyCard state={state} setState={setState} refresh={refresh} oauth={shopifyOAuth} />
      <MetaCard state={state} setState={setState} refresh={refresh} oauth={metaOAuth} />
    </div>
  );
}

function Wrap({ icon, title, badge, children }: { icon: React.ReactNode; title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--line-2)', borderRadius: 16, background: 'var(--surface)', padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ width: 34, height: 34, borderRadius: 9, background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,.18)' }}>{icon}</span>
        <b style={{ fontSize: 15, color: 'var(--ink)', flex: 1 }}>{title}</b>
        {badge}
      </div>
      {children}
    </div>
  );
}
const connectedBadge = <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', padding: '3px 9px', borderRadius: 999, color: '#18cc8c', background: 'rgba(24,204,140,.14)' }}>CONNECTÉ</span>;

function ShopifyCard({ state, setState, refresh, oauth }: { state: ConnectionState | null; setState: (s: ConnectionState) => void; refresh: () => void; oauth?: boolean }) {
  const sh = state?.shopify;
  const [domain, setDomain] = useState(sh?.domain ?? '');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<'' | 'connect' | 'sync'>('');
  const [msg, setMsg] = useState('');

  async function connect() {
    setBusy('connect'); setMsg('');
    const r = await connectShopifyAction({ domain, token });
    setBusy('');
    if (r.error) { setMsg(r.error); return; }
    setMsg(`Connecté à ${r.shopName}.`); setToken(''); refresh();
  }
  async function sync() {
    setBusy('sync'); setMsg('');
    const r = await syncShopifyAction();
    setBusy('');
    if (r.error) { setMsg(r.error); return; }
    if (r.insights && state) setState({ ...state, shopify: { ...state.shopify, insights: r.insights } });
    setMsg('Données synchronisées.');
  }
  async function disconnect() { await disconnectShopifyAction(); refresh(); }

  const ins = sh?.insights;
  return (
    <Wrap icon={<ShopifyIcon size={21} />} title="Shopify · ventes" badge={sh?.connected ? connectedBadge : undefined}>
      {!sh?.connected ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div><label style={lbl}>Domaine de la boutique</label><input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="ta-boutique.myshopify.com" style={fld} /></div>
          {oauth && (
            <>
              <a href={/\.myshopify\.com/.test(domain) ? `/api/oauth/shopify?shop=${encodeURIComponent(domain.trim().replace(/^https?:\/\//, ''))}` : undefined}
                onClick={(e) => { if (!/\.myshopify\.com/.test(domain)) { e.preventDefault(); setMsg('Renseigne d’abord ton domaine .myshopify.com.'); } }}
                style={{ ...primary, textAlign: 'center', textDecoration: 'none', display: 'block' }}>⚡ Connexion en un clic (OAuth)</a>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0' }}>
                <span style={{ height: 1, flex: 1, background: 'var(--line)' }} /><span style={{ fontSize: 11, color: 'var(--muted)' }}>ou par token</span><span style={{ height: 1, flex: 1, background: 'var(--line)' }} />
              </div>
            </>
          )}
          <div><label style={lbl}>Token Admin API <span style={{ color: 'var(--muted)' }}>· app perso (shpat_…)</span></label><input value={token} onChange={(e) => setToken(e.target.value)} placeholder="shpat_••••••••" style={fld} /></div>
          <button type="button" onClick={connect} disabled={!!busy} style={primary}>{busy === 'connect' ? 'Test…' : 'Connecter'}</button>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>Shopify → Paramètres → Applications et canaux de vente → Développer des applications → créer une app, scopes lecture (orders, products), installer, copier le token Admin API.</p>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 10 }}>{sh.domain}</div>
          {ins ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
              <Kpi label="CA 30 j" value={eur(ins.revenue30d, ins.currency)} />
              <Kpi label="Commandes" value={String(ins.orders30d)} />
              <Kpi label="Panier moyen" value={eur(ins.aov30d, ins.currency)} />
            </div>
          ) : <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 10px' }}>Lance une synchro pour remonter les ventes.</p>}
          {ins?.topProducts?.length ? (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>Top produits</div>
              {ins.topProducts.slice(0, 4).map((p) => (
                <div key={p.title} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-2)', padding: '2px 0' }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span><b style={{ color: 'var(--ink)' }}>{eur(p.revenue, ins.currency)}</b></div>
              ))}
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={sync} disabled={!!busy} style={primary}>{busy === 'sync' ? 'Synchro…' : '↻ Synchroniser'}</button>
            <button type="button" onClick={disconnect} style={ghost}>Déconnecter</button>
          </div>
        </div>
      )}
      {msg && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-2)' }}>{msg}</div>}
    </Wrap>
  );
}

function MetaCard({ state, setState, refresh, oauth }: { state: ConnectionState | null; setState: (s: ConnectionState) => void; refresh: () => void; oauth?: boolean }) {
  const mt = state?.meta;
  const [acct, setAcct] = useState(mt?.adAccountId ?? '');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<'' | 'connect' | 'sync'>('');
  const [msg, setMsg] = useState('');

  async function connect() {
    setBusy('connect'); setMsg('');
    const r = await connectMetaAction({ adAccountId: acct, token });
    setBusy('');
    if (r.error) { setMsg(r.error); return; }
    setMsg(`Connecté à ${r.accountName}.`); setToken(''); refresh();
  }
  async function sync() {
    setBusy('sync'); setMsg('');
    const r = await syncMetaAction();
    setBusy('');
    if (r.error) { setMsg(r.error); return; }
    if (r.insights && state) setState({ ...state, meta: { ...state.meta, insights: r.insights } });
    setMsg('Données synchronisées.');
  }
  async function disconnect() { await disconnectMetaAction(); refresh(); }
  async function pickAccount(id: string) {
    if (!id) return;
    setBusy('connect'); setMsg('');
    const r = await selectMetaAccountAction(id);
    setBusy('');
    if (r.error) { setMsg(r.error); return; }
    setMsg(`Compte « ${r.accountName} » sélectionné · lance une synchro.`); refresh();
  }

  const ins = mt?.insights;
  return (
    <Wrap icon={<MetaIcon size={22} />} title="Meta Ads · performance" badge={mt?.connected ? connectedBadge : undefined}>
      {!mt?.connected ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {oauth && (
            <>
              <a href="/api/oauth/meta" style={{ ...primary, textAlign: 'center', textDecoration: 'none', display: 'block' }}>⚡ Connexion en un clic (OAuth)</a>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0' }}>
                <span style={{ height: 1, flex: 1, background: 'var(--line)' }} /><span style={{ fontSize: 11, color: 'var(--muted)' }}>ou par token</span><span style={{ height: 1, flex: 1, background: 'var(--line)' }} />
              </div>
            </>
          )}
          <div><label style={lbl}>ID compte publicitaire</label><input value={acct} onChange={(e) => setAcct(e.target.value)} placeholder="act_1234567890" style={fld} /></div>
          <div><label style={lbl}>Token d'accès <span style={{ color: 'var(--muted)' }}>· System User (BM)</span></label><input value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAB••••••••" style={fld} /></div>
          <button type="button" onClick={connect} disabled={!!busy} style={primary}>{busy === 'connect' ? 'Test…' : 'Connecter'}</button>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>Business Manager → Paramètres → Utilisateurs système → générer un token avec la permission ads_read, sur le compte publicitaire.</p>
        </div>
      ) : (
        <div>
          {/* Sélecteur de compte publicitaire : une agence en a souvent plusieurs. */}
          {(mt.accounts?.length ?? 0) > 1 ? (
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Compte publicitaire <span style={{ color: 'var(--muted)' }}>· {mt.accounts.length} accessibles</span></label>
              <select value={mt.adAccountId ?? ''} disabled={!!busy} onChange={(e) => void pickAccount(e.target.value)} style={{ ...fld, width: '100%' }}>
                <option value="" disabled>Choisis un compte…</option>
                {mt.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.currency ? ` · ${a.currency}` : ''}</option>)}
              </select>
              {!mt.adAccountId && <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#f5b043' }}>Sélectionne le compte à analyser pour cette marque.</p>}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 10 }}>{ins?.accountName || mt.adAccountId}</div>
          )}
          {ins ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
              <Kpi label="Dépense 30 j" value={eur(ins.spend30d, ins.currency)} />
              <Kpi label="ROAS" value={`${ins.roas30d}×`} />
              <Kpi label="Achats" value={String(ins.purchases30d)} />
            </div>
          ) : <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 10px' }}>Lance une synchro pour remonter les performances.</p>}
          {ins?.topAds?.length ? (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>Top créas (ROAS)</div>
              {ins.topAds.slice(0, 4).map((a) => (
                <div key={a.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-2)', padding: '2px 0' }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span><b style={{ color: '#7ee8bf' }}>{a.roas}×</b></div>
              ))}
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={sync} disabled={!!busy} style={primary}>{busy === 'sync' ? 'Synchro…' : '↻ Synchroniser'}</button>
            <button type="button" onClick={disconnect} style={ghost}>Déconnecter</button>
          </div>
        </div>
      )}
      {msg && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-2)' }}>{msg}</div>}
    </Wrap>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, background: 'var(--paper)', padding: '9px 10px' }}>
      <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginTop: 3 }}>{value}</div>
    </div>
  );
}
