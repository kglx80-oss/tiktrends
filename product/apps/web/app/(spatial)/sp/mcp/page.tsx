import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { Mcp } from '../../../../spatial/vues/mcp/Mcp';

export const dynamic = 'force-dynamic';

/**
 * « MCP TikTrends » · adresse NOUVELLE (aucun écran V5). Aucun backend MCP
 * n'existe · la page le dit (« bientôt »), sans clé, sans outil, sans
 * branchement simulé. Rien n'est lu en base · seule la session est exigée,
 * comme pour toute page de l'application.
 */
export default async function McpSpatial() {
  const s = await getSession();
  if (!s) redirect('/login');
  return <Mcp />;
}
