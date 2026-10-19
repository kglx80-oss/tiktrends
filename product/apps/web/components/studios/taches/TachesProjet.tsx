import { gardeStudio } from '../../../lib/studios/garde';
import { listerTachesProjet } from '../../../lib/studios/execution/commandes';
import { PanneauTaches } from './PanneauTaches';
import { bloc, texte, petit } from '../variantes/styles';

/**
 * « Tâches » d'un projet · composant SERVEUR autonome, monté dans la page
 * projet avec `projectId` (matrice V5 Étape 6).
 *
 * Il relit la session et la portée (`gardeStudio('studio.read')`), lit les
 * tâches (lecture pure, aucune écriture, aucun rapprochement) et rend le
 * panneau client. Refus dits sans rien révéler (session, rôle, portée) ·
 * même message neutre que « Variantes et tests ».
 */
export async function TachesProjet({ projectId }: { projectId: string }) {
  const g = await gardeStudio('studio.read');
  if (!g.ok) {
    return (
      <div role="alert" style={bloc}>
        <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600 }}>{g.code === 'AUTH_REQUIRED' ? 'Ta session a expiré · reconnecte-toi pour voir les tâches.' : 'Accès refusé · ton rôle ne permet pas d’ouvrir les tâches de ce projet.'}</p>
        <p style={petit}>Identifiant support · <code style={{ fontFamily: 'var(--font-mono)' }}>{g.traceId}</code></p>
      </div>
    );
  }
  const r = await listerTachesProjet(g.ctx, { projectId });
  if (!r.ok) {
    return (
      <div role="alert" style={bloc}>
        <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600 }}>{r.message}</p>
        <p style={petit}>Identifiant support · <code style={{ fontFamily: 'var(--font-mono)' }}>{r.traceId}</code></p>
      </div>
    );
  }
  return <PanneauTaches taches={r.taches} projectId={projectId} />;
}

export default TachesProjet;
