import { validerDocument, type DocumentStudio } from '@tiktrends/core';

/**
 * Sauvegarde locale de SECOURS de l'éditeur de calques (cahier §10).
 *
 * Elle vit dans le navigateur de cet appareil seulement : aucune promesse
 * multi-appareil, et l'écran le dit. Elle garde le document de base (pour
 * pouvoir réappliquer sans écraser si la version a changé entre-temps) et le
 * document édité. Le stockage peut être absent, plein ou refusé (navigation
 * privée) : chaque accès est protégé, l'éditeur marche sans.
 */

export interface SauvegardeLocale {
  v: 1;
  baseVersionId: string;
  baseN: number;
  base: DocumentStudio | null;
  document: DocumentStudio;
  enregistreeLe: string;
}

export const cleSauvegarde = (projectId: string) => `tiktrends:editeur-calques:${projectId}`;

function stockage(): Storage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

export function lireSauvegardeLocale(projectId: string): SauvegardeLocale | null {
  try {
    const brut = stockage()?.getItem(cleSauvegarde(projectId));
    if (!brut) return null;
    const s = JSON.parse(brut) as SauvegardeLocale;
    if (s?.v !== 1 || typeof s.baseVersionId !== 'string' || typeof s.baseN !== 'number' || typeof s.enregistreeLe !== 'string') return null;
    // L8-C · un document hérité au-delà des limites reste lisible : on valide contre sa base.
    if (validerDocument(s.document, '/document', { base: s.base ?? undefined }).length) return null;
    if (s.base !== null && validerDocument(s.base, '/document', { base: s.base }).length) return null;
    return s;
  } catch {
    return null;
  }
}

export function ecrireSauvegardeLocale(projectId: string, s: Omit<SauvegardeLocale, 'v' | 'enregistreeLe'>, maintenant = new Date()): boolean {
  try {
    const st = stockage();
    if (!st) return false;
    st.setItem(cleSauvegarde(projectId), JSON.stringify({ v: 1, ...s, enregistreeLe: maintenant.toISOString() }));
    return true;
  } catch {
    return false;
  }
}

export function effacerSauvegardeLocale(projectId: string): void {
  try { stockage()?.removeItem(cleSauvegarde(projectId)); } catch { /* stockage indisponible · rien à effacer */ }
}
