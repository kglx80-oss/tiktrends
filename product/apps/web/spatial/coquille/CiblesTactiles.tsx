'use client';

import { useEffect } from 'react';
import { PRIMITIVES_TACTILES, SELECTEUR_INTERACTIF, ZOOM_VUE_SECTION, styleCibleTactile } from '@tiktrends/core';

/**
 * Les cibles tactiles au téléphone (règles · `cibles-tactiles`, noyau).
 *
 * La feuille de la maquette est intouchable et les primitives (`.btn.sm`,
 * `.chip`, `.seg a`, cloche, avatar, interrupteurs…) sont écrites telles
 * quelles dans des centaines d'écrans, serveur compris · c'est donc la coquille
 * qui leur pose, AU TÉLÉPHONE SEULEMENT, le style en ligne qui les porte à
 * 44 px à l'écran (zoom de la vue compris). Un écran qui donne lui-même une
 * valeur en ligne à la même propriété garde la sienne.
 *
 * Le rendu serveur et le bureau n'en voient rien (`actif` faux) · la parité
 * avec la maquette tient. Quitter le format téléphone (rotation, fenêtre
 * élargie) retire exactement ce qui a été posé.
 */

const TOUTES = PRIMITIVES_TACTILES.map((p) => p.selecteur).join(',');
const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
/** Les règles sous un zoom donné · calculées une fois par zoom rencontré. */
const parZoom = new Map<number, Array<{ selecteur: string; style: Array<readonly [string, string]> }>>();
function regles(zoom: number) {
  let r = parZoom.get(zoom);
  if (!r) {
    r = PRIMITIVES_TACTILES.map((p) => ({ selecteur: p.selecteur, style: Object.entries(styleCibleTactile(p, zoom)).map(([k, v]) => [kebab(k), v] as const) }));
    parZoom.set(zoom, r);
  }
  return r;
}
/** Le zoom de la maquette sur l'élément · seule la vue (`#win > .view`) est zoomée, pas les surcouches. */
const zoomDe = (el: Element) => (el.closest('#win > .view') ? ZOOM_VUE_SECTION[document.body.dataset.sec ?? ''] ?? 1 : 1);

/** Ce que la coquille a posé, par élément · pour le retirer à l'identique. */
type Poses = WeakMap<Element, string[]>;

function poser(el: Element, poses: Poses) {
  if (poses.has(el) || !(el instanceof HTMLElement) || !el.matches(SELECTEUR_INTERACTIF)) return;
  // Les propriétés présentes AVANT · un raccourci (`margin`, `border-width`) se
  // déplie en propriétés longues, ce sont elles qu'on retirera.
  const avant = new Set(Array.from(el.style));
  for (const r of regles(zoomDe(el))) {
    if (!el.matches(r.selecteur)) continue;
    for (const [k, v] of r.style) if (el.style.getPropertyValue(k) === '') el.style.setProperty(k, v);
  }
  poses.set(el, Array.from(el.style).filter((k) => !avant.has(k)));
}

function parcourir(racine: ParentNode, poses: Poses) {
  if (racine instanceof Element && racine.matches(TOUTES)) poser(racine, poses);
  racine.querySelectorAll(TOUTES).forEach((el) => poser(el, poses));
}

function retirer(poses: Poses) {
  document.querySelectorAll(TOUTES).forEach((el) => {
    const props = poses.get(el);
    if (props && el instanceof HTMLElement) for (const k of props) el.style.removeProperty(k);
  });
}

export function useCiblesTactiles(actif: boolean) {
  useEffect(() => {
    if (!actif || typeof document === 'undefined') return;
    let poses: Poses = new WeakMap();
    parcourir(document.body, poses);
    // Les écrans se remplacent sans recharger la page (navigation client,
    // surcouches, listes qui se chargent) · chaque nœud ajouté est repris. Un
    // changement de section change le zoom de la vue · tout est reposé.
    const obs = typeof MutationObserver === 'undefined' ? null : new MutationObserver((lots) => {
      if (lots.some((l) => l.type === 'attributes')) { retirer(poses); poses = new WeakMap(); parcourir(document.body, poses); return; }
      for (const l of lots) l.addedNodes.forEach((n) => { if (n instanceof Element) parcourir(n, poses); });
    });
    obs?.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-sec'] });
    return () => { obs?.disconnect(); retirer(poses); };
  }, [actif]);
}
