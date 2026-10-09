import { lireCanvasProjet } from '../../../app/actions/studios/canvas';
import { CanvasMetier } from './CanvasMetier';
import { mini, section, texte, titre } from './styles';

/**
 * Point d'entrée serveur du canvas sur la page projet · LECTURE seule (aucune
 * écriture à la visite). Garde, portée et contenu relus par l'action ; un
 * refus ou un contenu illisible donnent un état clair, jamais un canvas à
 * moitié dessiné.
 */
export async function CanvasProjet({ projectId, versionId }: { projectId: string; versionId: string }) {
  const r = await lireCanvasProjet({ projectId, versionId });
  if (!r.ok) {
    // Hors portée ou sans droit : rien à montrer (la page a déjà dit pourquoi).
    if (r.code === 'NOT_FOUND' || r.code === 'FORBIDDEN' || r.code === 'AUTH_REQUIRED') return null;
    return (
      <section aria-labelledby="canvas-projet-titre" data-etat="erreur" style={section}>
        <h2 id="canvas-projet-titre" style={titre}>Canvas du projet</h2>
        <p role="alert" style={texte}>{r.message}</p>
        <p style={mini}>{r.code === 'INVALID_SCHEMA' ? 'Le brief et les ateliers restent disponibles · ouvre une version antérieure dans l’historique ou corrige le plan dans l’atelier Vidéo.' : 'Le brief et les ateliers restent disponibles · recharge la page pour réessayer.'} Identifiant support : {r.traceId}</p>
      </section>
    );
  }
  const c = r.canvas;
  return <CanvasMetier projectId={c.projectId} version={c.version} modele={c.modele} disposition={c.disposition} rev={c.rev} />;
}
