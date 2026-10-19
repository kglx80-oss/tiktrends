'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN, AUTOMATISATION_A_VENIR, type CompletudeFicheJarvis } from '@tiktrends/core';
import type { ConversationLue } from '../../actions/jarvis-chat';
import type { ProjetColonne } from '../../../lib/studios/jarvis-projets';
import { Icon } from '../../../components/Icon';
import { BarreValeur } from '../../../components/BarreValeur';

/**
 * UX V5 · la colonne secondaire de Jarvis (maquette · ~320 px à gauche du centre).
 *
 * Fidèle à la présentation, HONNÊTE sur les services :
 *  · sélecteur de marque · renvoie à `/brands` (la vraie marque active, le vrai
 *    écran de bascule · pas un faux menu) ;
 *  · « Nouvelle conversation » · crée une VRAIE conversation (serveur) ;
 *  · « Mes conversations » · ouvre le fil principal ; la liste CONVERSATIONS
 *    dessous est réelle (portée espace + marque + personne) ;
 *  · « Documents & sources » · renvoie aux VRAIES sources de Jarvis ;
 *  · « Actions programmées » · DÉSACTIVÉ · aucun planificateur n'existe (honnête) ;
 *  · PROJETS · les VRAIS projets Studios de la marque (titres cliquables) ;
 *  · carte « Fiche marque N % » · le VRAI pourcentage de complétude.
 */

const navItem: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 11, width: '100%',
  minHeight: CIBLE_TACTILE_MIN, padding: '0 12px', borderRadius: 12,
  border: 'none', background: 'transparent', color: 'var(--ink)',
  fontSize: 13.5, fontWeight: 600, textAlign: 'left', textDecoration: 'none', cursor: 'pointer',
  boxSizing: 'border-box',
};
const sectionTitre: CSSProperties = {
  margin: '0 0 2px', padding: '0 12px', fontSize: 10.5, fontWeight: 800,
  letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--muted)',
};
const lienListe = (actif: boolean): CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 36,
  padding: '0 12px', borderRadius: 10, boxSizing: 'border-box',
  border: 'none', background: actif ? 'var(--accent-soft)' : 'transparent',
  color: actif ? 'var(--accent-strong)' : 'var(--ink-2)',
  fontSize: 13, fontWeight: actif ? 700 : 600, textAlign: 'left', textDecoration: 'none', cursor: 'pointer',
  overflow: 'hidden',
});
const tronque: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 };

export function JarvisColonne({
  brandName, projets, conversations, conversationId,
  onNouvelle, onOuvrirPrincipal, onOuvrir, onRenommer, completude, enCours, isMobile = false,
}: {
  brandName: string;
  projets: ProjetColonne[];
  conversations: ConversationLue[];
  conversationId: string | null;
  onNouvelle: () => void;
  onOuvrirPrincipal: () => void;
  onOuvrir: (id: string) => void;
  onRenommer: (id: string, titreActuel: string) => void;
  completude: CompletudeFicheJarvis | null;
  enCours: boolean;
  /** En mobile, la colonne passe pleine largeur (empilée sous la conversation). */
  isMobile?: boolean;
}) {
  const initiale = (brandName.trim()[0] ?? '?').toUpperCase();
  return (
    <aside
      data-colonne="jarvis"
      style={{
        width: isMobile ? '100%' : 320, flexShrink: 0, display: 'flex', flexDirection: 'column',
        gap: 14, alignSelf: 'stretch',
      }}
    >
      {/* Sélecteur de marque · la marque ACTIVE, lien vers l'écran des marques. */}
      <Link
        href="/brands"
        data-selecteur-marque
        data-cadre="controle"
        title="Marques · changer de marque active"
        style={{
          display: 'flex', alignItems: 'center', gap: 10, minHeight: CIBLE_TACTILE_MIN,
          padding: '8px 12px', borderRadius: 14, textDecoration: 'none',
          border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)',
          boxShadow: 'var(--sh-sm)',
        }}
      >
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 30, height: 30, borderRadius: 9, flexShrink: 0,
          background: 'var(--accent-soft)', color: 'var(--accent-strong)', fontSize: 13, fontWeight: 800,
        }}>{initiale}</span>
        <span style={{ ...tronque, fontSize: 14, fontWeight: 700 }}>{brandName}</span>
        <span style={{ display: 'inline-flex', color: 'var(--muted)', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 9l4 4 4-4" /></svg>
        </span>
      </Link>

      {/* Navigation de la conversation. */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <button type="button" onClick={onNouvelle} disabled={enCours} style={{ ...navItem, cursor: enCours ? 'default' : 'pointer', opacity: enCours ? 0.6 : 1 }}>
          <span style={{ display: 'inline-flex', color: 'var(--accent-strong)' }}><Icon name="plus" size={18} /></span>
          Nouvelle conversation
        </button>
        <button type="button" onClick={onOuvrirPrincipal} style={navItem}>
          <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><Icon name="search" size={17} /></span>
          Mes conversations
        </button>
        <Link href="/jarvis/sources" style={navItem}>
          <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><Icon name="file" size={17} /></span>
          Documents &amp; sources
        </Link>
        <button
          type="button" disabled aria-disabled="true" title={AUTOMATISATION_A_VENIR}
          style={{ ...navItem, color: 'var(--muted)', cursor: 'not-allowed' }}
        >
          <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><Icon name="spark" size={17} /></span>
          Actions programmées
        </button>
      </nav>

      {/* PROJETS · les vrais projets Studios (si la marque en a et qu'on a le droit). */}
      {projets.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h3 style={sectionTitre}>Projets</h3>
          {projets.map((p) => (
            <Link key={p.id} href={p.href} style={lienListe(false)} title={p.titre}>
              <span style={tronque}>{p.titre}</span>
            </Link>
          ))}
        </section>
      )}

      {/* CONVERSATIONS · la liste réelle (portée espace + marque + personne). */}
      {conversations.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h3 style={sectionTitre}>Conversations</h3>
          {conversations.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button type="button" onClick={() => onOuvrir(c.id)} style={lienListe(c.id === conversationId)} title={c.titre}>
                <span style={tronque}>{c.titre}</span>
              </button>
              <button
                type="button" onClick={() => onRenommer(c.id, c.titre)} title="Renommer la conversation"
                aria-label={`Renommer « ${c.titre} »`}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 30, height: 30, flexShrink: 0, borderRadius: 8,
                  border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer',
                }}
              >
                <Icon name="pen" size={13} />
              </button>
            </div>
          ))}
        </section>
      )}

      <div style={{ flex: 1 }} />

      {/* Carte « Fiche marque N % » · le VRAI pourcentage, en bas de colonne. */}
      {completude && (
        <section
          data-zone="completude"
          style={{
            display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px',
            borderRadius: 'var(--r-card)', border: '1px solid var(--line)', background: 'var(--surface)', boxShadow: 'var(--sh-card)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
              Fiche marque <span data-completude-score style={{ color: 'var(--accent-strong)' }}>{completude.score} %</span>
            </div>
          </div>
          <BarreValeur part={completude.score / 100} hauteur={7} />
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>
            Jarvis répond mieux avec une fiche complète · {completude.faits} éléments sur {completude.total}.
          </div>
          <Link
            href={completude.ficheHref}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, alignSelf: 'flex-start',
              padding: '0 2px', textDecoration: 'none', color: 'var(--accent-strong)', fontSize: 12.5, fontWeight: 700,
            }}
          >
            Compléter <Icon name="trend" size={13} />
          </Link>
        </section>
      )}
    </aside>
  );
}
