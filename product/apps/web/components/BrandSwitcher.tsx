'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setActiveBrand, createBrandAction, createBrandFromShopifyAction } from '../app/actions/brands';
import { Modal } from './Modal';
import { SubmitButton } from './SubmitButton';

interface Brand { id: string; name: string; logoUrl?: string | null }

export function BrandSwitcher({ brands, activeId, canManage }: { brands: Brand[]; activeId: string | null; canManage: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quick, setQuick] = useState(false);
  const [, start] = useTransition();
  const active = brands.find((b) => b.id === activeId) || null;

  const pick = (id: string) => {
    setOpen(false);
    start(async () => { await setActiveBrand(id); router.refresh(); });
  };

  return (
    <div style={{ position: 'relative', margin: '10px 0 4px' }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 10,
        border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer',
      }}>
        <span style={{ width: 20, height: 20, borderRadius: 6, background: active ? 'var(--grad-accent)' : 'var(--paper)', flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {active ? active.name : 'Toutes les marques'}
        </span>
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>▾</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
          <div style={{ position: 'absolute', zIndex: 30, top: 'calc(100% + 6px)', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 12, boxShadow: '0 14px 34px -10px rgba(0,0,0,.6)', overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
            <button type="button" onClick={() => pick('')} style={row(!activeId)}>Toutes les marques</button>
            {brands.map((b) => (
              <button key={b.id} type="button" onClick={() => pick(b.id)} style={row(b.id === activeId)}>
                <span style={{ width: 16, height: 16, borderRadius: 5, background: 'var(--grad-accent)', flexShrink: 0 }} />
                <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
              </button>
            ))}
            {brands.length === 0 && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>Aucune marque pour l'instant.</div>}
            {canManage && (
              <>
                <button type="button" onClick={() => { setOpen(false); setQuick(true); }} style={{ ...row(false), borderTop: '1px solid var(--line)', color: 'var(--accent-strong)', fontWeight: 800, cursor: 'pointer' }}>
                  + Nouvelle marque
                </button>
                <Link href="/brands" onClick={() => setOpen(false)} style={{ ...row(false), fontSize: 12, color: 'var(--muted)', fontWeight: 600, textDecoration: 'none' }}>
                  Toutes mes marques
                </Link>
              </>
            )}
          </div>
        </>
      )}

      {/* Création rapide en pop-up · le parcours détaillé (5 étapes) reste accessible. */}
      <Modal open={quick} onClose={() => setQuick(false)} icon="🏷️" title="Nouvelle marque"
        subtitle="Le plus rapide : on lit ton site et on remplit tout pour toi.">

        {/* Voie 1 · tout récupérer depuis le site (boutique + charte + produits) */}
        <form action={createBrandFromShopifyAction} style={{ display: 'grid', gap: 10, border: '1px solid var(--accent-strong)', borderRadius: 14, background: 'linear-gradient(180deg, rgba(254,44,85,.07), var(--surface))', padding: '14px 15px' }}>
          <input type="hidden" name="back" value="brands" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>✦</span>
            <b style={{ fontSize: 13.5, color: 'var(--ink)' }}>Tout récupérer depuis mon site</b>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.05em', padding: '2px 7px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>LE PLUS RAPIDE</span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            Nom, <b>logo, couleurs, polices</b> et <b>tous tes produits</b> (avec photos et prix) importés automatiquement.
          </p>
          <input name="domain" required placeholder="ta-boutique.com" style={quickField} autoFocus />
          <SubmitButton label="✦ Créer et tout importer" pendingLabel="Lecture du site…" style={{ width: '100%' }} />
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
          <span style={{ height: 1, flex: 1, background: 'var(--line)' }} />
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>ou créer à la main</span>
          <span style={{ height: 1, flex: 1, background: 'var(--line)' }} />
        </div>

        {/* Voie 2 · création simple (la charte et les produits seront complétés ensuite) */}
        <form action={createBrandAction} style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Nom de la marque</span>
            <input name="name" required placeholder="Ex : Studio Nova" style={quickField} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Site web <span style={{ color: 'var(--muted)' }}>· optionnel</span></span>
            <input name="url" placeholder="ta-marque.com" style={quickField} />
          </label>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
            <Link href="/brands/new" onClick={() => setQuick(false)} style={{ fontSize: 12.5, color: 'var(--muted)', textDecoration: 'none' }}>
              Créer en détail (5 étapes) ›
            </Link>
            <SubmitButton label="Créer la marque" pendingLabel="Création…" />
          </div>
        </form>
      </Modal>
    </div>
  );
}

const quickField = { padding: '11px 13px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink)', fontSize: 14, outline: 'none' } as const;

function row(active: boolean) {
  return {
    width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
    border: 'none', background: active ? 'var(--accent-soft)' : 'transparent',
    color: active ? 'var(--accent-strong)' : 'var(--ink-2)', fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
  } as const;
}
