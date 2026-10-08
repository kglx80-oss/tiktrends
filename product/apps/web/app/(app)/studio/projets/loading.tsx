import { cadrePage, h1 } from '../../../../components/ui';

/** Chargement des projets · annoncé (statut), sans animation imposée. */
export default function Chargement() {
  return (
    <main style={cadrePage}>
      <h1 style={h1}>Projets</h1>
      <p role="status" style={{ marginTop: 14, fontSize: 14, color: 'var(--ink-2)' }}>Chargement des projets…</p>
    </main>
  );
}
