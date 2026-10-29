import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { segmentsHypothese, LIBELLE_NIVEAU, LIBELLE_PRIORITE, type NiveauPreuve } from '@tiktrends/core';
import { EnTete, Lien, SousNav, Vue } from '../../communs';

/**
 * Les briques locales de la rubrique Résultats · SANS état, utilisables côté
 * serveur. Chacune reproduit À L'IDENTIQUE un motif de la maquette (fonctions
 * `ad`, `dots`, `pri`, `hl` du script principal) · le CSS de la maquette fait
 * le reste.
 */

/** Une créa (`div.ad`) · son média RÉEL, ou un cadre vide honnête · jamais l'image d'exemple. */
export function Pub({ texte, image, classe, tag, r916 }: { texte: ReactNode; image: string | null; classe?: string; tag?: ReactNode; r916?: boolean }) {
  return (
    <div className={['ad', r916 ? 'r916' : '', classe ?? ''].filter(Boolean).join(' ')}>
      <div className="ph">{image && <img src={image} alt="" />}</div>
      <div className="band">{texte}</div>
      {tag != null && <span className="tag">{tag}</span>}
    </div>
  );
}

/**
 * Planche finale · D4 · la maquette range les variantes d'un lot sur une grille
 * de TROIS colonnes (`.rvfs`, `.lotgrid`) · une 4e variante passait seule à la
 * ligne, sa barre de coût 350 px plus bas, et le graphique ne se lisait plus
 * comme une comparaison. Au-delà de trois, les N variantes restent sur UNE
 * rangée (une colonne chacune, `minPx` au moins) ; quand la largeur manque
 * (390 px), la rangée défile à l'horizontale plutôt que de casser · la zone
 * défilante est alors atteignable au clavier et nommée. Jusqu'à trois, rien ne
 * change · le CSS de la maquette fait le reste.
 */
export function rangeeVariantes(n: number, minPx: number): { style?: CSSProperties; tabIndex?: number; role?: 'region'; 'aria-label'?: string } {
  if (n <= 3) return {};
  return {
    // `padding` · une zone défilante rogne ce qui dépasse · l'anneau de la gagnante (`.won`, 2 px hors du cadre) reste entier.
    style: { gridTemplateColumns: `repeat(${n}, minmax(${minPx}px, 1fr))`, overflowX: 'auto', padding: 2 },
    tabIndex: 0, role: 'region', 'aria-label': `Les ${n} variantes du lot, côte à côte`,
  };
}

/** Les trois points de preuve (`span.dots`) · 3 mesuré, 2 observé, 1 à vérifier. */
export function Points({ n }: { n: NiveauPreuve }) {
  return <span className="dots" aria-label={LIBELLE_NIVEAU[n]}>{[0, 1, 2].map((i) => <b key={i} className={i < n ? '' : 'o'} />)}</span>;
}

/** Les trois barres de priorité (`span.prio`). */
export function Priorite({ n }: { n: 0 | 1 | 2 | 3 }) {
  return <span className="prio" aria-label={`Priorité ${LIBELLE_PRIORITE[n]}`}>{[1, 2, 3].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}</span>;
}

/** Une hypothèse, « Si », « alors », « parce que » en gras (`hl`). */
export function Hypothese({ texte }: { texte: string }) {
  return <>{segmentsHypothese(texte).map((s, i) => (s.fort ? <b key={i}>{s.texte}</b> : <Fragment key={i}>{s.texte}</Fragment>))}</>;
}

/** La sous-navigation de la rubrique, filtrée par les droits (règle `sousNavResultats`). */
export type SousNavResultats = ReadonlyArray<{ href: string; libelle: ReactNode }>;

/**
 * L'écran quand Adsmap n'est pas ouvert à la personne · même message que l'Adsmap
 * V5 (formule, rôle, marque active), avec la seule porte qui débloque.
 */
export function RefusResultats({ titre, raison }: { titre: string; raison: 'plan' | 'role' | 'marque' }) {
  const message = raison === 'plan' ? 'Adsmap est disponible à partir de l’offre Plus.'
    : raison === 'role' ? 'Ton rôle ne permet pas d’accéder à Adsmap.'
      : 'Adsmap travaille marque par marque · chacune a sa carte, ses lots et ses seuils. Sélectionne une marque active.';
  return (
    <Vue>
      <EnTete titre={titre} sous="Résultats" />
      <section className="tile">
        <p className="muted">{message}</p>
        {raison === 'plan' && <Lien className="btn sm pri" href="/billing" style={{ marginTop: 12 }}>Voir les formules</Lien>}
        {raison === 'marque' && <Lien className="btn sm pri" href="/brands" style={{ marginTop: 12 }}>Choisir une marque</Lien>}
      </section>
    </Vue>
  );
}

export { SousNav };
