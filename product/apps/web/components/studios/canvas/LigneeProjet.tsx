import { lireLigneeProjet } from '../../../app/actions/studios/lignee';
import { CanvasLignee } from './CanvasLignee';
import { mini, section, texte, titre } from './styles';

/**
 * Point d'entrée serveur de la lignée sur la page projet · LECTURE seule. La
 * garde, la portée et les données sont relues par l'action ; un refus ou un
 * contenu illisible donnent un état clair, jamais une lignée à moitié dessinée.
 */
export async function LigneeProjet({ projectId }: { projectId: string }) {
  const r = await lireLigneeProjet({ projectId });
  if (!r.ok) {
    // Hors portée, sans droit ou capacité coupée : rien à montrer (la page l'a déjà dit).
    if (r.code === 'NOT_FOUND' || r.code === 'FORBIDDEN' || r.code === 'AUTH_REQUIRED' || r.code === 'UNSUPPORTED_CAPABILITY') return null;
    return (
      <section aria-labelledby="lignee-projet-titre" data-etat="erreur" style={section}>
        <h2 id="lignee-projet-titre" style={titre}>Canvas de lignée</h2>
        <p role="alert" style={texte}>{r.message}</p>
        <p style={mini}>Le brief et les ateliers restent disponibles · recharge la page pour réessayer. Identifiant support : {r.traceId}</p>
      </section>
    );
  }
  const l = r.lignee;
  // Rien de projeté au-delà de la marque · pas la peine de montrer un canvas vide.
  if (l.lignee.noeuds.length <= 1) return null;
  return <CanvasLignee projectId={l.projet.id} projet={l.projet} modele={l.lignee} />;
}

export default LigneeProjet;
