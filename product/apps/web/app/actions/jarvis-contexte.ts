'use server';

import { demandeContexteJarvis, type TypeContexteJarvis } from '@tiktrends/core';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { refusJarvis } from '../../lib/jarvis-acces';

/**
 * Le contexte de la page affichée, pour le tiroir Jarvis de la coquille (RJ G03,
 * lot 5 bis) · la MÊME relecture que `/jarvis?contexte=…` et la route
 * `/api/jarvis/chat` (`resoudreContexteJarvis` · espace, marque ACTIVE, droits).
 *
 * Lecture seule · aucun modèle, aucune écriture, aucune dépense. Ce qui revient
 * est la puce du tiroir (type, identifiant relu, libellé) · le texte joint au
 * modèle reste relu par la route à chaque envoi, jamais repris de l'écran. Un
 * refus (sans droit Jarvis, sans marque, autre marque, inconnu, mal formé)
 * rend `null` · le tiroir ne joint rien et ne dit pas si l'objet existe ailleurs.
 */
export async function contexteJarvisAction(type: unknown, id: unknown): Promise<{ type: TypeContexteJarvis; id: string; libelle: string } | null> {
  const demande = demandeContexteJarvis(type, id);
  if (!demande || demande.type === 'projet') return null;
  const s = await getSession();
  if (!s || refusJarvis(s)) return null;
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return null;
  // Chargée à l'appel · la coquille (cliente) importe cette action, la lecture des lots n'a rien à faire à son chargement.
  const { resoudreContexteJarvis } = await import('../../lib/jarvis-contexte');
  const r = await resoudreContexteJarvis(s, brand, demande);
  return r ? { type: r.type, id: r.id, libelle: r.libelle } : null;
}
