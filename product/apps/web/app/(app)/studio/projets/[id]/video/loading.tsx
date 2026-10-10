import { cadrePage, h1 } from '../../../../../../components/ui';

/** Chargement du studio vidéo · annoncé (statut), sans animation imposée. */
export default function Chargement() {
  return (
    <main style={cadrePage}>
      <h1 style={h1}>Vidéo</h1>
      <p role="status" data-etat="chargement" style={{ marginTop: 14, fontSize: 14, color: 'var(--ink-2)' }}>Chargement du storyboard… Rien n’est lancé à l’ouverture de la page.</p>
    </main>
  );
}
