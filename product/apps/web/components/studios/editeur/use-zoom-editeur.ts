'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  bornesZoom, centreZone, dispositionZone, facteurMolette, palierVoisin, zoomAjuste, zoomerAutour,
  type ActionZoom, type DimensionsDocument, type DispositionZone, type Point2, type TailleZone,
} from '@tiktrends/core';

/**
 * Zoom de la zone de travail de l'éditeur · état d'AFFICHAGE seulement.
 *
 * Toutes les décisions (ajustement, bornes, paliers, point fixe, molette)
 * viennent du noyau (`calques/zoom.ts`) ; ce crochet mesure la zone, garde le
 * mode (« ajusté » suit la taille de la zone, « libre » garde son zoom),
 * applique le défilement calculé APRÈS le rendu, et écoute la molette avec
 * Ctrl/⌘ (écouteur non passif : la page ne zoome pas à la place de l'éditeur).
 * Rien ici ne touche le document, l'historique ou les versions.
 */

export type ModeZoom = { mode: 'ajuste' } | { mode: 'libre'; zoom: number };

export interface ZoomEditeur {
  /** Ref de la zone défilante · mesure et molette s'y branchent. */
  refZone: (el: HTMLDivElement | null) => void;
  /** Zoom affiché · `null` tant que la zone n'est pas mesurée (ajustement CSS). */
  zoom: number | null;
  mode: ModeZoom['mode'];
  disposition: DispositionZone | null;
  /** Bornes atteintes · les boutons le disent. */
  auMin: boolean;
  auMax: boolean;
  agir: (a: ActionZoom | 'reelle') => boolean;
}

const lire = (el: HTMLDivElement): TailleZone | null => {
  const largeur = el.clientWidth;
  const hauteur = el.clientHeight;
  return largeur > 0 && hauteur > 0 ? { largeur, hauteur } : null;
};

export function useZoomEditeur(doc: DimensionsDocument | null): ZoomEditeur {
  const [taille, setTaille] = useState<TailleZone | null>(null);
  const [etat, setEtat] = useState<ModeZoom>({ mode: 'ajuste' });
  const zone = useRef<HTMLDivElement | null>(null);
  const viser = useRef<Point2 | null>(null);
  const nettoyer = useRef<(() => void) | null>(null);

  const zoom = doc && taille ? (etat.mode === 'libre' ? etat.zoom : zoomAjuste(doc, taille)) : null;
  const disposition = doc && taille && zoom !== null ? dispositionZone(doc, taille, zoom) : null;
  const bornes = doc ? bornesZoom(doc, taille) : null;

  const derniers = useRef({ doc, taille, zoom, bornes });
  derniers.current = { doc, taille, zoom, bornes };

  /** Zoom à point fixe · `point` en coordonnées de la zone (centre par défaut). */
  const zoomer = useCallback((nouveau: (z: number) => number, point?: Point2): boolean => {
    const { doc: d, taille: t, zoom: z } = derniers.current;
    const el = zone.current;
    if (!d || !t || z === null || !el) return false;
    const r = zoomerAutour({ doc: d, zone: t, zoom: z, defilement: { x: el.scrollLeft, y: el.scrollTop }, nouveauZoom: nouveau(z), point: point ?? centreZone(t) });
    viser.current = r.defilement;
    setEtat({ mode: 'libre', zoom: r.zoom });
    return true;
  }, []);

  const agir = useCallback((a: ActionZoom | 'reelle'): boolean => {
    const { doc: d, taille: t, bornes: b } = derniers.current;
    if (!d || !t || !b) return false;
    if (a === 'ajuster') { viser.current = { x: 0, y: 0 }; setEtat({ mode: 'ajuste' }); return true; }
    if (a === 'reelle') return zoomer(() => 1);
    return zoomer((z) => palierVoisin(z, a === 'plus' ? 1 : -1, b));
  }, [zoomer]);

  // Le défilement visé s'applique une fois le contenu redimensionné.
  useLayoutEffect(() => {
    const el = zone.current;
    const v = viser.current;
    if (!el || !v) return;
    viser.current = null;
    el.scrollLeft = v.x;
    el.scrollTop = v.y;
  });

  const refZone = useCallback((el: HTMLDivElement | null) => {
    nettoyer.current?.();
    nettoyer.current = null;
    zone.current = el;
    if (!el) { setTaille(null); return; }
    const mesurer = () => setTaille((avant) => {
      const t = lire(el);
      return avant && t && avant.largeur === t.largeur && avant.hauteur === t.hauteur ? avant : t;
    });
    mesurer();
    const molette = (ev: WheelEvent) => {
      if (!(ev.ctrlKey || ev.metaKey)) return; // sans modificateur : la zone défile (déplacement)
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      zoomer((z) => z * facteurMolette(ev.deltaY, ev.deltaMode), { x: ev.clientX - r.left, y: ev.clientY - r.top });
    };
    el.addEventListener('wheel', molette, { passive: false });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(mesurer);
    ro?.observe(el);
    nettoyer.current = () => { el.removeEventListener('wheel', molette); ro?.disconnect(); };
  }, [zoomer]);

  return {
    refZone,
    zoom,
    mode: etat.mode,
    disposition,
    auMin: zoom !== null && bornes !== null && zoom <= bornes.min + 1e-9,
    auMax: zoom !== null && bornes !== null && zoom >= bornes.max - 1e-9,
    agir,
  };
}
