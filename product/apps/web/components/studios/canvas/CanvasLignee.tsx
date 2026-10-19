'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type PointerEvent as PointerEventReact } from 'react';
import {
  composerCanvas, etatInitialCanvas, reduireCanvas, ligneeVersCanvas,
  dispositionVide, LIBELLES_TYPE_LIGNEE, LIBELLES_CATEGORIE_LIGNEE, NATURE_LIGNEE, PAS_ZOOM_CANVAS,
  type EtatCanvas, type GesteCanvas, type ModeleCanvas, type ModeleLignee, type NoeudLignee, type TailleCanvas,
} from '@tiktrends/core';
import { bouton, boutonActif, desactive, mini, pastilleNature, rangee, section, styleCarte, texte, titre } from './styles';

/**
 * Canvas de LIGNÉE marketing (V5) · LECTURE SEULE. Il rend la projection de
 * lignée (`projeterLignee`) avec le même moteur que le canvas de production :
 * le réducteur et la composition de `@tiktrends/core` (`vue.ts`,
 * `disposition.ts`), jamais `@xyflow` (qui serait un second moteur).
 *
 *  · Deux vues équivalentes : LISTE (par défaut, et sur mobile) et CANVAS
 *    (proposé d'office sur grand écran). Mêmes nœuds, même ordre, même détail.
 *  · Canvas : ajuster, zoom au pointeur (molette, boutons), déplacer la vue
 *    (glisser le fond), centrer la sélection. AUCUNE écriture : pas de
 *    déplacement de carte, pas de disposition enregistrée, pas d'action payante.
 *  · Chaque nœud montre sa VRAIE donnée et pointe vers sa destination réelle
 *    (lecture) ; le détail dit « Vient de » et « A donné » (liens typés).
 */

export interface PropsLignee {
  projectId: string;
  projet: { id: string; titre: string; marque: string };
  modele: ModeleLignee;
}

const TAILLE_DEFAUT: TailleCanvas = { largeur: 860, hauteur: 520 };
const HAUTEUR_ZONE = 520;

function reducteur(canvas: ModeleCanvas) {
  return (e: EtatCanvas, g: GesteCanvas) => reduireCanvas(canvas, e, g).etat;
}

