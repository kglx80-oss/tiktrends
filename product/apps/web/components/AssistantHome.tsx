'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { afficherCredits, texteCredits, CIBLE_TACTILE_MIN, cheminOuvert, liensOuverts, noteAccesAccueil, type RegleChemin } from '@tiktrends/core';
import { AssistantChat } from './AssistantChat';
import { Icon } from './Icon';
import { surface } from './ui';

export interface AssistantHomeProps {
  firstName: string;
  credits: number;
  /** Compte illimité (fondateur/créateur) · l'accueil affiche « Illimité », pas « 0 crédits ». */
  unlimited: boolean;
  brandName: string | null;
  brandId: string | null;
  aiReady: boolean;
  /** Le bandeau visuel (hero de la Home) · rendu en tête, juste sous l'en-tête. */
  bandeau?: ReactNode;
  /** Les cartes des marques du compte · rendues sous le bandeau. */
  marques?: ReactNode;
  /** La prochaine itération, DEVANT · rendue juste après l'en-tête. */
  prochaineEtape?: ReactNode;
  /** L'aperçu d'exemple, replié, en toute fin. */
  exemple?: ReactNode;
  /** Ce que le rôle ouvre (lot 11) · un accès fermé n'est pas proposé. Absent = tout ouvert. */
  regles?: RegleChemin[];
  /**
   * Le sélecteur de vue (Accueil · Analytics, lot 19A) · posé dans la rangée
   * du titre, à droite · le titre garde son axe (mesuré y 99 avant le lot).
   */
  vues?: ReactNode;
  /**
   * SEC-03 · l'assistant est-il ouvert à cette session ? Calculé par la page
   * avec `refusAssistant` (la règle de `askAssistant`). Fermé → ni titre ni
   * champ. Absent = ouvert (comportement d'avant).
   */
  assistantOuvert?: boolean;
}

/**
 * L'accueil · il fait ressortir la prochaine ITÉRATION, pas la création.
 *
 * ── L'ordre, et pourquoi ─────────────────────────────────────────────────────
 *
 * Le cap sert l'analyse pour l'itération. L'écran mène donc par la prochaine
 * étape (le parcours réel, injecté), puis les accès d'ANALYSE (Adsmap,
 * Analytics, Veille, Radar, mémoire Jarvis), puis l'assistant. La création
 * (les studios) devient SECONDAIRE · une rangée compacte, après le chat · sans
 * studio mis en vedette ni surtitre de produit clé. L'exemple de pipeline est
 * replié, tout en bas.
 *
 * On ne montre que des accès RÉELS et des libellés descriptifs · aucun KPI ni
 * recommandation inventé, aucune promesse de rentabilité.
 */

// Les accès d'analyse · destinations EXISTANTES, libellés descriptifs. 3 colonnes
// desktop, 2 en tablette, 1 en mobile (borne `min(340px,100%)`).
const ANALYSER: Array<{ href: string; icon: string; titre: string; sous: string; natif?: boolean }> = [
  { href: '/adsmap', icon: 'map', titre: 'Adsmap', sous: 'Tes tests et leurs verdicts' },
  // Lot 19A · la vue Analytics de l'Accueil (même chemin, autre recherche) ·
  // lien NATIF · le routeur client ne termine pas cette transition.
  { href: '/dashboard?vue=analytics', icon: 'chart', titre: 'Analytics', sous: 'Les KPI agrégés de tes campagnes', natif: true },
  { href: '/veille', icon: 'search', titre: 'Veille', sous: 'Observe les concurrents et ce qui scale' },
  { href: '/radar', icon: 'radar', titre: 'Radar créatif', sous: 'Repérer les créas à retravailler' },
  { href: '/jarvis', icon: 'brain', titre: 'Ce que Jarvis sait', sous: 'La mémoire de ta catégorie' },
];

// Les Studios · SECONDAIRES. Une seule expérience de création (retrait des
// anciens studios, 10/10) : préparer un projet, ou reprendre un projet.
const STUDIOS: Array<{ href: string; icon: string; titre: string; teinte: string }> = [
  { href: '/studio/projets/nouveau', icon: 'sparkles', titre: 'Nouveau projet', teinte: 'var(--grad-accent)' },
  { href: '/studio/projets', icon: 'folder', titre: 'Mes projets', teinte: 'linear-gradient(135deg, #4c2a9e, #8b5cf6)' },
];

