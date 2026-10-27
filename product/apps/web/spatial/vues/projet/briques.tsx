import type { CSSProperties, ReactNode } from 'react';
import { segmentsHypothese, type NoeudSpatial } from '@tiktrends/core';
import { Ic, Lien } from '../../communs';

/**
 * Briques SANS état de la rubrique « projet » · chacune reproduit à l'identique
 * un motif de la maquette (`docs/spatial/reference/projet.html`, `editeur`,
 * `video`). Locales à la rubrique · les briques communes ne sont pas touchées.
 */

/** La créa de la maquette (`div.ad`) · ici avec une VRAIE image (média livré, vignette de source). */
export function Ad({ src, bandeau, classe = '', alt = '', style, styleImage, enfants }: {
  src: string; bandeau?: ReactNode; classe?: string; alt?: string; style?: CSSProperties; styleImage?: CSSProperties; enfants?: ReactNode;
}) {
  return (
    <div className={['ad', classe].filter(Boolean).join(' ')} style={style}>
      <div className="ph"><img src={src} alt={alt} style={styleImage} />{enfants}</div>
      <div className="band">{bandeau}</div>
    </div>
  );
}

/**
 * Un nœud du canvas (`div.node`) · les parties dans l'ordre de la maquette. Un
 * nœud du brief de la version courante porte en plus « Cibler Jarvis » (geste
 * de la fiche V5), rendu par l'écran client (`geste`) · il choisit la cible
 * des propositions, il n'envoie rien.
 */
export function Noeud({ n, geste }: { n: NoeudSpatial; geste?: ReactNode }) {
  return (
    <div className={`node ${n.classe}`} data-noeud={n.id}>
      <span className="k">{n.etiquette}</span>
      {n.apercu && <Ad src={n.apercu.src} bandeau={n.apercu.bandeau} classe={n.apercu.classe} />}
      {n.titre && <strong>{n.titre}</strong>}
      {n.texte}
      {n.phrase && <span>{n.etiquette === 'HYPOTHÈSE' ? <HypotheseTexte enonce={n.phrase} /> : n.phrase}</span>}
      {n.barres.map((b) => (
        <div key={b.libelle} className={`rbar ${b.gagnant ? 'w' : ''}`}><span>{b.libelle}</span><i><b style={{ width: `${b.part}%` }} /></i><span>{b.valeur}</span></div>
      ))}
      {n.pied && <span>{n.pied}</span>}
      {n.pastille && <span className={`pill ${n.pastille.classe}`} style={{ justifySelf: 'start' }}>{n.pastille.libelle}</span>}
      {n.lien && (n.lien.forme === 'bouton'
        ? <Lien className="btn pri sm" href={n.lien.href}>{n.lien.libelle}</Lien>
        : <Lien className="pill c" style={{ justifySelf: 'start' }} href={n.lien.href}>{n.lien.libelle}</Lien>)}
      {geste}
    </div>
  );
}

/** Le texte d'une hypothèse sans enveloppe supplémentaire · `<b>` pour Si / alors, du texte nu sinon. */
function HypotheseTexte({ enonce }: { enonce: string }) {
  return <>{segmentsHypothese(enonce).map((s, i) => (s.fort ? <b key={i}>{s.texte}</b> : s.texte))}</>;
}

/** L'en-tête d'une tuile de la maquette (`div.sech` · titre, aide à droite). */
export function Sech({ titre, aide, style, enfants }: { titre: ReactNode; aide?: ReactNode; style?: CSSProperties; enfants?: ReactNode }) {
  return (
    <div className="sech" style={style ?? { margin: 0 }}>
      <h2>{titre}</h2>
      {aide != null && <span className="faint" style={{ fontSize: '12.5px' }}>{aide}</span>}
      {enfants}
    </div>
  );
}

/**
 * Un retour de geste dans une tuile · la pastille de la maquette porte le ton
 * (`pill g` fait, `pill w` refusé), le texte dit le reste. Aucune couleur
 * réécrite · le CSS de la maquette fait tout.
 */
export function Message({ ton, children }: { ton: 'ok' | 'err' | 'info'; children: ReactNode }) {
  return (
    <p role={ton === 'err' ? 'alert' : 'status'} className="muted" style={{ fontSize: '12.5px' }}>
      {ton !== 'info' && <span className={`pill ${ton === 'ok' ? 'g' : 'w'}`}>{ton === 'ok' ? 'Fait' : 'Refusé'}</span>} {children}
    </p>
  );
}

export { Ic };
