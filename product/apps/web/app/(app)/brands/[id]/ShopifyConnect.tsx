'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { syncShopifyProductsAction } from '../../../actions/brand-detail';

export function ShopifyConnect({ brandId, initialDomain }: { brandId: string; initialDomain: string | null }) {
  const router = useRouter();
  const [domain, setDomain] = useState(initialDomain ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(true);

  async function sync() {
    if (busy) return;
    setBusy(true); setMsg('');
    const r = await syncShopifyProductsAction({ brandId, domain: domain.trim() || undefined });
    setBusy(false);
    if (r.error) { setOk(false); setMsg(r.error); return; }
    setOk(true);
    setMsg(`Boutique synchronisée : ${r.imported} produit(s) ajouté(s), ${r.updated} mis à jour (avec images et prix).`);
    router.refresh();
  }

  return (
    <div style={{ border: '1px solid var(--line-2)', borderRadius: 14, background: 'linear-gradient(180deg, rgba(150,220,170,.06), var(--surface))', padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>🛍️</span>
        <b style={{ fontSize: 14, color: 'var(--ink)' }}>Connecter la boutique Shopify</b>
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
        Importe automatiquement tes produits <b>avec leurs images, prix et descriptions</b> depuis ton catalogue Shopify. Aucune installation : juste le domaine de ta boutique.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="ta-boutique.com ou ta-boutique.myshopify.com" disabled={busy}
          style={{ flex: '1 1 280px', minWidth: 220, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--bg, #0d070c)', color: 'var(--ink)', fontSize: 13.5, outline: 'none' }} />
        <button type="button" onClick={sync} disabled={busy} style={{
          padding: '10px 18px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13,
          cursor: busy ? 'default' : 'pointer', background: 'var(--grad-accent)', color: '#0d070c', opacity: busy ? .6 : 1,
        }}>{busy ? 'Synchronisation…' : (initialDomain ? '↻ Synchroniser' : '🔗 Connecter')}</button>
      </div>
      {msg && <div style={{ marginTop: 10, fontSize: 12.5, color: ok ? '#9fe6b3' : '#f5b043' }}>{msg}</div>}
    </div>
  );
}
