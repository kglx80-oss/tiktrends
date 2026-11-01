'use server';

import type { ErreurStudio } from '@tiktrends/core';
import { gardeSources } from '../../../lib/studios/sources/acces';
import { refusCapacite } from '../../../lib/studios/interrupteurs';
import type { ResultatVersementProjet } from '../../../lib/studios/produit/commandes';
import { listerProjetsCartes } from './sources';

/**
 * Bibliothèque · « Utiliser dans un projet ».
 *
 *  · `projetsPourVersement` · les projets ACTIFS que la session voit, par la
 *    même lecture que la page Studios (`listerProjetsCartes` · garde studio,
 *    capacité « projets », portée espace + marques), réduits à ce que la
 *    fenêtre affiche ;
 *  · `verserSelectionDansProjet` · même garde et même capacité que
 *    `associerReference` (écran « Produit et références » · `studio.propose`,
 *    capacité « projets »), puis `verserSelectionBibliothequePour`. L'espace
 *    vient de la session, jamais du navigateur. Aucun appel modèle, aucune
 *    dépense.
 */

type Reponse<T> = ({ ok: true } & T) | ErreurStudio;

export interface ProjetVersement { id: string; titre: string; marque: string }

export async function projetsPourVersement(): Promise<Reponse<{ projets: ProjetVersement[] }>> {
  const r = await listerProjetsCartes();
  if (!r.ok) return r;
  return { ok: true, projets: r.cartes.map((c) => ({ id: c.id, titre: c.title, marque: c.marque })) };
}

export async function verserSelectionDansProjet(entree: { projectId: unknown; ids: unknown; role: unknown; scope: unknown }): Promise<Reponse<ResultatVersementProjet>> {
  const g = await gardeSources('studio.propose');
  if (!g.ok) return g;
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return coupe;
  const { verserSelectionBibliothequePour } = await import('../../../lib/studios/produit/commandes');
  return verserSelectionBibliothequePour(g.ctx, { projectId: entree?.projectId, ids: entree?.ids, role: entree?.role, scope: entree?.scope }, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
}
