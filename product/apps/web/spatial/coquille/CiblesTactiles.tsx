'use client';

import { useEffect } from 'react';
import { ATTRIBUT_ZONE_TACTILE, PRIMITIVES_TACTILES, SELECTEUR_INTERACTIF, ZOOM_VUE_SECTION, styleCibleTactile, styleHoteZone, styleZoneTactile } from '@tiktrends/core';

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
 * Une case dessinée (mode `zone`) ne change pas · c'est son enfant vide
 * `[data-zone-tactile]` qui reçoit la taille de la cible, centré sur elle.
 *
 * Le rendu serveur et le bureau n'en voient rien (`actif` faux) · la parité
 * avec la maquette tient. Quitter le format téléphone (rotation, fenêtre
 * élargie) retire exactement ce qui a été posé.
 */

const TOUTES = PRIMITIVES_TACTILES.map((p) => p.selecteur).join(',');
const ZONE = `:scope > [${ATTRIBUT_ZONE_TACTILE}]`;
type Style = Array<readonly [string, string]>;
const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const declarations = (s: Record<string, string>): Style => Object.entries(s).map(([k, v]) => [kebab(k), v] as const);
/** Les règles sous un zoom donné · calculées une fois par zoom rencontré. */
const parZoom = new Map<number, Array<{ selecteur: string; style: Style; zone: Style | null }>>();
function regles(zoom: number) {
  let r = parZoom.get(zoom);
  if (!r) {
    r = PRIMITIVES_TACTILES.map((p) => ({ selecteur: p.selecteur, style: declarations(styleCibleTactile(p, zoom)), zone: p.mode === 'zone' ? declarations(styleZoneTactile(zoom)) : null }));
    parZoom.set(zoom, r);
  }
  return r;
}
/** Le zoom de la maquette sur l'élément · seule la vue (`#win > .view`) est zoomée, pas les surcouches. */
const zoomDe = (el: Element) => (el.closest('#win > .view') ? ZOOM_VUE_SECTION[document.body.dataset.sec ?? ''] ?? 1 : 1);

/** Ce que la coquille a posé, par élément · pour le retirer à l'identique. */
type Poses = WeakMap<Element, string[]>;

/** Pose ce qui manque en ligne sur `cible` et retient ce qui a été posé. */
function appliquer(cible: HTMLElement, style: Style, poses: Poses) {
  // Les propriétés présentes AVANT · un raccourci (`margin`, `border-width`) se
  // déplie en propriétés longues, ce sont elles qu'on retirera.
  const avant = new Set(Array.from(cible.style));
  for (const [k, v] of style) if (cible.style.getPropertyValue(k) === '') cible.style.setProperty(k, v);
  poses.set(cible, [...(poses.get(cible) ?? []), ...Array.from(cible.style).filter((k) => !avant.has(k))]);
}

function poser(el: Element, poses: Poses) {
  if (poses.has(el) || !(el instanceof HTMLElement) || !el.matches(SELECTEUR_INTERACTIF)) return;
  poses.set(el, []);
  const zone = el.querySelector(ZONE);
  for (const r of regles(zoomDe(el))) {
    if (!el.matches(r.selecteur)) continue;
    appliquer(el, r.style, poses);
    if (!r.zone || !(zone instanceof HTMLElement)) continue;
    appliquer(zone, r.zone, poses);
    appliquer(el, declarations(styleHoteZone(getComputedStyle(el).position)), poses);
  }
}

function parcourir(racine: ParentNode, poses: Poses) {
  if (racine instanceof Element && racine.matches(TOUTES)) poser(racine, poses);
  racine.querySelectorAll(TOUTES).forEach((el) => poser(el, poses));
}

function retirer(poses: Poses) {
  document.querySelectorAll(TOUTES).forEach((el) => {
    for (const c of [el, el.querySelector(ZONE)]) {
      const props = c && poses.get(c);
      if (props && c instanceof HTMLElement) for (const k of props) c.style.removeProperty(k);
    }
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
