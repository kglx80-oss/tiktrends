/**
 * Studios · L5 · composants obligatoires d'une sortie (cahier 01 §4.4 point 5,
 * §4.6 « une boîte à la place des lunettes est un échec qualité, même si le
 * job fournisseur réussit » ; recette IMG-03).
 *
 * Pur. Le statut QUALITÉ d'une sortie se décide composant par composant :
 *
 *  · un composant constaté ABSENT (contrôle visuel : défaut bloquant ou majeur
 *    qui le nomme ; ou relecteur) ⇒ `rejected` ;
 *  · un composant NON VÉRIFIÉ (incertain, non mentionné par un contrôle qui
 *    n'a pas conclu, ou aucun contrôle du tout) ⇒ `requires_review` ;
 *  · `passed` seulement si CHAQUE composant est confirmé et le contrôle a
 *    conclu `passed`. La réussite technique du job n'entre pas ici : elle
 *    n'est même pas une entrée. Jamais de succès silencieux.
 */

import type { StatutQualite } from '../machines';

/** Le `result` de `quality_visual_output` (forme validée par le registre). */
export interface ControleVisuel {
  verdict: 'passed' | 'requires_review' | 'rejected';
  issues: Array<{ code: string; severity: 'blocking' | 'major' | 'minor'; targetId: string; observation: string; expected: string }>;
  unverifiable: string[];
}

/** Constat d'un relecteur · `null` = pas regardé. */
export interface ConstatComposant { composant: string; present: boolean | null }

export interface VerdictComposants {
  statut: Exclude<StatutQualite, 'pending'>;
  manquants: string[];
  nonVerifies: string[];
  confirmes: string[];
  raison: string;
}

const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const nomme = (texte: string, composant: string) => ` ${norm(texte)} `.includes(` ${norm(composant)} `);

/** Critères transmis au contrôle visuel · un par composant, plus l'identité du produit. */
export function criteresComposants(composants: readonly string[]): string[] {
  return [
    ...composants.map((c) => `Composant obligatoire visible et intact : ${c}`),
    'Le produit est celui de la photo épinglée (forme, couleurs, étiquette)',
  ];
}

export function verdictComposants(e: { requis: readonly string[]; controle: ControleVisuel | null; constats?: readonly ConstatComposant[] }): VerdictComposants {
  const manquants: string[] = [];
  const nonVerifies: string[] = [];
  const confirmes: string[] = [];
  const manuel = new Map((e.constats ?? []).map((c) => [norm(c.composant), c.present]));
  for (const c of e.requis) {
    const m = manuel.get(norm(c));
    if (m === false) { manquants.push(c); continue; }
    if (m === true) { confirmes.push(c); continue; }
    const k = e.controle;
    if (!k) { nonVerifies.push(c); continue; }
    const defaut = k.issues.some((i) => (i.severity === 'blocking' || i.severity === 'major') && (nomme(i.expected, c) || nomme(i.observation, c)));
    if (defaut) { manquants.push(c); continue; }
    const incertain = k.unverifiable.some((u) => nomme(u, c)) || k.issues.some((i) => nomme(i.expected, c) || nomme(i.observation, c));
    if (incertain || k.verdict !== 'passed') { nonVerifies.push(c); continue; }
    confirmes.push(c);
  }
  if (manquants.length) {
    return { statut: 'rejected', manquants, nonVerifies, confirmes, raison: `Composant${manquants.length > 1 ? 's' : ''} obligatoire${manquants.length > 1 ? 's' : ''} absent${manquants.length > 1 ? 's' : ''} : ${manquants.join(', ')} · échec qualité, même si le média est produit.` };
  }
  const identiteConfirmee = e.controle?.verdict === 'passed' || (e.requis.length > 0 && confirmes.length === e.requis.length && !e.controle);
  if (nonVerifies.length || !identiteConfirmee) {
    const quoi = nonVerifies.length ? `non vérifié${nonVerifies.length > 1 ? 's' : ''} : ${nonVerifies.join(', ')}` : 'identité du produit non contrôlée';
    return { statut: 'requires_review', manquants, nonVerifies, confirmes, raison: `Revue requise · ${quoi}.` };
  }
  return { statut: 'passed', manquants, nonVerifies, confirmes, raison: 'Chaque composant obligatoire est confirmé.' };
}
