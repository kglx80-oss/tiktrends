'use client';

import type { SaisieEnCours } from '@tiktrends/core';

/**
 * Les champs que l'utilisateur a remplis À LA MAIN dans le contenu (`main`) ·
 * suivis par l'événement `input` (une frappe réelle), jamais par la valeur
 * initiale · un champ prérempli par la page ne bloque rien. On ne garde que
 * l'élément · sa valeur est lue au moment de demander, et n'est stockée nulle
 * part (lot 15 · noyau `saisiesAProteger`).
 */
const remplis = new Set<HTMLInputElement | HTMLTextAreaElement>();
const TYPES_IGNORES = new Set(['hidden', 'checkbox', 'radio', 'range', 'file', 'submit', 'button', 'reset', 'color', 'image']);
let installe = false;

function surSaisie(e: Event) {
  const el = e.target;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  if (el instanceof HTMLInputElement && TYPES_IGNORES.has(el.type)) return;
  if (!el.closest('main')) return;
  remplis.add(el);
}

export function suivreSaisies() {
  if (installe || typeof document === 'undefined') return;
  installe = true;
  document.addEventListener('input', surSaisie, true);
}

function libelle(el: HTMLInputElement | HTMLTextAreaElement): string {
  return (el.labels?.[0]?.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || '').trim();
}

export function saisiesEnCours(): SaisieEnCours[] {
  const out: SaisieEnCours[] = [];
  for (const el of [...remplis]) {
    if (!el.isConnected) { remplis.delete(el); continue; }
    out.push({ libelle: libelle(el), valeur: el.value });
  }
  return out;
}

/** Pour les tests · repart d'une page sans saisie. */
export function oublierSaisies() { remplis.clear(); }
