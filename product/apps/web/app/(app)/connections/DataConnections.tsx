'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { connectShopifyAction, syncShopifyAction, disconnectShopifyAction, connectMetaAction, syncMetaAction, disconnectMetaAction, selectMetaAccountAction, type ConnectionState } from '../../actions/connections';
import { BrandTile } from '../../../components/BrandIcons';
import { useToast } from '../../../components/Toast';
import { Empty } from '../../../components/Empty';
import { Icon } from '../../../components/Icon';
import { surface, tuile } from '../../../components/ui';
import { etatConnecteur, PHASE_CONNECTEUR_LABEL, type PhaseConnecteur } from '@tiktrends/core';

const fld = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--bg, #0d070c)', color: 'var(--ink)', fontSize: 13.5, outline: 'none' } as const;
const lbl = { fontSize: 12, color: 'var(--ink-2)', display: 'block', marginBottom: 5 } as const;
const tapBase = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN } as const;
const primary = { ...tapBase, padding: '9px 15px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' } as const;
const ghost = { ...tapBase, padding: '9px 15px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' } as const;
const eur = (n: number, c?: string) => `${n.toLocaleString('fr-FR')} ${c || '€'}`;

export function DataConnections({ initial, brandName, metaOAuth = false, shopifyOAuth = false }: { initial: ConnectionState | null; brandName: string | null; metaOAuth?: boolean; shopifyOAuth?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const refresh = () => router.refresh();

  if (!brandName) {
    // Brancher Shopify et Meta est l'étape qui déverrouille tous les écrans « en
    // direct » · sans marque active, c'était une impasse grise sans bouton. On
    // pose le geste : choisir (ou créer) une marque.
    return (
      <div style={{ marginBottom: 26 }}>
        <Empty
          tone="todo"
          icon="plug"
          title="Choisis une marque active pour brancher ses données."
          why="Shopify remonte les ventes, Meta les performances · chaque marque a ses propres comptes. Sélectionne-en une, ou crée-la, pour commencer à connecter."
          action={{ label: 'Choisir une marque', href: '/brands' }}
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 14, marginBottom: 28 }}>
      <ShopifyCard state={state} setState={setState} refresh={refresh} oauth={shopifyOAuth} />
      <MetaCard state={state} setState={setState} refresh={refresh} oauth={metaOAuth} />
    </div>
  );
}

/**
 * Un jeton d'accès se saisit MASQUÉ · recette A (#120), les deux champs de
 * jeton s'affichaient en clair pendant la saisie. Présentation seule · la
 * valeur, sa transmission et son stockage ne changent pas. « Afficher » permet
 * de relire ce qu'on a collé ; le libellé du bouton dit l'action suivante.
 */
function ChampJeton({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
      <input id={id} type={visible ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        autoComplete="off" autoCapitalize="off" spellCheck={false} style={{ ...fld, flex: 1, minWidth: 0 }} />
      <button type="button" onClick={() => setVisible((v) => !v)} aria-controls={id} aria-label={visible ? 'Masquer le token' : 'Afficher le token'}
        style={{ ...ghost, flexShrink: 0, borderRadius: 10 }}>
        {visible ? 'Masquer' : 'Afficher'}
      </button>
    </div>
  );
}

function Wrap({ outil, title, badge, children }: { outil: string; title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ ...surface, background: 'var(--surface)', padding: 18 }}>
      {/* Recette A (#120) · mesuré à 390 avec un nom long · le badge d'état
          (« CONNECTÉ · À SYNCHRONISER ») débordait la carte de 16 px (46 à 360) ·
          la ligne passe à la ligne, le badge descend sous le titre. */}
      <div data-entete-connecteur style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {/* La pastille commune à toutes les intégrations · logo officiel, décoratif ·
            le nom de l'outil est dans le titre juste à côté. */}
        <BrandTile name={outil} />
        <b style={{ fontSize: 15, color: 'var(--ink)', flex: '1 1 140px', minWidth: 0 }}>{title}</b>
        {badge}
      </div>
      {children}
    </div>
  );
}
/**
 * Le badge d'état d'un connecteur · il DIT la phase, pas juste « connecté »
 * (CDC v7 · N09) · vert quand les données remontent, ambre tant qu'il reste un
 * geste (choisir le compte, lancer une synchro), neutre à brancher.
 */
