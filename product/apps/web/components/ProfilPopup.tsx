'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { CIBLE_TACTILE_MIN, COQUILLE_V5, type EntreeProfil } from '@tiktrends/core';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { useIsMobile, MEDIA_TELEPHONE } from './useIsMobile';

/**
 * La pop-up profil V5 (lot V5 · B, P01 à P11) · elle REMPLACE le menu déroulant
 * de compte, sans perdre aucune de ses entrées (Mon profil, Support, ADMIN+,
 * Langue, Déconnexion), et reprend les entrées de l'ancien menu d'espace
 * (Réglages, Membres, Connexions, Utilisation, Abonnement) sous leur nom V5.
 *
 * Ce qu'elle montre est DÉCIDÉ par le noyau (`entreesProfil`) à partir des
 * droits réels · la pop-up n'en ajoute ni n'en élargit aucune. ADMIN+ n'arrive
 * qu'avec `isStaff` (garde inchangée).
 *
 * Fenêtre centrée via le `Modal` partagé (voile, Échap, piège à focus, focus
 * rendu au déclencheur · l'avatar). Plein écran sur téléphone.
 *
 * `apparence` · emplacement RÉSERVÉ à la bascule « Sombre / Clair » (V5 · P02),
 * qui arrivera avec le socle des thèmes · rien n'est rendu tant qu'il est vide.
 */
export function ProfilPopup({
  open, onClose, nom, email, avatarUrl, espace, role, entrees, onProfil, onReglagesRapides, logout, apparence,
}: {
  open: boolean;
  onClose: () => void;
  nom: string;
  email: string;
  avatarUrl?: string;
  espace: string;
  role: string;
  entrees: { reglages: EntreeProfil[]; adminPlus: EntreeProfil | null; aide: EntreeProfil[] };
  /** « Mon profil » · l'édition rapide existante (ProfileModal). */
  onProfil: () => void;
  /** « Espace de travail » · les réglages rapides existants (QuickSettingsModal). */
  onReglagesRapides: () => void;
  logout: () => Promise<void>;
  apparence?: ReactNode;
}) {
  const telephone = useIsMobile(MEDIA_TELEPHONE);
  const V = COQUILLE_V5.popup;
  const affiche = nom || email;
  const geste = (e: EntreeProfil, slim = false) => {
    const corps = (
      <>
        <span aria-hidden style={{ width: V.icone, height: V.icone, borderRadius: 10, background: 'var(--paper)', color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name={e.icone} size={18} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{e.libelle}</strong>
          {e.detail && !slim && <small style={{ display: 'block', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.35 }}>{e.detail}</small>}
        </span>
        {e.inerte && <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>Bientôt</span>}
      </>
    );
    const style: CSSProperties = { ...entree, opacity: e.inerte ? 0.55 : 1 };
    if (e.inerte) return <div key={e.id} data-entree-profil={e.id} aria-disabled="true" style={{ ...style, cursor: 'default' }}>{corps}</div>;
    if (e.action.genre === 'profil') return <button key={e.id} type="button" data-entree-profil={e.id} onClick={onProfil} style={{ ...style, ...bouton }}>{corps}</button>;
    if (e.action.genre === 'reglages-rapides') return <button key={e.id} type="button" data-entree-profil={e.id} onClick={onReglagesRapides} style={{ ...style, ...bouton }}>{corps}</button>;
    return <Link key={e.id} href={e.action.href} data-entree-profil={e.id} onClick={onClose} style={style}>{corps}</Link>;
  };

  return (
    <Modal open={open} onClose={onClose} title="Votre profil" maxWidth={V.largeur} pleinEcranTelephone>
      <div data-zone="popup-profil" style={{ display: 'grid', gap: 0 }}>
        {/* En-tête · avatar, nom, espace · rôle (P01). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 16, borderBottom: '1px solid var(--line)' }}>
          <span aria-hidden style={{ width: COQUILLE_V5.avatar.popup, height: COQUILLE_V5.avatar.popup, borderRadius: '50%', overflow: 'hidden', background: 'var(--accent-soft)', color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, flexShrink: 0 }}>
            {avatarUrl
              ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initiales(affiche)}
          </span>
          <div style={{ minWidth: 0 }}>
            <strong data-nom style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{affiche}</strong>
            <small data-espace-role style={{ display: 'block', fontSize: 12, color: 'var(--ink-2)', overflowWrap: 'anywhere' }}>{espace} · {role}</small>
          </div>
        </div>

        {/* P02 · emplacement réservé « Sombre / Clair » (socle des thèmes). */}
        {apparence && (
          <section aria-label="Apparence" data-zone="apparence" style={{ ...section, borderBottom: '1px solid var(--line)' }}>
            <span style={etiquette}>Apparence</span>
            {apparence}
          </section>
        )}

        <section aria-label="Réglages du compte" style={{ ...section, borderBottom: '1px solid var(--line)' }}>
          <span style={etiquette}>Réglages du compte</span>
          <div style={{ display: 'grid', gridTemplateColumns: telephone ? '1fr' : '1fr 1fr', gap: 6 }}>
            {entrees.reglages.map((e) => geste(e))}
          </div>
        </section>

        <section aria-label="Plateforme et aide" style={{ ...section, gap: 6 }}>
          {entrees.adminPlus && (
            <Link href={entrees.adminPlus.action.genre === 'lien' ? entrees.adminPlus.action.href : '/admin'} data-entree-profil="admin-plus" onClick={onClose}
              style={{ ...entree, border: '1px solid var(--warn)', background: 'color-mix(in srgb, var(--warn) 10%, transparent)' }}>
              <span aria-hidden style={{ width: V.icone, height: V.icone, borderRadius: 10, background: 'var(--rail)', color: 'var(--warn)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="gauge" size={18} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{entrees.adminPlus.libelle}</strong>
                <small style={{ display: 'block', fontSize: 12, color: 'var(--ink-2)' }}>{entrees.adminPlus.detail}</small>
              </span>
              <span aria-hidden style={{ color: 'var(--ink-2)' }}>→</span>
            </Link>
          )}
          {entrees.aide.map((e) => geste(e, true))}
        </section>

        {/* P11 · Langue et Déconnexion, repris tels quels de l'ancien menu. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <span aria-disabled="true" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>Langue<span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, border: '1px solid var(--line)' }}>FR</span></span>
          <form action={logout} style={{ margin: 0 }}>
            <button type="submit" style={{ ...bouton, display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: CIBLE_TACTILE_MIN, padding: '0 12px', borderRadius: 10, color: 'var(--err)', fontSize: 13, fontWeight: 600 }}>
              <Icon name="logout" />Déconnexion
            </button>
          </form>
        </div>
      </div>
    </Modal>
  );
}

function initiales(s: string): string {
  const mots = s.replace(/@.*$/, '').trim().split(/[\s._-]+/).filter(Boolean);
  return ((mots[0]?.[0] ?? '?') + (mots[1]?.[0] ?? '')).toUpperCase();
}

const section: CSSProperties = { display: 'grid', gap: 10, padding: '16px 0' };
const etiquette: CSSProperties = { fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-2)' };
const entree: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: 10, minHeight: CIBLE_TACTILE_MIN, borderRadius: COQUILLE_V5.popup.rayonEntree, textDecoration: 'none', color: 'var(--ink)', boxSizing: 'border-box', textAlign: 'left', width: '100%' };
const bouton: CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' };