export function CanvasLignee({ projectId, projet, modele }: PropsLignee) {
  // Adaptation vers `ModeleCanvas` · réutilise le réducteur et la composition.
  const canvas = useMemo(() => ligneeVersCanvas(modele), [modele]);
  const reduire = useMemo(() => reducteur(canvas), [canvas]);
  const [etat, envoyer] = useReducer(reduire, dispositionVide(), (d) => etatInitialCanvas(d, 'liste'));
  const etatRef = useRef(etat);
  etatRef.current = etat;

  const zone = useRef<HTMLDivElement>(null);
  const taille = useRef<TailleCanvas>(TAILLE_DEFAUT);
  const [etroit, setEtroit] = useState(false);
  const geste = useRef<{ x: number; y: number; bouge: boolean; pointeur: number } | null>(null);

  const compose = useMemo(() => composerCanvas(canvas, dispositionVide()), [canvas]);
  const parId = useMemo(() => new Map(modele.noeuds.map((n) => [n.id, n])), [modele]);
  const choisi = etat.selection ? parId.get(etat.selection) ?? null : null;

  const mesurer = useCallback((): TailleCanvas => {
    const z = zone.current;
    if (z && z.clientWidth > 0) taille.current = { largeur: z.clientWidth, hauteur: z.clientHeight || HAUTEUR_ZONE };
    return taille.current;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 719px)');
    setEtroit(mq.matches);
    const surChange = () => setEtroit(mq.matches);
    mq.addEventListener?.('change', surChange);
    // Grand écran et pointeur précis · le canvas d'office. Sinon la liste (consultation).
    if (window.matchMedia('(min-width: 900px) and (pointer: fine)').matches && modele.noeuds.length > 1) {
      envoyer({ type: 'basculer', mode: 'canvas', taille: TAILLE_DEFAUT });
    }
    return () => mq.removeEventListener?.('change', surChange);
  }, [modele.noeuds.length]);

  useEffect(() => {
    if (etat.mode !== 'canvas') return;
    envoyer({ type: 'ouvrir', taille: mesurer() });
  }, [etat.mode, mesurer]);

  useEffect(() => {
    const z = zone.current;
    if (!z || etat.mode !== 'canvas') return;
    const surMolette = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = z.getBoundingClientRect();
      envoyer({ type: 'zoomer', facteur: ev.deltaY < 0 ? PAS_ZOOM_CANVAS : 1 / PAS_ZOOM_CANVAS, pointeur: { x: ev.clientX - r.left, y: ev.clientY - r.top } });
    };
    z.addEventListener('wheel', surMolette, { passive: false });
    return () => z.removeEventListener('wheel', surMolette);
  }, [etat.mode]);

  const centre = () => { const t = mesurer(); return { x: t.largeur / 2, y: t.hauteur / 2 }; };
  const basculer = (mode: 'liste' | 'canvas') => envoyer({ type: 'basculer', mode, taille: mesurer() });
  const choisir = (id: string) => envoyer({ type: 'selectionner', id });

  const debut = (ev: PointerEventReact<HTMLElement>) => {
    if (ev.button !== 0) return;
    geste.current = { x: ev.clientX, y: ev.clientY, bouge: false, pointeur: ev.pointerId };
    try { (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId); } catch { /* jsdom */ }
  };
  const bouger = (ev: PointerEventReact<HTMLElement>) => {
    const g = geste.current;
    if (!g || g.pointeur !== ev.pointerId) return;
    const dx = ev.clientX - g.x; const dy = ev.clientY - g.y;
    if (!g.bouge && Math.hypot(dx, dy) < 4) return;
    g.bouge = true;
    envoyer({ type: 'panoramiquer', dx, dy });
    g.x = ev.clientX; g.y = ev.clientY;
  };
  const fin = () => { geste.current = null; };

  const vide = modele.noeuds.length <= 1;
  const { vue } = etat;
  const placee = new Map(compose.cartes.map((c) => [c.id, c]));

  const detail = choisi ? (
    <DetailLignee modele={modele} noeud={choisi} onChoisir={choisir} />
  ) : <p style={mini}>Choisis un nœud pour voir sa donnée, d’où il vient et ce qu’il a donné.</p>;

  return (
    <section aria-labelledby="canvas-lignee-titre" data-canvas-lignee={projectId} data-vue-lignee={etat.mode} style={section}>
      <div style={{ display: 'grid', gap: 4 }}>
        <h2 id="canvas-lignee-titre" style={titre}>Canvas de lignée · {projet.marque || 'projet'}</h2>
        <p style={mini}>Comment ce projet a avancé · marque, références, brief, hypothèse, direction, créations, résultat, apprentissage, itération. Lecture seule · une flèche va de ce qui précède vers ce qui en découle. Rien n’est modifié ici.</p>
      </div>

      {vide && <p data-etat="vide" style={texte}>Rien à relier pour l’instant · la lignée se remplira dès qu’un brief, des créations ou un test existeront.</p>}

      {!vide && (
        <div role="group" aria-label="Affichage de la lignée" style={rangee}>
          <button type="button" aria-pressed={etat.mode === 'liste'} onClick={() => basculer('liste')} style={{ ...bouton, ...(etat.mode === 'liste' ? boutonActif : {}) }}>Liste</button>
          <button type="button" aria-pressed={etat.mode === 'canvas'} onClick={() => basculer('canvas')} style={{ ...bouton, ...(etat.mode === 'canvas' ? boutonActif : {}) }}>Canvas</button>
          {etat.mode === 'canvas' && (
            <>
              <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', background: 'var(--line)' }} />
              <button type="button" style={bouton} onClick={() => envoyer({ type: 'ajuster', taille: mesurer() })}>Ajuster</button>
              <button type="button" style={bouton} aria-label="Zoom arrière" onClick={() => envoyer({ type: 'zoomer', facteur: 1 / PAS_ZOOM_CANVAS, pointeur: centre() })}>−</button>
              <span style={{ ...mini, minWidth: 44, textAlign: 'center' }}>{Math.round(vue.k * 100)} %</span>
              <button type="button" style={bouton} aria-label="Zoom avant" onClick={() => envoyer({ type: 'zoomer', facteur: PAS_ZOOM_CANVAS, pointeur: centre() })}>+</button>
              <button type="button" style={{ ...bouton, ...(choisi ? {} : desactive) }} disabled={!choisi}
                onClick={() => choisi && envoyer({ type: 'focaliser', id: choisi.id, taille: mesurer() })}>Centrer la sélection</button>
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 520px', minWidth: 0 }}>
          {vide || etat.mode === 'liste' ? (
            <ul data-vue-lignee-liste role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              {modele.noeuds.map((n) => (
                <li key={n.id}>
                  <button type="button" data-noeud={n.id} aria-pressed={etat.selection === n.id} onClick={() => choisir(n.id)}
                    style={{ ...styleCarte(NATURE_LIGNEE[n.type], etat.selection === n.id), width: '100%' }}>
                    <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={pastilleNature}>{LIBELLES_TYPE_LIGNEE[n.type]}</span>
                      {n.badge && <span style={{ ...pastilleNature, borderColor: 'var(--ok)', color: 'var(--ok)' }}>{n.badge}</span>}
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.3 }}>{n.titre}</span>
                    <span style={{ ...mini, fontSize: 12 }}>{n.resume}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div ref={zone} data-lignee-zone role="group" tabIndex={0} aria-label="Zone de la lignée"
              onPointerDown={(ev) => { if (ev.target === ev.currentTarget || (ev.target as HTMLElement).dataset?.fondLignee !== undefined) debut(ev); }}
              onPointerMove={bouger} onPointerUp={fin} onPointerCancel={fin}
              style={{ position: 'relative', overflow: 'hidden', contain: 'paint', height: `min(${HAUTEUR_ZONE}px, 70vh)`, border: '1px solid var(--line)', borderRadius: 12, background: 'var(--rail)', touchAction: 'none', cursor: 'grab' }}>
              <div data-fond-lignee style={{ position: 'absolute', inset: 0 }} />
              <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${vue.x}px, ${vue.y}px) scale(${vue.k})` }}>
                <svg aria-hidden="true" focusable="false" data-liens-lignee
                  style={{ position: 'absolute', left: compose.bornes.x - 200, top: compose.bornes.y - 200, overflow: 'visible', pointerEvents: 'none' }}
                  width={compose.bornes.w + 400} height={compose.bornes.h + 400} viewBox={`${compose.bornes.x - 200} ${compose.bornes.y - 200} ${compose.bornes.w + 400} ${compose.bornes.h + 400}`}>
                  <defs>
                    <marker id="lignee-fleche" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                      <path d="M0,0 L8,4 L0,8 z" style={{ fill: 'var(--muted)' }} />
                    </marker>
                    <marker id="lignee-fleche-active" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                      <path d="M0,0 L8,4 L0,8 z" style={{ fill: 'var(--accent-strong)' }} />
                    </marker>
                  </defs>
                  {compose.routes.map((r) => {
                    const actif = etat.selection !== null && (r.de === etat.selection || r.vers === etat.selection);
                    return (
                      <polyline key={`${r.de}>${r.vers}`} data-lien={`${r.de}>${r.vers}`} points={r.points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none"
                        style={{ stroke: actif ? 'var(--accent-strong)' : 'var(--muted)', opacity: actif ? 1 : 0.55 }} strokeWidth={actif ? 2.5 : 1.5}
                        markerEnd={`url(#${actif ? 'lignee-fleche-active' : 'lignee-fleche'})`} />
                    );
                  })}
                </svg>
                {modele.noeuds.map((n) => {
                  const p = placee.get(n.id)!;
                  const choisie = etat.selection === n.id;
                  return (
                    <button key={n.id} type="button" data-noeud={n.id} aria-pressed={choisie}
                      aria-label={`${n.titre} · ${LIBELLES_TYPE_LIGNEE[n.type]}${n.badge ? ` · ${n.badge}` : ''}`}
                      onClick={() => { if (!geste.current?.bouge) choisir(n.id); }}
                      onPointerDown={(ev) => ev.stopPropagation()}
                      style={{ ...styleCarte(NATURE_LIGNEE[n.type], choisie), position: 'absolute', left: p.x, top: p.y, width: p.w, height: p.h, overflow: 'hidden' }}>
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={pastilleNature}>{LIBELLES_TYPE_LIGNEE[n.type]}</span>
                        {n.badge && <span style={{ ...pastilleNature, borderColor: 'var(--ok)', color: 'var(--ok)' }}>{n.badge}</span>}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{n.titre}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {!etroit && (
          <aside data-lignee-detail aria-label="Détail du nœud" style={{ flex: '1 1 280px', minWidth: 0, display: 'grid', gap: 10, alignContent: 'start' }}>
            {detail}
          </aside>
        )}
      </div>

      {etroit && choisi && <div data-lignee-detail style={{ display: 'grid', gap: 10 }}>{detail}</div>}

      {modele.aVenir.length > 0 && (
        <details style={{ marginTop: 4 }}>
          <summary style={{ ...mini, cursor: 'pointer' }}>À venir sur la lignée · {modele.aVenir.length} élément(s) sans donnée aujourd’hui</summary>
          <ul style={{ ...mini, margin: '6px 0 0', paddingLeft: 18 }}>
            {modele.aVenir.map((a) => <li key={a.element}><strong>{a.element}</strong> · {a.raison}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}

function DetailLignee({ modele, noeud, onChoisir }: { modele: ModeleLignee; noeud: NoeudLignee; onChoisir: (id: string) => void }) {
  const parId = new Map(modele.noeuds.map((n) => [n.id, n]));
  const vientDe = modele.liens.filter((l) => l.vers === noeud.id);
  const aDonne = modele.liens.filter((l) => l.de === noeud.id);
  const ligne = (autreId: string, lien: { categorie: 'contexte' | 'visuel' | 'mesure' | 'iteration'; libelle: string }) => {
    const a = parId.get(autreId);
    return a ? (
      <li key={`${autreId}:${lien.libelle}`}>
        <button type="button" data-aller-noeud={autreId} onClick={() => onChoisir(autreId)} style={{ ...bouton, width: '100%', justifyContent: 'flex-start', textAlign: 'left' }}>
          <span style={{ ...pastilleNature, marginRight: 6 }}>{LIBELLES_CATEGORIE_LIGNEE[lien.categorie]}</span>
          {lien.libelle} · {a.titre}
        </button>
      </li>
    ) : null;
  };
  return (
    <div data-detail-noeud={noeud.id} style={{ ...section, padding: 12, gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={pastilleNature}>{LIBELLES_TYPE_LIGNEE[noeud.type]}</span>
        {noeud.badge && <span style={{ ...pastilleNature, borderColor: 'var(--ok)', color: 'var(--ok)' }}>{noeud.badge}</span>}
      </div>
      <p style={{ ...texte, fontWeight: 600, margin: 0 }}>{noeud.titre}</p>
      <p style={{ ...texte, margin: 0 }}>{noeud.resume}</p>
      {noeud.destination && (
        <a data-destination={noeud.destination} href={noeud.destination} style={{ ...bouton, textDecoration: 'none', justifyContent: 'center' }}>Ouvrir</a>
      )}
      {vientDe.length > 0 && (
        <div>
          <p style={{ ...mini, fontWeight: 700, margin: '4px 0' }}>Vient de</p>
          <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>{vientDe.map((l) => ligne(l.de, l))}</ul>
        </div>
      )}
      {aDonne.length > 0 && (
        <div>
          <p style={{ ...mini, fontWeight: 700, margin: '4px 0' }}>A donné</p>
          <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>{aDonne.map((l) => ligne(l.vers, l))}</ul>
        </div>
      )}
    </div>
  );
}

export default CanvasLignee;
