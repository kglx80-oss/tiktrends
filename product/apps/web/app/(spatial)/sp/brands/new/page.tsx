import { redirect } from 'next/navigation';
import { messageLimiteConcurrents, messagesRetourMarque } from '@tiktrends/core';
import { forfaitEffectif, refusMarqueEspace } from '../../../../../lib/droits-forfait';
import { getSession } from '../../../../../lib/auth';
import { roleAtLeast } from '../../../../../lib/rbac';
import { createBrandAction, createBrandFromShopifyAction } from '../../../../actions/brands';
import { NouvelleMarque } from '../../../../../spatial/vues/marque/NouvelleMarque';

export const dynamic = 'force-dynamic';

/**
 * `/brands/new` · déclaré PARCE QUE `/brands/[id]` le couvrirait sinon (un
 * segment dynamique accepte « new ») · sans cet écran, la création d'une
 * marque tombait sur une fiche introuvable en mode Spatial. Même garde que la
 * page V5 (admin d'espace).
 */
export default async function NouvelleMarqueSpatiale() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  // Droits du forfait (29/10, point 6) · plus de marque possible ⇒ la liste dit pourquoi et quel forfait l'ouvre, avant tout formulaire.
  if (await refusMarqueEspace(s.workspaceId, s.plan)) redirect('/brands?e=limite_marques');
  return <NouvelleMarque depuisShopify={createBrandFromShopifyAction} creer={createBrandAction} retours={messagesRetourMarque({ limiteConcurrents: messageLimiteConcurrents(forfaitEffectif(s.plan)) })} />;
}
