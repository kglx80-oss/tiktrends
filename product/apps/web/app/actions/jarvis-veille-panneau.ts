"use server";
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { refusJarvis } from '../../lib/jarvis-acces';
import { ficheMarqueLue } from '../../lib/jarvis-fiche';
import { gardeSources } from '../../lib/studios/sources/acces';
import { chargerSources } from '../../lib/studios/sources/sources';
import { lireEntreeJarvisVeille, brouillonJarvisVeille } from '../../lib/veille-jarvis';

/** Lecture seule, mêmes gardes que la page Jarvis Veille. Aucun fournisseur appelé. */
export async function chargerPanneauVeille(params: Record<string, string>) {
  const session = await getSession();
  if (!session || refusJarvis(session)) return { ok: false as const, message: 'Jarvis n’est pas accessible dans cet espace.' };
  const entree = lireEntreeJarvisVeille(params);
  const garde = await gardeSources('studio.read');
  if (!entree || !garde.ok) return { ok: false as const, message: 'Cette source n’est pas accessible.' };
  const sources = await chargerSources(garde.ctx, [entree.source], { veilleOuverte: garde.veilleOuverte, maintenant: new Date() });
  const brand = await getActiveBrand(session.workspaceId);
  if (!brand || !garde.ctx.marques.includes(brand.id)) return { ok: false as const, message: 'Choisis une marque accessible avant de continuer.' };
  if (!sources.ok || !sources.sources[0]) return { ok: false as const, message: 'Cette source n’est plus accessible dans ton espace.' };
  const source = sources.sources[0];
  return { ok: true as const, brandId: brand.id, brandName: brand.name, fiche: await ficheMarqueLue(brand.id), brouillon: brouillonJarvisVeille(entree.action, source, brand.name) };
}
