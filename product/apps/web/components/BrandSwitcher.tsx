'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setActiveBrand, createBrandAction } from '../app/actions/brands';
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
        subtitle="Crée la marque en un instant. Tu complètes le profil (audience, charte, concurrents) juste après.">
        <form action={createBrandAction} style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Nom de la marque</span>
            <input name="name" required autoFocus placeholder="Ex : Studio Nova" style={quickField} />
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
