import type { ReactNode } from 'react';

/**
 * Briques LOCALES de la rubrique Studios (sans état, serveur ou client) · elles
 * reproduisent le balisage de la maquette. Une brique commune manquante vit ici,
 * pas dans `spatial/communs` (chantiers parallèles).
 */

export interface CreativeSpatiale {
  /** L'image RÉELLE (photo produit, vignette d'une pub mesurée) · absente, la carte reste vide, jamais une image inventée. */
  src: string | null;
  /** Le bandeau de texte de la maquette · seulement quand un texte réel existe. */
  texte?: string | null;
  format?: '916' | null;
  /** `won` (gagnante), `v` (nouvelle variante). */
  classe?: string;
  tag?: string | null;
}

/** La créa de la maquette (`div.ad > div.ph > img` + `div.band`) · fonction `ad()` du prototype. */
export function Creative({ c }: { c: CreativeSpatiale }) {
  const cls = ['ad', c.format === '916' ? 'r916' : '', c.classe ?? ''].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className="ph">{c.src && <img src={c.src} alt="" />}</div>
      {c.texte != null && <div className="band">{c.texte}</div>}
      {c.tag && <span className="tag">{c.tag}</span>}
    </div>
  );
}

/** Un état vide honnête dans le langage de la maquette (`div.tile` centré, comme « Aucun projet archivé »). */
export function TuileVide({ titre, texte, action }: { titre: string; texte: ReactNode; action?: ReactNode }) {
  return (
    <div className="tile" style={{ textAlign: 'center', padding: 40 }}>
      <h3>{titre}</h3>
      <p className="muted">{texte}</p>
      {action}
    </div>
  );
}
