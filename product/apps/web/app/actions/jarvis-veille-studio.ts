'use server';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { refusJarvis } from '../../lib/jarvis-acces';
import { lireEntreeJarvisVeille } from '../../lib/veille-jarvis';
import { creerProjetDepuisSources } from './studios/sources';

/** Transfert explicite relu par la personne, sans appel IA ni rendu. */
export async function creerStudioDepuisJarvis(entree: { params: Record<string, string>; brandId: string; objectif: string; kind: string; cleClic: string; productId?: string; directionVisuelle?: { composition: string; styleIntent: string; formats: string[]; texts?: string[] } }) {
  const s = await getSession();
  if (!s || refusJarvis(s)) return { ok: false as const, message: 'Accès à Jarvis refusé.' };
  const marque = await getActiveBrand(s.workspaceId);
  if (!marque || marque.id !== entree?.brandId) return { ok: false as const, message: 'La marque active a changé. Rouvre la référence.' };
  const source = entree?.params && lireEntreeJarvisVeille(entree.params);
  if (!source || source.action !== 'cloner') return { ok: false as const, message: 'Rouvre une référence depuis Cloner.' };
  if (typeof entree.objectif !== 'string' || !entree.objectif.trim() || entree.objectif.length > 2000 || !['image', 'video'].includes(entree.kind)) {
    return { ok: false as const, message: 'Relis le brief (1 à 2 000 caractères) et choisis le format.' };
  }
  // Gardes studio, capacité, source/espace/marque et clé idempotente relues
  // dans la commande canonique, sans second moteur de création.
  const resultat = await creerProjetDepuisSources({ sources: [source.source], brandId: marque.id, kind: entree.kind, titre: `Adaptation pour ${marque.name}`, objectif: entree.objectif.trim(), cleClic: entree.cleClic, productId: entree.productId, directionVisuelle: entree.directionVisuelle });
  if (!resultat.ok && resultat.code === 'INVALID_SCHEMA') return { ...resultat, message: `${resultat.message} ${(resultat.violations ?? []).map(v => v.raison).join(' ')}` };
  return resultat;
}
