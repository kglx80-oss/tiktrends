import { Fragment, type ReactNode } from 'react';
import { segmentsHypothese, LIBELLE_NIVEAU, LIBELLE_PRIORITE, type NiveauPreuve } from '@tiktrends/core';
import { CREA_ENTIERE, EnTete, ETIQUETTE_HORS_CREA, Lien, SousNav, Vue } from '../../communs';

/**
 * Les briques locales de la rubrique Résultats · SANS état, utilisables côté
 * serveur. Chacune reproduit À L'IDENTIQUE un motif de la maquette (fonctions
 * `ad`, `dots`, `pri`, `hl` du script principal) · le CSS de la maquette fait
 * le reste.
 */

/** Une créa (`div.ad`) · son média RÉEL, entier, ou un cadre vide honnête · jamais l'image d'exemple. L'étiquette ne la masque pas (D5). */
export function Pub({ texte, image, classe, tag, r916 }: { texte: ReactNode; image: string | null; classe?: string; tag?: ReactNode; r916?: boolean }) {
  return (
    <div className={['ad', r916 ? 'r916' : '', classe ?? ''].filter(Boolean).join(' ')}>
      <div className="ph">{image && <img src={image} alt="" style={CREA_ENTIERE} />}</div>
      <div className="band">{texte}</div>
      {tag != null && <span className="tag" style={ETIQUETTE_HORS_CREA}>{tag}</span>}
    </div>
  );
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
