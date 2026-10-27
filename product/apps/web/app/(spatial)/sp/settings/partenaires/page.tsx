import { redirect } from 'next/navigation';
import { getSession } from '../../../../../lib/auth';
import { roleAtLeast } from '../../../../../lib/rbac';
import { Partenaires } from '../../../../../spatial/vues/reglages/Partenaires';
import { SOUS_NAV_REGLAGES } from '../../../../../spatial/vues/reglages/sous-nav';

export const dynamic = 'force-dynamic';

/**
 * Nouvelle adresse (maquette Spatial) · aucune donnée de partenaire n'existe
 * en base · l'écran ne montre que l'état vide honnête. Même garde que les
 * autres Réglages (admin d'espace).
 */
export default async function PartenairesSpatial() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  return <Partenaires sousNav={SOUS_NAV_REGLAGES} equipe="/team" />;
}