function BadgePhase({ phase }: { phase: PhaseConnecteur }) {
  if (phase === 'a_brancher') return null;
  const ton = phase === 'operationnel'
    ? { fg: '#18cc8c', bg: 'rgba(24,204,140,.14)' }
    : { fg: '#f5b043', bg: 'rgba(245,166,35,.14)' };
  return (
    <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', padding: '3px 9px', borderRadius: 999, color: ton.fg, background: ton.bg, whiteSpace: 'nowrap' }}>
      {PHASE_CONNECTEUR_LABEL[phase].toUpperCase()}
    </span>
  );
}

function ShopifyCard({ state, setState, refresh, oauth }: { state: ConnectionState | null; setState: (s: ConnectionState) => void; refresh: () => void; oauth?: boolean }) {
  const { toast } = useToast();
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
  async function disconnect() { await disconnectShopifyAction(); toast('Shopify déconnecté.'); refresh(); }

  const ins = sh?.insights;
  const phase = etatConnecteur({ connecte: !!sh?.connected, donnees: !!ins });
  return (
    <Wrap outil="Shopify" title="Shopify · ventes" badge={<BadgePhase phase={phase} />}>
      {!sh?.connected ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div><label style={lbl} htmlFor="conn-shopify-domaine">Domaine de la boutique</label><input id="conn-shopify-domaine" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="ta-boutique.myshopify.com" style={fld} /></div>
          {oauth && (
            <>
              {/* Un vrai bouton · l'ancien `<a href={undefined}>` n'était ni
                  focusable ni actionnable au clavier tant que le domaine était
                  vide · il paraissait cliquable sans l'être. */}
              <button type="button"
                onClick={() => {
                  const d = domain.trim().replace(/^https?:\/\//, '');
                  if (!/\.myshopify\.com/.test(d)) { setMsg('Renseigne d’abord ton domaine .myshopify.com.'); return; }
                  window.location.href = `/api/oauth/shopify?shop=${encodeURIComponent(d)}`;
                }}
                style={{ ...primary, textAlign: 'center' }}><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Icon name="plug" size={14} /> Connexion en un clic (OAuth)</span></button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0' }}>
                <span style={{ height: 1, flex: 1, background: 'var(--line)' }} /><span style={{ fontSize: 11, color: 'var(--muted)' }}>ou par token</span><span style={{ height: 1, flex: 1, background: 'var(--line)' }} />
              </div>
            </>
          )}
          <div><label style={lbl} htmlFor="conn-shopify-token">Token Admin API <span style={{ color: 'var(--muted)' }}>· app perso (shpat_…)</span></label><ChampJeton id="conn-shopify-token" value={token} onChange={setToken} placeholder="shpat_••••••••" /></div>
          <button type="button" onClick={connect} disabled={!!busy} style={primary}>{busy === 'connect' ? 'Test…' : 'Connecter'}</button>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>Shopify → Paramètres → Applications et canaux de vente → Développer des applications → créer une app, scopes lecture (orders, products), installer, copier le token Admin API.</p>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 10 }}>{sh.domain}</div>
          {ins ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100px, 100%), 1fr))', gap: 8, marginBottom: 10 }}>
              <Kpi label="CA 30 j" value={eur(ins.revenue30d, ins.currency)} />
              <Kpi label="Commandes" value={String(ins.orders30d)} />
              <Kpi label="Panier moyen" value={eur(ins.aov30d, ins.currency)} />
            </div>
          ) : <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 10px' }}>Lance une synchro pour remonter les ventes.</p>}
          {ins?.topProducts?.length ? (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>Top produits</div>
              {ins.topProducts.slice(0, 4).map((p) => (
                <div key={p.title} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12, color: 'var(--ink-2)', padding: '2px 0' }}><span data-nom-complet style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{p.title}</span><b style={{ color: 'var(--ink)', whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 12 }}>{eur(p.revenue, ins.currency)}</b></div>
              ))}
            </div>
          ) : null}
          <Fraicheur iso={sh.syncedAt} />
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
  const { toast } = useToast();
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
  async function disconnect() { await disconnectMetaAction(); toast('Meta déconnecté.'); refresh(); }
  async function pickAccount(id: string) {
    if (!id) return;
    setBusy('connect'); setMsg('');
    const r = await selectMetaAccountAction(id);
    setBusy('');
    if (r.error) { setMsg(r.error); return; }
    setMsg(`Compte « ${r.accountName} » sélectionné · lance une synchro.`); refresh();
  }

  const ins = mt?.insights;
  // Meta · un token relié mais plusieurs comptes pub sans choix arrêté n'est pas
  // « opérationnel » · c'est « compte à choisir » (N09).
  const compteRequisManquant = !!mt?.connected && (mt.accounts?.length ?? 0) > 1 && !mt.adAccountId;
  const phase = etatConnecteur({ connecte: !!mt?.connected, compteRequisManquant, donnees: !!ins });
  return (
    <Wrap outil="Meta Ads" title="Meta Ads · performance" badge={<BadgePhase phase={phase} />}>
      {!mt?.connected ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {oauth && (
            <>
              <a href="/api/oauth/meta" style={{ ...primary, textAlign: 'center', textDecoration: 'none', display: 'block' }}><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Icon name="plug" size={14} /> Connexion en un clic (OAuth)</span></a>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0' }}>
                <span style={{ height: 1, flex: 1, background: 'var(--line)' }} /><span style={{ fontSize: 11, color: 'var(--muted)' }}>ou par token</span><span style={{ height: 1, flex: 1, background: 'var(--line)' }} />
              </div>
            </>
          )}
          <div><label style={lbl} htmlFor="conn-meta-acct">ID compte publicitaire</label><input id="conn-meta-acct" value={acct} onChange={(e) => setAcct(e.target.value)} placeholder="act_1234567890" style={fld} /></div>
          <div><label style={lbl} htmlFor="conn-meta-token">Token d'accès <span style={{ color: 'var(--muted)' }}>· System User (BM)</span></label><ChampJeton id="conn-meta-token" value={token} onChange={setToken} placeholder="EAAB••••••••" /></div>
          <button type="button" onClick={connect} disabled={!!busy} style={primary}>{busy === 'connect' ? 'Test…' : 'Connecter'}</button>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>Business Manager → Paramètres → Utilisateurs système → générer un token avec la permission ads_read, sur le compte publicitaire.</p>
        </div>
      ) : (
        <div>
          {/* Sélecteur de compte publicitaire : une agence en a souvent plusieurs. */}
          {(mt.accounts?.length ?? 0) > 1 ? (
            <div style={{ marginBottom: 12 }}>
              <label style={lbl} htmlFor="conn-meta-adaccount">Compte publicitaire <span style={{ color: 'var(--muted)' }}>· {mt.accounts.length} accessibles</span></label>
              <select id="conn-meta-adaccount" value={mt.adAccountId ?? ''} disabled={!!busy} onChange={(e) => void pickAccount(e.target.value)} style={{ ...fld, width: '100%' }}>
                <option value="" disabled>Choisis un compte…</option>
                {mt.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.currency ? ` · ${a.currency}` : ''}</option>)}
              </select>
              {!mt.adAccountId && <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#f5b043' }}>Sélectionne le compte à analyser pour cette marque.</p>}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 10 }}>{ins?.accountName || mt.adAccountId}</div>
          )}
          {ins ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100px, 100%), 1fr))', gap: 8, marginBottom: 10 }}>
              <Kpi label="Dépense 30 j" value={eur(ins.spend30d, ins.currency)} />
              <Kpi label="ROAS" value={`${ins.roas30d}×`} />
              <Kpi label="Achats" value={String(ins.purchases30d)} />
            </div>
          ) : <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 10px' }}>Lance une synchro pour remonter les performances.</p>}
          {ins?.topAds?.length ? (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>Top créas (ROAS)</div>
              {ins.topAds.slice(0, 4).map((a) => (
                <div key={a.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12, color: 'var(--ink-2)', padding: '2px 0' }}><span data-nom-complet style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{a.name}</span><b style={{ color: '#7ee8bf', whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 12 }}>{a.roas}×</b></div>
              ))}
            </div>
          ) : null}
          <Fraicheur iso={mt.syncedAt} />
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

/**
 * La date de dernière synchro RÉUSSIE d'un connecteur (N09) · elle dit la
 * fraîcheur des chiffres affichés. Rien tant qu'aucune synchro n'a abouti · on
 * n'affiche pas « jamais » à côté de KPI qui, eux, existent d'un autre flux.
 */
export function Fraicheur({ iso }: { iso: string | null }) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return (
    <p style={{ margin: '2px 0 9px', fontSize: 11, color: 'var(--muted)' }}>
      Synchronisé le {d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
    </p>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ ...tuile, background: 'var(--paper)', padding: '9px 10px' }}>
      <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginTop: 3 }}>{value}</div>
    </div>
  );
}
