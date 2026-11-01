'use server';

import {
  aPermissionEspace, briefCreationVersement, cheminProjetStudio, contenuVide, erreurStudio, etatNouveauProjet, validerCreationVersement,
  type ContenuVersion, type ErreurStudio, type EtatNouveauProjet,
} from '@tiktrends/core';
import { getActiveBrand } from '../../../lib/brands';
import { gardeSources } from '../../../lib/studios/sources/acces';
import { refusCapacite } from '../../../lib/studios/interrupteurs';
import type { ResultatVersementProjet } from '../../../lib/studios/produit/commandes';
import { creerProjet } from './projets';
import { listerProjetsCartes } from './sources';

/**
 * Bibliothèque · « Utiliser dans un projet ».
 *
 *  · `projetsPourVersement` · les projets ACTIFS que la session voit, par la
 *    même lecture que la page Studios (`listerProjetsCartes` · garde studio,
 *    capacité « projets », portée espace + marques), réduits à ce que la
 *    fenêtre affiche ; et ce que « Nouveau projet » propose (`etatNouveauProjet`
 *    · même règle que la page Studios : droit `studio.propose`, marque ACTIVE
 *    dans la portée) ;
 *  · `verserSelectionDansProjet` · même garde et même capacité que
 *    `associerReference` (écran « Produit et références » · `studio.propose`,
 *    capacité « projets »), puis `verserSelectionBibliothequePour` ;
 *  · `creerProjetEtVerser` · même garde, puis la création CANONIQUE
 *    `creerProjet` (sa garde, sa portée de marque, sa règle de nom, sa
 *    transaction et son audit, rien n'est réécrit ici), puis le MÊME
 *    versement. Les deux écritures restent séparées · `creerProjet` et
 *    `enregistrerVersion` tiennent chacune leur transaction, sans transaction
 *    partagée possible sans les dupliquer. Tout ce qui peut refuser le lot est
 *    vérifié AVANT la création (entrée, fichiers relus pour la marque du
 *    projet) · si le versement échoue ensuite, le projet créé RESTE (création
 *    voulue) et la réponse le dit (`versement` en erreur).
 *
 * L'espace vient de la session, jamais du navigateur. Aucun appel modèle,
 * aucune dépense.
 */

type Reponse<T> = ({ ok: true } & T) | ErreurStudio;

export interface ProjetVersement { id: string; titre: string; marque: string }

export async function projetsPourVersement(): Promise<Reponse<{ projets: ProjetVersement[]; creation: EtatNouveauProjet }>> {
  const r = await listerProjetsCartes();
  if (!r.ok) return r;
  const g = await gardeSources('studio.read');
  if (!g.ok) return g;
  // Une marque active illisible ne coupe pas la liste · la création n'est alors pas proposée (« sans marque »).
  const active = await getActiveBrand(g.ctx.workspaceId).catch(() => null);
  const creation = etatNouveauProjet({
    peutProposer: aPermissionEspace(g.ctx.permissions, 'studio.propose'),
    marqueActive: active && g.ctx.marques.includes(active.id) ? { id: active.id, name: active.name } : null,
  });
  return { ok: true, projets: r.cartes.map((c) => ({ id: c.id, titre: c.title, marque: c.marque })), creation };
}

export async function verserSelectionDansProjet(entree: { projectId: unknown; ids: unknown; role: unknown; scope: unknown }): Promise<Reponse<ResultatVersementProjet>> {
  const g = await gardeSources('studio.propose');
  if (!g.ok) return g;
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return coupe;
  const { verserSelectionBibliothequePour } = await import('../../../lib/studios/produit/commandes');
  return verserSelectionBibliothequePour(g.ctx, { projectId: entree?.projectId, ids: entree?.ids, role: entree?.role, scope: entree?.scope }, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
}

export interface ResultatCreationVersement {
  /** Le projet CRÉÉ · il existe dès que la réponse est `ok`, versement réussi ou non. */
  projet: { id: string; titre: string; href: string };
  /** Le versement dans ce projet · une erreur ici ne défait PAS la création. */
  versement: Reponse<ResultatVersementProjet>;
}

export async function creerProjetEtVerser(entree: { brandId: unknown; titre: unknown; type: unknown; ids: unknown; role: unknown; scope: unknown }): Promise<Reponse<ResultatCreationVersement>> {
  const g = await gardeSources('studio.propose');
  if (!g.ok) return g;
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return coupe;
  const v = validerCreationVersement(entree);
  if (!v.ok) return erreurStudio('INVALID_SCHEMA', { traceId: g.ctx.traceId, violations: [{ chemin: 'versement', raison: v.raison }] });
  const { refusFichiersVersementPour, verserSelectionBibliothequePour } = await import('../../../lib/studios/produit/commandes');
  // Les fichiers relus pour la marque du projet AVANT de créer · une marque hors portée est refusée par `creerProjet` (même réponse qu'une marque inconnue).
  if (g.ctx.marques.includes(v.brandId)) {
    const refus = await refusFichiersVersementPour(g.ctx, v.ids, v.brandId);
    if (refus.length) return erreurStudio('INVALID_SCHEMA', { traceId: g.ctx.traceId, violations: refus });
  }
  const contenu: ContenuVersion = { ...contenuVide(), brief: briefCreationVersement() as unknown as ContenuVersion['brief'] };
  const cree = await creerProjet({ brandId: v.brandId, kind: v.type, title: v.titre, contenu });
  if (!cree.ok) return cree;
  const versement = await verserSelectionBibliothequePour(g.ctx, { projectId: cree.projet.id, ids: v.ids, role: v.role, scope: v.scope }, { veilleOuverte: g.veilleOuverte, maintenant: new Date() })
    .catch((): ErreurStudio => erreurStudio('PERSISTENCE_FAILED', { traceId: g.ctx.traceId }));
  return { ok: true, projet: { id: cree.projet.id, titre: cree.projet.title, href: `${cheminProjetStudio(cree.projet.id)}/produit` }, versement };
}