export function AssistantHome({ firstName, credits, unlimited, brandName, aiReady, bandeau, marques, prochaineEtape, exemple, regles = [], vues, assistantOuvert = true }: AssistantHomeProps) {
  const etatCredits = afficherCredits({ balance: credits, unlimited });
  const ouvert = (href: string) => cheminOuvert(href, regles);
  const analyser = liensOuverts(ANALYSER, ouvert);
  const studios = liensOuverts(STUDIOS, ouvert);
  const note = noteAccesAccueil(ouvert);
  return (
    <div style={{ marginBottom: 32 }}>
      {/* En-tête COMPACT · salutation + crédits sur UNE ligne (les crédits
          restent présents · même vérité que la coquille, mais en ligne, pas en
          pavé) · sans eyebrow ni filet, pour laisser la place au bandeau et
          garder la première rangée de marques visible à 720. */}
      <div style={{ padding: '2px 0 14px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(21px, 3vw, 25px)', fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)', lineHeight: 1.2 }}>
            Bonjour {firstName}
          </h1>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-2)' }}>
            <span style={{ color: 'var(--accent-strong)', display: 'inline-flex' }}><Icon name="coin" size={13} /></span>
            {texteCredits(etatCredits, (n) => n.toLocaleString('fr-FR'))}{etatCredits.mode === 'solde' ? ' crédits' : ''}
          </span>
          {vues}
        </div>
        <p style={{ margin: '3px 0 0', fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.45 }}>
          {brandName
            ? <>Marque active · <b style={{ color: 'var(--ink-2)' }}>{brandName}</b> · Observe, teste, apprends de chaque itération.</>
            : <>Choisis une marque · Observe, teste, apprends de chaque itération.</>}
        </p>
        {/* Lot 11 · ce que le rôle n'ouvre pas est tu, et la raison est dite. */}
        {note && <p role="note" style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.45, maxWidth: 680 }}>{note}</p>}
      </div>

      {/* Le hero de la Home · bandeau à la une, PUIS les marques du compte
          (hiérarchie demandée · Kevin 30/09), avant le reste. */}
      {bandeau}
      {marques}

      {/* DEVANT · la prochaine itération (parcours réel ou prépare l'itération). */}
      {prochaineEtape}

      {/* Analyser & décider · les accès d'analyse existants, en cartes compactes. */}
      {analyser.length > 0 && <>
      <h2 style={sectionH}>Analyser &amp; décider</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: 12, margin: '10px 0 26px' }}>
        {analyser.map((a) => {
          const Lien = a.natif ? 'a' : Link;
          return (
          <Lien key={a.href} href={a.href} style={{
            display: 'flex', alignItems: 'center', gap: 12, minHeight: CIBLE_TACTILE_MIN, padding: '13px 15px', textDecoration: 'none',
            ...surface, background: 'var(--surface)', minWidth: 0,
          }}>
            <span aria-hidden style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: 'var(--paper)', border: '1px solid var(--line-2)', color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={a.icon} size={17} /></span>
            <span style={{ display: 'grid', gap: 1, minWidth: 0 }}>
              <b style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{a.titre}</b>
              <span style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.sous}</span>
            </span>
            <span aria-hidden style={{ flex: 1 }} />
            <span aria-hidden style={{ color: 'var(--muted)', fontWeight: 800 }}>›</span>
          </Lien>
          );
        })}
      </div>
      </>}

      {/* L'assistant · conservé, APRÈS les accès d'analyse · aucune génération auto.
          Masqué au rôle que le serveur refuse (SEC-03). */}
      {assistantOuvert && <>
      <h2 style={sectionH}>Demande à l’assistant</h2>
      <div style={{ marginTop: 10, marginBottom: 26 }}>
        <AssistantChat ready={aiReady} />
      </div>
      </>}

      {/* Créer les variantes de ton test · SECONDAIRE · rangée compacte, les
          Studios (nouveau projet, mes projets), sans surtitre de produit clé. */}
      {studios.length > 0 && <>
      <h2 style={sectionH}>Créer les variantes de ton test</h2>
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', margin: '10px 0 26px' }}>
        {studios.map((c) => (
          <Link key={c.href} href={c.href} style={{
            display: 'inline-flex', alignItems: 'center', gap: 9, minHeight: CIBLE_TACTILE_MIN, padding: '8px 14px 8px 9px', borderRadius: 12, textDecoration: 'none',
            border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600,
          }}>
            <span aria-hidden style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: c.teinte, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={c.icon} size={15} /></span>
            {c.titre}
          </Link>
        ))}
      </div>
      </>}

      {/* Explorer un exemple · replié, tout en bas. */}
      {exemple}
    </div>
  );
}

const sectionH = { margin: '0 0 4px', fontSize: 18, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-.01em' } as const;
