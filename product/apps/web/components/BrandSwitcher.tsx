'use client';

import Link from 'next/link';
import {
  CIBLE_TACTILE_MIN, basculeMarqueNecessaire, CLE_FOCUS_BASCULE_MARQUE,
  BASCULE_MARQUE_EN_COURS, ECHEC_BASCULE_MARQUE, nomSelecteurMarque,
} from '@tiktrends/core';
import { useEffect, useRef, useState } from 'react';
import { setActiveBrand, createBrandAction, createBrandFromShopifyAction } from '../app/actions/brands';
import { Modal } from './Modal';
import { SubmitButton } from './SubmitButton';
import { Icon } from './Icon';
import { AvatarSite } from './AvatarSite';

interface Brand { id: string; name: string; logoUrl?: string | null; url?: string | null }

/**
 * Le rechargement complet, isolé pour que le test le remplace · `window.location`
 * n'est pas redéfinissable dans jsdom.
 */
export const navigateur = { recharger: () => window.location.reload() };

export function BrandSwitcher({ brands, activeId, canManage }: { brands: Brand[]; activeId: string | null; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [quick, setQuick] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState(false);
  const declencheur = useRef<HTMLButtonElement>(null);
  const active = brands.find((b) => b.id === activeId) || null;

  // Retour d'un changement de marque · le focus revient au sélecteur, là où
  // l'utilisateur l'avait laissé (cf. noyau `bascule-marque`).
  useEffect(() => {
    try {
      if (sessionStorage.getItem(CLE_FOCUS_BASCULE_MARQUE)) {
        sessionStorage.removeItem(CLE_FOCUS_BASCULE_MARQUE);
        declencheur.current?.focus();
      }
    } catch { /* stockage indisponible · le focus reste au document */ }
  }, []);

  // Après un échec, la main revient au sélecteur · une fois RÉACTIVÉ (un
  // bouton encore désactivé refuse le focus).
  useEffect(() => { if (echec) declencheur.current?.focus(); }, [echec]);

  const fermer = () => { setOpen(false); declencheur.current?.focus(); };

  // Lot 14 · n° 29 · le rafraîchissement souple du routeur calait une fois sur
  // deux (mesures dans le noyau `bascule-marque`). Le cookie posé, la page est
  // rechargée en entier · rail, contenu et cookie sortent du même rendu.
  const pick = async (id: string) => {
    setOpen(false);
    if (!basculeMarqueNecessaire(id, activeId)) { declencheur.current?.focus(); return; }
    setEchec(false);
    setEnCours(true);
    try {
      await setActiveBrand(id);
    } catch {
      setEnCours(false);
      setEchec(true);
      return;
    }
    try { sessionStorage.setItem(CLE_FOCUS_BASCULE_MARQUE, '1'); } catch { /* sans stockage, pas de retour de focus */ }
    navigateur.recharger();
  };

  return (
    <div style={{ position: 'relative', margin: '8px 0 0' }}
      onKeyDown={(e) => { if (open && e.key === 'Escape') { e.stopPropagation(); fermer(); } }}>
      <button ref={declencheur} type="button" onClick={() => setOpen((o) => !o)} disabled={enCours}
        aria-label={enCours ? BASCULE_MARQUE_EN_COURS : nomSelecteurMarque(active ? active.name : null)}
        aria-expanded={open} aria-controls="selecteur-marque-liste" aria-busy={enCours || undefined}
        style={{
          width: '100%', minHeight: CIBLE_TACTILE_MIN, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 10,
          border: '1px solid var(--line)', background: 'var(--surface)', cursor: enCours ? 'progress' : 'pointer', opacity: enCours ? 0.7 : 1,
        }}>
        {/* La favicon de la marque active · identité reconnaissable d'un coup d'œil.
            « Toutes les marques » n'a pas de site propre · on garde le pavé neutre. */}
        <span aria-hidden style={{ display: 'inline-flex', flexShrink: 0 }}>
          {active
            ? <AvatarSite nom={active.name} site={active.url} taille={20} rayon={6} />
            : <span style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--paper)', flexShrink: 0 }} />}
        </span>
        {/* n° 23 · le nom se lit EN ENTIER · retour à la ligne, jamais d'ellipse. */}
        <span style={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflowWrap: 'anywhere', lineHeight: 1.3 }}>
          {enCours ? BASCULE_MARQUE_EN_COURS : (active ? active.name : 'Toutes les marques')}
        </span>
        <span aria-hidden style={{ color: 'var(--muted)', fontSize: 11 }}>▾</span>
      </button>
      {echec && <p role="alert" style={{ margin: '6px 2px 0', fontSize: 12, lineHeight: 1.4, color: 'var(--ink-2)' }}>{ECHEC_BASCULE_MARQUE}</p>}

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
          <div id="selecteur-marque-liste" style={{ position: 'absolute', zIndex: 30, top: 'calc(100% + 6px)', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 12, boxShadow: '0 14px 34px -10px rgba(0,0,0,.6)', overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
            <button type="button" onClick={() => pick('')} aria-current={!activeId || undefined} style={row(!activeId)}>Toutes les marques</button>
            {brands.map((b) => (
              <button key={b.id} type="button" onClick={() => pick(b.id)} aria-current={b.id === activeId || undefined} style={row(b.id === activeId)}>
                <span aria-hidden style={{ display: 'inline-flex', flexShrink: 0 }}><AvatarSite nom={b.name} site={b.url} taille={16} rayon={5} /></span>
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left', overflowWrap: 'anywhere', lineHeight: 1.3 }}>{b.name}</span>
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
      <Modal open={quick} onClose={() => setQuick(false)} icon={<Icon name="tag" size={18} />} title="Nouvelle marque"
        subtitle="Le plus rapide : on lit ton site et on remplit tout pour toi.">

        {/* Voie 1 · tout récupérer depuis le site (boutique + charte + produits) */}
        <form action={createBrandFromShopifyAction} style={{ display: 'grid', gap: 10, border: '1px solid var(--accent-strong)', borderRadius: 14, background: 'linear-gradient(180deg, rgba(254,44,85,.07), var(--surface))', padding: '14px 15px' }}>
          <input type="hidden" name="back" value="brands" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-flex', color: 'var(--accent-strong)' }}><Icon name="sparkles" size={16} /></span>
            <b style={{ fontSize: 13.5, color: 'var(--ink)' }}>Tout récupérer depuis mon site</b>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.05em', padding: '2px 7px', borderRadius: 999, color: 'var(--on-accent)', background: 'var(--grad-accent)' }}>LE PLUS RAPIDE</span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            Nom, <b>logo, couleurs, polices</b> et <b>tous tes produits</b> (avec photos et prix) importés automatiquement.
          </p>
          <input name="domain" required placeholder="ta-boutique.com" style={quickField} autoFocus />
          <SubmitButton label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="sparkles" size={14} /> Créer et tout importer</span>} pendingLabel="Lecture du site…" style={{ width: '100%' }} />
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
    width: '100%', minHeight: CIBLE_TACTILE_MIN, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
    border: 'none', background: active ? 'var(--accent-soft)' : 'transparent',
    color: active ? 'var(--accent-strong)' : 'var(--ink-2)', fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
  } as const;
}
