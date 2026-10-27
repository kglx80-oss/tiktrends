'use client';

import { useState } from 'react';
import { LIBELLE_NIVEAU, type EtatApprentissage, type NiveauPreuve } from '@tiktrends/core';
import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { Points, Pub, type SousNavResultats } from './communs';

/**
 * « Apprentissages » · `docs/spatial/reference/apprentissages.html`, balisage à
 * l'identique. Les apprentissages RÉELS de la marque (`adsmap_learnings`), leur
 * niveau de preuve lu par la règle du noyau (`niveauPreuveApprentissage`), et ·
 * « À valider » · les lots prêts à conclure, dont l'apprentissage reste à écrire
 * (la validation passe par la fiche du lot, `validateVerdictAction`).
 */

export interface CarteApprentissage {
  id: string;
  niveau: NiveauPreuve;
  icone: string;
  etat: EtatApprentissage;
  titre: string;
  preuve: ReadonlyArray<{ texte: string; image: string | null; libelle: string; part: number; gagne: boolean }> | null;
  pied: string;
  /** Réemplois du constat dans des briefs · aucune source n'existe aujourd'hui, toujours `null`. */
  usage: string | null;
  action: { libelle: string; href: string };
}

export interface PropsApprentissages {
  sousNav: SousNavResultats;
  cartes: readonly CarteApprentissage[];
}

const LEGENDE: ReadonlyArray<[NiveauPreuve, string, string]> = [
  [3, 'Mesuré', 'Arbitré sur un verdict comparable et tranché'],
  [2, 'Observé', 'Rattaché à un verdict, sans comparaison au protocole'],
  [1, 'Non mesuré', 'Sans verdict derrière · à vérifier par un test'],
];
const FILTRES: ReadonlyArray<['tous' | NiveauPreuve, string]> = [['tous', 'Tous'], [3, 'Mesurés'], [2, 'Observés'], [1, 'À vérifier']];

export function Apprentissages(p: PropsApprentissages) {
  const [filtre, setFiltre] = useState<'tous' | NiveauPreuve>('tous');
  const liste = p.cartes.filter((c) => filtre === 'tous' || c.niveau === filtre);
  return (
    <Vue>
      <EnTete titre="Apprentissages" sous="Ce que tes tests ont montré, avec le niveau de preuve et ses limites" />
      <SousNav items={p.sousNav} actif="/adsmap/apprentissages" />
      <div className="grid3" style={{ marginBottom: 18 }}>
        {LEGENDE.map(([n, t, s]) => (
          <div className="tile" style={{ display: 'flex', gap: 12, alignItems: 'center' }} key={n}><Points n={n} /><div><strong>{t}</strong><p className="faint" style={{ fontSize: '11.5px' }}>{s}</p></div></div>
        ))}
      </div>
      <div className="seg" role="group" aria-label="Filtrer par niveau de preuve">
        {FILTRES.map(([k, t]) => <button type="button" key={k} aria-pressed={filtre === k} onClick={() => setFiltre(k)}>{t}</button>)}
      </div>
      <div className="lgrid">
        {liste.map((c) => (
          <article className="tile lcard" key={c.id}>
            <div className="head">
              <span className="ico"><Ic n={c.icone} /></span><Points n={c.niveau} /><span className="faint" style={{ fontSize: '11.5px' }}>{LIBELLE_NIVEAU[c.niveau]}</span>
              <span style={{ marginLeft: 'auto' }}>
                {c.etat === 'valider' ? <span className="pill w">À valider</span> : c.etat === 'retester' ? <span className="pill">À retester</span> : <span className="pill g"><Ic n="check" />Validé</span>}
              </span>
            </div>
            <h3>{c.titre}</h3>
            {c.preuve && (
              <div className="proof">
                {c.preuve.map((x, i) => [
                  <Pub key={`a${i}`} texte={x.texte} image={x.image} classe={x.gagne ? 'won' : undefined} />,
                  <div key={`b${i}`} className={`bar ${x.gagne ? 'w' : ''}`} style={{ flex: 1 }}><i><b style={{ width: `${x.part}%` }} /></i><span>{x.libelle}</span></div>,
                ])}
              </div>
            )}
            <div className="foot">
              <span>{c.pied}</span>{c.usage && <span>· {c.usage}</span>}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                {c.etat === 'valider'
                  ? <Lien className="btn sm pri" href={c.action.href}>{c.action.libelle}</Lien>
                  : <Lien className="btn sm" href={c.action.href}>{c.etat === 'valide' && <Ic n="loop" />}{c.action.libelle}</Lien>}
              </span>
            </div>
          </article>
        ))}
        {liste.length === 0 && <p className="faint">{p.cartes.length ? 'Aucun apprentissage à ce niveau de preuve.' : 'Aucun apprentissage pour cette marque · il s’écrit en concluant un lot.'}</p>}
      </div>
    </Vue>
  );
}
