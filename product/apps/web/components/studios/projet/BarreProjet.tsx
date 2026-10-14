'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN, LIBELLES_MODE_PROJET, MODES_PROJET, type ModeProjet } from '@tiktrends/core';
import type { LienAtelier } from '../../../lib/navigation';
import { useEspaceCreation } from '../../EspaceCreation';
import { tuile } from '../../ui';

/**
 * UX V2 · lot 2 · la BARRE DE PROJET, la même sur toutes les pages du projet
 * (maquettes validées le 10/10).
 *
 *  · titre du projet et retour aux projets ;
 *  · les MODES · Brief, Image, Vidéo, Textes, Produit, Identités et voix ·
 *    chacun est la page réelle du projet (mêmes adresses, mêmes gardes) ;
 *    un mode dont la capacité est coupée pour l'espace n'est pas un lien, il
 *    le dit (`liensAtelierProjet`, F1) ;
 *  · les actions · Mode focus (Alt F), Masquer/Afficher Jarvis (là où le
 *    panneau existe), Exporter (si l'export est actif).
 *
 * Rien n'est écrit, généré ni facturé ici · ce sont des liens et des
 * bascules d'affichage.
 */
export interface ProprietesBarreProjet {
  projectId: string;
  /** Le mode de la page qui rend la barre · c'est la page qui le sait (même adresse, même garde). */
  mode: ModeProjet;
  titre: string;
  /** Ligne de contexte · marque, version… */
  sousTitre?: string;
  /** Liens de l'atelier, déjà filtrés par les interrupteurs de l'espace. */
  atelier: LienAtelier[];
  /** La page porte le panneau Jarvis (propositions) · propose de le masquer. */
  jarvis?: boolean;
  /** La page affiche déjà le titre du projet en titre principal (fiche Brief). */
  titreDansLaPage?: boolean;
}

const MODES_ONGLETS: readonly ModeProjet[] = MODES_PROJET.filter((m) => m !== 'export');

export function BarreProjet({ projectId, mode: ici, titre, sousTitre, atelier, jarvis = false, titreDansLaPage = false }: ProprietesBarreProjet) {
  const ec = useEspaceCreation();
  const parSegment = new Map(atelier.map((l) => [l.segment, l]));
  const exporter = parSegment.get('export');
  const base = `/studio/projets/${encodeURIComponent(projectId)}`;

  return (
    <section data-zone="barre-projet" aria-label="Projet" style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0, display: 'grid', gap: 2, flex: '1 1 260px' }}>
          <Link href="/studio/projets" style={{ ...lienDiscret, width: 'fit-content' }}>‹ Projets</Link>
          {!titreDansLaPage && (
            <p data-barre="titre" style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.25, overflowWrap: 'anywhere' }}>{titre}</p>
          )}
          {!titreDansLaPage && sousTitre && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', overflowWrap: 'anywhere' }}>{sousTitre}</p>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <button type="button" data-action="focus" onClick={ec.basculerFocus} aria-pressed={ec.focus} aria-keyshortcuts="Alt+F"
            title={ec.focus ? 'Quitter le mode focus (Échap)' : 'Mode focus · masque le menu et la barre du haut (Alt F)'} style={action}>
            {ec.focus ? 'Quitter le mode focus' : 'Mode focus'}
          </button>
          {jarvis && (
            <button type="button" data-action="jarvis" onClick={ec.basculerJarvis} aria-pressed={ec.jarvisMasque}
              title={ec.jarvisMasque ? 'Afficher le panneau Jarvis' : 'Masquer le panneau Jarvis · le choix est mémorisé sur cet appareil'} style={action}>
              {ec.jarvisMasque ? 'Afficher Jarvis' : 'Masquer Jarvis'}
            </button>
          )}
          {exporter?.href ? (
            <Link href={exporter.href} data-atelier="export" aria-current={ici === 'export' ? 'page' : undefined} style={{ ...action, background: 'var(--grad-accent)', color: '#1a0a12', borderColor: 'transparent', textDecoration: 'none' }}>
              Exporter
            </Link>
          ) : exporter ? (
            <span data-atelier="export" data-etat="non-active" aria-disabled="true" style={{ ...action, cursor: 'default', borderStyle: 'dashed', color: 'var(--ink-2)' }}>
              Exporter <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {exporter.mention}</span>
            </span>
          ) : null}
        </div>
      </div>
      <nav aria-label="Atelier du projet" style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'thin', paddingBottom: 2 }}>
        {MODES_ONGLETS.map((m) => {
          const actif = ici === m;
          const libelle = LIBELLES_MODE_PROJET[m];
          if (m === 'brief') {
            return <Link key={m} href={base} data-atelier="brief" aria-current={actif ? 'page' : undefined} style={onglet(actif)}>{libelle}</Link>;
          }
          const l = parSegment.get(m);
          if (!l) return null;
          // F1 · une capacité coupée pour l'espace n'est pas un lien : elle le dit.
          return l.href ? (
            <Link key={m} href={l.href} data-atelier={m} aria-current={actif ? 'page' : undefined} style={onglet(actif)}>{libelle}</Link>
          ) : (
            <span key={m} data-atelier={m} data-etat="non-active" aria-disabled="true" title={l.mention ?? undefined} style={{ ...onglet(false), borderStyle: 'dashed', color: 'var(--ink-2)', cursor: 'default' }}>
              {libelle} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {l.mention}</span>
            </span>
          );
        })}
      </nav>
    </section>
  );
}

const lienDiscret: CSSProperties = { fontSize: 12.5, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none', minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center' };
const action: CSSProperties = {
  ...tuile, display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: CIBLE_TACTILE_MIN, padding: '0 14px', fontSize: 13, fontWeight: 650,
  color: 'var(--ink)', background: 'var(--surface)', cursor: 'pointer', whiteSpace: 'nowrap', boxSizing: 'border-box',
};
const onglet = (actif: boolean): CSSProperties => ({
  ...tuile, display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: CIBLE_TACTILE_MIN, padding: '0 14px', fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0,
  fontWeight: actif ? 700 : 550, color: actif ? 'var(--ink)' : 'var(--ink-2)', textDecoration: 'none', boxSizing: 'border-box',
  borderColor: actif ? 'var(--accent-strong)' : undefined, background: actif ? 'var(--accent-soft)' : 'transparent',
});
