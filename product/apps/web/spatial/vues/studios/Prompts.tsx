'use client';

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { useSpatial } from '../../coquille/contexte';
import { TuileVide } from './briques';

/**
 * « Prompts conseillés » · `docs/spatial/reference/prompts.html`, balisage à
 * l'identique. PRÉSENTATIONNEL + interactions locales (catégorie, copie).
 *
 * La page ne lui passe QUE des prompts d'un dépôt réel · aujourd'hui aucun
 * (voir la page) : l'écran montre alors l'état vide qui le dit, sans catégorie
 * ni contexte inventés. « Copier » écrit vraiment dans le presse-papiers ;
 * « Utiliser » ouvre la préparation d'un projet avec le texte en objectif.
 */

export interface PromptSpatial {
  id: string;
  categorie: string;
  titre: string;
  description: string;
  /** Le texte du prompt · les variables à remplir sont marquées. */
  morceaux: ReadonlyArray<{ texte: string; variable?: boolean }>;
  pastilles: ReadonlyArray<{ libelle: string; classe: string }>;
  requis: string;
  appui: string;
  utiliser: string;
}

export interface PropsPrompts {
  sousNav: ReadonlyArray<{ href: string; libelle: ReactNode }>;
  categories: ReadonlyArray<{ cle: string; libelle: string; bientot?: boolean }>;
  /** Le contexte réel lu (lot conclu, apprentissage) · `null` sans source. */
  contexte: ReactNode | null;
  prompts: ReadonlyArray<PromptSpatial>;
  vide: { titre: string; texte: ReactNode };
}

export function Prompts(p: PropsPrompts) {
  const { toast } = useSpatial();
  const [cat, setCat] = useState(p.categories[0]?.cle ?? '');
  const liste = useMemo(() => p.prompts.filter((x) => !cat || x.categorie === cat), [p.prompts, cat]);

  async function copier(x: PromptSpatial) {
    try {
      await navigator.clipboard.writeText(x.morceaux.map((m) => (m.variable ? `[${m.texte}]` : m.texte)).join(''));
      toast('Prompt copié');
    } catch {
      toast('Copie impossible dans ce navigateur · sélectionne le texte à la main.');
    }
  }

  return (
    <Vue>
      <EnTete titre="Prompts conseillés" sous="Des points de départ testés pour tes projets" />
      <SousNav items={p.sousNav} actif="/studio/prompts" />
      {p.categories.length > 0 && (
        <div className="pcats" role="group" aria-label="Catégories">
          {p.categories.map((c) => (
            <button key={c.cle} type="button" className="chip" data-pcat={c.cle} aria-pressed={cat === c.cle} onClick={() => setCat(c.cle)}>
              {c.libelle}{c.bientot && <>{' '}<span className="v2">Bientôt</span></>}
            </button>
          ))}
        </div>
      )}
      {p.contexte && <div className="banner"><span className="orb" style={{ width: 32, height: 32, fontSize: '12.5px' }}>J</span><span>{p.contexte}</span></div>}
      {liste.length === 0 ? <TuileVide titre={p.vide.titre} texte={p.vide.texte} /> : (
        <div className="grid2">
          {liste.map((x) => (
            <article className="tile prompt" key={x.id}>
              <div className="kc">{x.pastilles.map((t) => <span key={t.libelle} className={`pill ${t.classe}`.trim()}>{t.libelle}</span>)}</div>
              <h3>{x.titre}</h3>
              <p className="muted" style={{ fontSize: 13 }}>{x.description}</p>
              <div className="ptxt">{x.morceaux.map((m, i) => (m.variable ? <span className="var" key={i}>{m.texte}</span> : <Fragment key={i}>{m.texte}</Fragment>))}</div>
              <div className="req"><span>Il faut : {x.requis}</span><span>· S’appuie sur : {x.appui}</span></div>
              <div className="kc">
                <Lien className="btn sm pri" href={x.utiliser}>Utiliser</Lien>
                <button className="btn sm" type="button" onClick={() => void copier(x)}><Ic n="copy" />Copier</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </Vue>
  );
}
