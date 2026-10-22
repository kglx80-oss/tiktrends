'use client';
import { useEffect, useState, type ReactNode } from 'react';
import css from './EspaceProjet.module.css';

const ONGLETS = [{ id: 'brief', titre: 'Brief & références' }, { id: 'canvas', titre: 'Canvas' }, { id: 'creations', titre: 'Créations' }] as const;
type Onglet = typeof ONGLETS[number]['id'];
/** Les slots conservent leurs actions et gardes. Changer d'onglet ne produit rien. */
export function EspaceProjet({ entete, brief, canvas, conversation, creations, lignee }: { entete: ReactNode; brief: ReactNode; canvas: ReactNode; conversation: ReactNode; creations: ReactNode; lignee: ReactNode }) {
  const [onglet, setOnglet] = useState<Onglet>('canvas');
  useEffect(() => {
    function ancre() {
      const hash = window.location.hash;
      if (hash === '#titre-variantes' || hash === '#taches-projet') setOnglet('creations');
      if (hash === '#conversation-projet' || hash === '#canvas-projet-titre') setOnglet('canvas');
    }
    ancre(); window.addEventListener('hashchange', ancre);
    return () => window.removeEventListener('hashchange', ancre);
  }, []);
  return <div className={css.workspace} onClickCapture={e => {
    const lien = (e.target as HTMLElement).closest('a');
    const hash = lien?.getAttribute('href');
    if (hash === '#conversation-projet' || hash === '#canvas-projet-titre') setOnglet('canvas');
    else if (hash === '#titre-variantes' || hash === '#taches-projet') setOnglet('creations');
    else return;
    requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView?.({ block: 'start' }));
  }}>
    {entete}
    <div className={css.tabs} role="tablist" aria-label="Projet">{ONGLETS.map((o, i) => <button key={o.id} id={`projet-tab-${o.id}`} type="button" role="tab" aria-selected={onglet === o.id} aria-controls={`projet-panel-${o.id}`} tabIndex={onglet === o.id ? 0 : -1} onClick={() => setOnglet(o.id)} onKeyDown={e => {
      if (!['ArrowRight','ArrowLeft','Home','End'].includes(e.key)) return;
      e.preventDefault(); const prochain = e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (i + (e.key === 'ArrowRight' ? 1 : -1) + 3) % 3;
      setOnglet(ONGLETS[prochain]!.id); document.getElementById(`projet-tab-${ONGLETS[prochain]!.id}`)?.focus();
    }}>{o.titre}</button>)}</div>
    <div role="tabpanel" id="projet-panel-brief" aria-labelledby="projet-tab-brief" hidden={onglet !== 'brief'} className={css.panel}>{brief}</div>
    <div role="tabpanel" id="projet-panel-canvas" aria-labelledby="projet-tab-canvas" hidden={onglet !== 'canvas'} className={css.panel}>
      <div className={css.editor}><div className={css.board}>{canvas || <p>Le canvas n’est pas disponible pour cette version. Le brief et les créations restent accessibles.</p>}</div><aside id="conversation-projet" className={css.jarvis} aria-label="Jarvis dans ce projet"><header><h2>Jarvis</h2><span>Dans ce projet</span></header>{conversation}</aside></div>
      {lignee && <details className={css.lineage}><summary>Origine des créations et variantes</summary>{lignee}</details>}
    </div>
    <div role="tabpanel" id="projet-panel-creations" aria-labelledby="projet-tab-creations" hidden={onglet !== 'creations'} className={css.panel}>{creations}</div>
  </div>;
}
