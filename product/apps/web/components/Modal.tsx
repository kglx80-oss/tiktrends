'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CIBLE_TACTILE_MIN, MEDIA_FEUILLE_MODALE, MODALE_V5, presentationModale, teinte } from '@tiktrends/core';
import { usePiegeFocus } from './use-piege-focus';
import { Portail } from './Portail';
import { useIsMobile, MEDIA_TELEPHONE } from './useIsMobile';
import { surface } from './ui';

/**
 * Fenêtre modale réutilisable (pop-up). Base du système « tout en pop-up » ·
 * à réutiliser pour toute action courte plutôt que d'ouvrir une nouvelle page.
 *
 * ── V5 (lot A3) ──────────────────────────────────────────────────────────────
 *
 * Fenêtre CENTRÉE sur un voile au-dessus de 600 px, FEUILLE ancrée en bas
 * (poignée, coins hauts arrondis) en dessous · Échap, clic sur le voile ou ×
 * ferment. Les mesures (marges 24/28, hauteur max, pied) sont relevées dans le
 * prototype et vivent au noyau (`MODALE_V5`, `presentationModale`).
 *
 * Trois zones empilées dans un panneau en colonne · l'en-tête et le PIED ne
 * rétrécissent pas (`flexShrink: 0`), seul le corps défile (`minHeight: 0`).
 * Le pied est donc HORS du conteneur défilant · ses actions restent visibles
 * quel que soit le défilement du corps (prouvé par `test/a3-modale-v5.test.tsx`).
 * Le contenu du corps est posé dans une enveloppe `flexShrink: 0` · il n'est
 * jamais écrasé par la colonne, il défile.
 *
 * Sur feuille, un fondu de 28 px signale qu'il reste à défiler, et disparaît en
 * bout de course · le masque ne lit que l'opacité, aucune couleur n'est peinte.
 *
 * ── Rendue via un PORTAIL vers <body> ────────────────────────────────────────
 *
 * Sans ça, la modale héritait du CONTEXTE D'EMPILEMENT de l'endroit d'où on
 * l'ouvre · le rail latéral, ou un ancêtre transformé (`transform`) du tableau
 * de bord. Un `position: fixed` sous un ancêtre transformé n'est plus relatif à
 * l'écran mais à cet ancêtre · l'overlay ne couvrait plus la page, et le chrome
 * de page (sélecteur « équipe & invitations », cartes) passait PAR-DESSUS la
 * modale. Montée sur <body>, elle est au niveau racine · son overlay couvre
 * vraiment l'écran et son z-index domine tout le chrome. (Le voile · clic
 * extérieur · Échap · piège à focus · retour du focus au déclencheur · verrou
 * du défilement de la page passent par `usePiegeFocus`.)
 */
