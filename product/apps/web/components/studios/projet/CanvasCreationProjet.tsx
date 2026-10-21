'use client';

import { useRef, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { btnGhost } from '../../ui';
import type { BriefCanonique } from '@tiktrends/core';
import type { JobImageVue } from '../../../lib/studios/image/parcours';
import css from './CanvasCreationProjet.module.css';

/** Projection visuelle de médias déjà livrés. Aucun ajout de calque, génération ou export au clic. */
export function CanvasCreationProjet({ brief, produit, jobs, erreur, graphe, editeurHref, preparationHref }: {
  brief: BriefCanonique | null; produit: string | null; jobs: JobImageVue[];
  erreur?: string | null; graphe: ReactNode; editeurHref?: string | null; preparationHref?: string | null;
}) {
  const router = useRouter();
  const [actualisation, commencerActualisation] = useTransition();
  const [zoom, setZoom] = useState(100);
  const [selection, setSelection] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const medias = jobs.filter(j => j.etat === 'completed' && j.media);
  const encours = jobs.filter(j => !j.terminal).length;
  const choisie = medias.find(j => j.id === selection);
  const changerZoom = (delta: number) => setZoom(z => Math.min(160, Math.max(50, z + delta)));
  return <section className={css.root} data-canvas-creation>
    <div className={css.board}>
      <header className={css.top}><span>Direction créative → création</span><a href="#conversation-projet">Affiner avec Jarvis</a></header>
      <div className={css.viewport} ref={viewport} tabIndex={0} aria-label="Canvas des créations · défilement horizontal et vertical" onPointerDown={e => {
        if ((e.target as HTMLElement).closest('button,a,summary') || e.pointerType === 'touch' || e.button !== 0) return;
        drag.current = { x: e.clientX, y: e.clientY, left: e.currentTarget.scrollLeft, top: e.currentTarget.scrollTop };
        e.currentTarget.setPointerCapture(e.pointerId);
      }} onPointerMove={e => { const d = drag.current; if (d) { e.currentTarget.scrollLeft = d.left - e.clientX + d.x; e.currentTarget.scrollTop = d.top - e.clientY + d.y; } }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <div className={css.world}>
          <details className={css.direction} open>
            <summary>Direction du projet</summary>
            <h3>{brief?.concept || brief?.angle || 'Votre direction'}</h3>
            <p>{brief?.composition || brief?.objective || 'Précisez votre intention avec Jarvis.'}</p>
            {brief?.styleIntent && <p className={css.style}>{brief.styleIntent}</p>}
            <dl>{produit && <div><dt>Produit</dt><dd>{produit}</dd></div>}{!!brief?.formats.length && <div><dt>Formats du brief</dt><dd>{brief.formats.join(' · ')}</dd></div>}</dl>
            <a href="#conversation-projet">Ajuster avec Jarvis</a>
          </details>
          <span className={css.arrow} aria-hidden="true">→</span>
          {medias.map((j, i) => {
            const m = j.media!;
            const ratio = m.largeur && m.hauteur ? m.largeur / m.hauteur : null;
            return <figure key={j.id} className={css.creation} style={{ width: (ratio && ratio < .7 ? 220 : 280) * zoom / 100 }}>
              <figcaption><span>Création {i + 1}</span><span>{m.largeur && m.hauteur ? `${m.largeur} × ${m.hauteur}` : 'Image'}</span></figcaption>
              <button type="button" className={css.artboard} aria-label={`Sélectionner la création ${i + 1}`} aria-pressed={selection === j.id} onClick={() => setSelection(j.id)} style={ratio ? { aspectRatio: ratio } : undefined}>
                <img src={m.url} alt={`Création ${i + 1} du projet`} loading="lazy" />
              </button>
              <p>{j.libelleQualite}</p>
            </figure>;
          })}
          {!medias.length && <div className={css.empty} role="status"><strong>{encours ? 'Création en cours' : 'Votre prochaine création'}</strong><p>{encours ? 'Consultez son état dans Créations, puis actualisez ce canvas pour voir le résultat livré.' : 'Après génération, actualisez ce canvas pour afficher vos images.'}</p>{preparationHref && !encours && <Link href={preparationHref}>Préparer une image</Link>}</div>}
        </div>
      </div>
      <div className={css.tools} aria-label="Affichage du canvas"><button type="button" aria-label="Réduire le zoom" disabled={zoom <= 50} onClick={() => changerZoom(-10)}>−</button><button type="button" aria-label="Réinitialiser le zoom" onClick={() => { setZoom(100); viewport.current?.scrollTo({ left: 0, top: 0 }); }}>{zoom} %</button><button type="button" aria-label="Agrandir le zoom" disabled={zoom >= 160} onClick={() => changerZoom(10)}>+</button>{editeurHref && <Link href={editeurHref}>Ouvrir l’éditeur</Link>}</div>
    </div>
    <div className={css.selection}><button type="button" style={btnGhost} disabled={actualisation} onClick={() => commencerActualisation(() => router.refresh())}>{actualisation ? 'Actualisation…' : 'Actualiser les créations'}</button>{actualisation && <span role="status">Lecture des dernières créations…</span>}</div>
    {erreur && <p role="alert" className={css.message}>{erreur}</p>}
    {choisie?.media && <div className={css.selection} role="status"><span>Création {medias.indexOf(choisie) + 1} sélectionnée · {choisie.libelleQualite}</span><a href={choisie.media.url} target="_blank" rel="noopener noreferrer">Ouvrir l’image</a></div>}
    {!!medias.length && <p className={css.caption}>Créations récentes du projet · toutes versions. Glissez le fond pour vous déplacer.</p>}
    <details className={css.details}><summary>Structure et dépendances du projet</summary>{graphe}</details>
  </section>;
}
