import { gardeStudio } from '../../lib/studios/garde';
import { listerVariantes } from '../../lib/studios/variantes/variantes';
import { accesAdsmap, etatRelecture } from '../../lib/studios/variantes/acces';
import { PanneauVariantes, type EtatRecette } from './variantes/PanneauVariantes';
import { bloc, texte, petit } from './variantes/styles';

/**
 * « Variantes et tests » d'un projet · composant SERVEUR autonome, à monter
 * dans la page projet (agent L4-B) avec `projectId`.
 *
 * Il relit la session et la portée (`gardeStudio('studio.read')`), lit les
 * données (lecture pure, aucune écriture) et rend le panneau client. Les refus
 * sont dits sans rien révéler : pas de session, rôle sans accès au studio,
 * projet hors portée ou inconnu (même message neutre).
 */
export async function VariantesEtTests({ projectId, recette }: { projectId: string; recette?: EtatRecette }) {
  const g = await gardeStudio('studio.read');
  if (!g.ok) {
    return (
      <div role="alert" style={bloc}>
        <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600 }}>{g.code === 'AUTH_REQUIRED' ? 'Ta session a expiré · reconnecte-toi pour voir les variantes.' : 'Accès refusé · ton rôle ne permet pas d’ouvrir les variantes de ce projet.'}</p>
        <p style={petit}>Identifiant support · <code style={{ fontFamily: 'var(--font-mono)' }}>{g.traceId}</code></p>
      </div>
    );
  }
  const r = await listerVariantes(g.ctx, { projectId }, { adsmapAcces: await accesAdsmap(), relecture: await etatRelecture() });
  if (!r.ok) {
    return (
      <div role="alert" style={bloc}>
        <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600 }}>{r.message}</p>
        <p style={petit}>Identifiant support · <code style={{ fontFamily: 'var(--font-mono)' }}>{r.traceId}</code></p>
      </div>
    );
  }
  return <PanneauVariantes donnees={r.donnees} recette={recette} />;
}

export default VariantesEtTests;