export function Modal({
  open, onClose, title, subtitle, children, maxWidth = 460, icon, pleinEcranTelephone = false, pied,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  maxWidth?: number;
  icon?: ReactNode;
  /**
   * Plein écran sur téléphone (≤ 480 px) · cahier Studios §153 : « panneau plein
   * écran refermable ». Optionnel : les autres écrans gardent leur fenêtre
   * centrée (feuille sous 600 px).
   */
  pleinEcranTelephone?: boolean;
  /**
   * Les actions de la fenêtre · rendues dans un pied COLLANT, hors de la zone
   * qui défile, toujours visibles. Un bouton d'envoi d'un formulaire du corps
   * s'y rattache par l'attribut `form`.
   */
  pied?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Le piège à focus partagé · même comportement (focus entrant, Tab piégé,
  // Échap, verrou du défilement, retour au déclencheur), éprouvé une seule fois.
  usePiegeFocus(panelRef, { actif: open, onFermer: onClose });
  const feuille = useIsMobile(MEDIA_FEUILLE_MODALE);
  const telephone = useIsMobile(MEDIA_TELEPHONE);
  const presentation = presentationModale({ feuille, telephone, pleinEcranDemande: pleinEcranTelephone });
  const centree = presentation === 'centree';
  const plein = presentation === 'plein-ecran';
  const m = centree ? MODALE_V5.centree : MODALE_V5.feuille;

  // Reste-t-il à défiler ? · l'élément du corps passe par un état (ref de
  // rappel) : le portail le recrée en le montant sur <body>, une ref d'objet
  // lue dans un effet garderait l'ancien nœud.
  const [corps, setCorps] = useState<HTMLDivElement | null>(null);
  const [suite, setSuite] = useState(false);
  const mesurer = useCallback(() => {
    if (!corps) return;
    setSuite(corps.scrollHeight - corps.scrollTop - corps.clientHeight > 1);
  }, [corps]);
  useEffect(() => {
    if (!open || centree || !corps) return;
    mesurer();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(mesurer);
    ro.observe(corps);
    if (corps.firstElementChild) ro.observe(corps.firstElementChild);
    return () => ro.disconnect();
  }, [open, centree, corps, mesurer]);

  if (!open) return null;

  // Le masque ne lit que l'alpha · un token opaque, aucune couleur peinte.
  const masque = !centree && suite
    ? `linear-gradient(180deg, var(--ink) calc(100% - ${MODALE_V5.feuille.masque}px), transparent)`
    : undefined;

  const panneau: CSSProperties = {
    // Rôle `surface` (lot 19D) · --line, r-card · le voile et l'ombre détachent déjà la fenêtre.
    ...surface,
    // `border-box` · la bordure tient DANS la hauteur (plein écran à 100dvh sans déborder de 2 px, mesuré).
    boxSizing: 'border-box', width: '100%', maxWidth, background: 'var(--surface)',
    boxShadow: `0 30px 70px -20px ${teinte('ombre', .7)}`, overflow: 'hidden',
    maxHeight: MODALE_V5.centree.hauteurMax, display: 'flex', flexDirection: 'column',
    ...(presentation === 'feuille' ? {
      maxWidth: 'none', maxHeight: MODALE_V5.feuille.hauteurMax,
      borderRadius: `${MODALE_V5.feuille.rayonHaut} ${MODALE_V5.feuille.rayonHaut} 0 0`,
    } : {}),
    ...(plein ? { maxWidth: 'none', height: '100dvh', maxHeight: '100dvh', borderRadius: 0 } : {}),
  };

  return (
    <Portail><div
      onClick={onClose}
      data-modale-voile=""
      style={{
        position: 'fixed', inset: 0, zIndex: 200, display: 'flex',
        alignItems: centree ? 'center' : 'flex-end', justifyContent: 'center',
        padding: centree ? MODALE_V5.centree.margeEcran : 0, background: teinte('voile-teinte', .62), backdropFilter: MODALE_V5.flouVoile,
      }}
    >
      <div
        ref={panelRef}
        role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        data-presentation={presentation} data-plein-ecran={plein ? 'oui' : undefined}
        onClick={(e) => e.stopPropagation()}
        style={panneau}
      >
        {presentation === 'feuille' && (
          <span aria-hidden data-modale-poignee="" style={{
            display: 'block', flexShrink: 0, width: MODALE_V5.feuille.poignee.largeur, height: MODALE_V5.feuille.poignee.hauteur,
            borderRadius: 2, background: 'var(--line-2)', margin: `${MODALE_V5.feuille.poignee.margeHaut}px auto 0`,
          }} />
        )}
        <div data-modale-entete="" style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 12, padding: m.enTete, borderBottom: '1px solid var(--line)' }}>
          {icon && <span style={{ fontSize: 22, lineHeight: 1, paddingTop: 11, flexShrink: 0 }}>{icon}</span>}
          <div style={{ flex: 1, minWidth: 0, paddingTop: 10 }}>
            <h2 style={{ margin: 0, fontSize: 18, lineHeight: 1.35, fontWeight: 600, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{title}</h2>
            {subtitle && <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 3, lineHeight: 1.5 }}>{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" style={{
            width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN, flexShrink: 0, borderRadius: MODALE_V5.croixRayon,
            border: '1px solid transparent', background: 'transparent',
            color: 'var(--ink-2)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          }}>
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div
          ref={setCorps}
          data-modale-corps=""
          onScroll={centree ? undefined : mesurer}
          style={{
            flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
            display: 'flex', flexDirection: 'column', padding: m.corps,
            maskImage: masque, WebkitMaskImage: masque,
          }}
        >
          <div style={{ flexShrink: 0, paddingBottom: m.finCorps }}>{children}</div>
        </div>
        {pied && (
          <div data-modale-pied="" style={{ flexShrink: 0, padding: m.pied, borderTop: '1px solid var(--line)', background: 'var(--surface)' }}>
            {pied}
          </div>
        )}
      </div>
    </div></Portail>
  );
}

/**
 * La rangée d'actions d'un pied de modale · Annuler à gauche de l'action
 * principale, alignées à droite, qui passent à la ligne sur feuille étroite.
 */
export function PiedModale({ children, entre = false }: { children: ReactNode; entre?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: entre ? 'space-between' : 'flex-end' }}>
      {children}
    </div>
  );
}
