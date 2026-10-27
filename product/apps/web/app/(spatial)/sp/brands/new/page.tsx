import { redirect } from 'next/navigation';
import { messagesRetourMarque } from '@tiktrends/core';
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
  return <NouvelleMarque depuisShopify={createBrandFromShopifyAction} creer={createBrandAction} retours={messagesRetourMarque()} />;
}
