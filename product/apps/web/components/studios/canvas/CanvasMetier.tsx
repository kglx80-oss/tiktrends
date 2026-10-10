'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent, type PointerEvent as PointerEventReact } from 'react';
import {
  composerCanvas, etatInitialCanvas, reduireCanvas, LIBELLES_NATURE_CANVAS, PAS_CLAVIER_CANVAS, GRAND_PAS_CLAVIER_CANVAS, PAS_ZOOM_CANVAS,
  type CarteCanvas, type DispositionCanvas, type EtatCanvas, type GesteCanvas, type ModeleCanvas, type TailleCanvas,
} from '@tiktrends/core';
import { enregistrerDispositionCanvas, reinitialiserDispositionCanvas } from '../../../app/actions/studios/canvas';
import { Modal } from '../../Modal';
import { tuile } from '../../ui';
import { ciblerJarvis } from './cibler-jarvis';
import { DetailCarte, LIBELLE_MEDIA } from './DetailCarte';
import { ListeCanvas } from './ListeCanvas';
import { bouton, boutonActif, desactive, mini, pastilleNature, rangee, section, styleCarte, texte, titre } from './styles';

/**
 * Canvas métier du projet (cahier 01 §127, UX-04) · cartes reliées par leurs
 * dépendances RÉELLES (dérivées du contenu par le noyau, jamais saisies).
 *
 *  · Deux vues équivalentes : LISTE (par défaut, et toujours sur mobile au
 *    premier rendu) et CANVAS (proposé d'office sur un écran large). Mêmes
 *    cartes, même ordre, même détail, mêmes actions.
 *  · Canvas : ajuster, zoom centré sur le pointeur (molette, boutons, + / −),
 *    déplacer la vue (glisser le fond), centrer la sélection, réinitialiser
 *    la disposition. Une carte se déplace au glisser ou aux flèches une fois
 *    choisie (Maj : grand pas).
 *  · Seuls DEUX gestes écrivent, et seulement la disposition PERSONNELLE :
 *    déplacer une carte, réinitialiser (`reduireCanvas` · `aEnregistrer`).
 *    Consulter, zoomer, ajuster, centrer, choisir, basculer : rien.
 *  · Les liens sont dessinés DANS la zone canvas, rognée (`overflow: hidden`) ;
 *    le détail et le panneau Jarvis sont hors de cette zone · aucun lien ne
 *    peut les traverser.
 */

export interface PropsCanvas {
  projectId: string;
  version: { id: string; n: number; courante: boolean };
  modele: ModeleCanvas;
  disposition: DispositionCanvas;
  rev: number;
}

const TAILLE_DEFAUT: TailleCanvas = { largeur: 860, hauteur: 520 };
const HAUTEUR_ZONE = 520;

type Message = { genre: 'info' | 'erreur'; texte: string } | null;

function reducteur(modele: ModeleCanvas) {
  return (e: EtatCanvas, g: GesteCanvas) => reduireCanvas(modele, e, g).etat;
}

export function CanvasMetier({ projectId, version, modele, disposition, rev: revInitiale }: PropsCanvas) {
  const reduire = useMemo(() => reducteur(modele), [modele]);
  const [etat, envoyer] = useReducer(reduire, disposition, (d) => etatInitialCanvas(d, 'liste'));
  const etatRef = useRef(etat);
  etatRef.current = etat;

  const zone = useRef<HTMLDivElement>(null);
  const taille = useRef<TailleCanvas>(TAILLE_DEFAUT);
  const rev = useRef(revInitiale);
  const enCours = useRef<Promise<void> | null>(null);
  const enAttente = useRef<{ d: DispositionCanvas; reinit: boolean } | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [messageJarvis, setMessageJarvis] = useState<string | null>(null);
  const [etroit, setEtroit] = useState(false);
  const [detailOuvert, setDetailOuvert] = useState(false);
  const [glisse, setGlisse] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const geste = useRef<{ type: 'carte' | 'fond'; id?: string; x: number; y: number; bouge: boolean; pointeur: number } | null>(null);

  const compose = useMemo(() => composerCanvas(modele, etat.disposition), [modele, etat.disposition]);
  const carteChoisie = etat.selection ? modele.cartes.find((c) => c.id === etat.selection) ?? null : null;
  const deplacees = Object.keys(etat.disposition.positions).filter((id) => modele.grille[id]).length;

  /* ── Écriture · uniquement depuis un geste qui la demande ─────────────── */
  const enregistrer = useCallback((d: DispositionCanvas, reinit: boolean) => {
    enAttente.current = { d, reinit };
    if (enCours.current) return;
    const suivant = async (): Promise<void> => {
      const job = enAttente.current;
      enAttente.current = null;
      if (!job) return;
      try {
        const r = job.reinit
          ? await reinitialiserDispositionCanvas({ projectId, rev: rev.current })
          : await enregistrerDispositionCanvas({ projectId, disposition: job.d, rev: rev.current });
        if (r.ok) {
          rev.current = r.rev;
          setMessage({ genre: 'info', texte: job.reinit ? 'Disposition réinitialisée · les cartes ont repris leur place automatique.' : 'Position enregistrée pour toi · l’ordre et les dépendances n’ont pas changé.' });
        } else if (r.code === 'VERSION_CONFLICT') {
          enAttente.current = null;
          setMessage({ genre: 'erreur', texte: `${r.message} Tes positions restent affichées ici.` });
          return;
        } else {
          setMessage({ genre: 'erreur', texte: `Position non enregistrée · ${r.message} Tes positions restent affichées ; réessaie en déplaçant la carte.` });
        }
      } catch {
        setMessage({ genre: 'erreur', texte: 'Position non enregistrée · connexion interrompue. Tes positions restent affichées ; réessaie en déplaçant la carte.' });
      }
      if (enAttente.current) await suivant();
    };
    enCours.current = suivant().finally(() => { enCours.current = null; });
  }, [projectId]);

  const agir = useCallback((g: GesteCanvas) => {
    const r = reduireCanvas(modele, etatRef.current, g);
    envoyer(g);
    if (r.aEnregistrer) enregistrer(r.aEnregistrer, g.type === 'reinitialiser');
  }, [modele, enregistrer]);

  /* ── Mesure de la zone et vue par défaut selon la largeur ─────────────── */
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
    // Écran large et pointeur précis · le canvas d'office. Sinon la liste reste (consultation, rien n'est écrit).
    if (window.matchMedia('(min-width: 900px) and (pointer: fine)').matches && modele.cartes.length > 1) {
      envoyer({ type: 'basculer', mode: 'canvas', taille: TAILLE_DEFAUT });
    }
    return () => mq.removeEventListener?.('change', surChange);
  }, [modele.cartes.length]);

  // Une fois la zone montée, on ajuste à sa vraie taille.
  useEffect(() => {
    if (etat.mode !== 'canvas') return;
    envoyer({ type: 'ouvrir', taille: mesurer() });
  }, [etat.mode, mesurer]);

  // Molette · zoom centré sur le pointeur (écouteur non passif pour garder la page immobile).
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

  /* ── Gestes de l'écran ────────────────────────────────────────────────── */
  // Le dialogue mobile rend lui-même le focus à la carte qui l'a ouvert (usePiegeFocus).
  const choisir = (id: string) => {
    setMessageJarvis(null);
    envoyer({ type: 'selectionner', id });
    if (etroit) setDetailOuvert(true);
  };
  const centre = () => { const t = mesurer(); return { x: t.largeur / 2, y: t.hauteur / 2 }; };
  const basculer = (mode: 'liste' | 'canvas') => envoyer({ type: 'basculer', mode, taille: mesurer() });
  const voirSurCanvas = (id: string) => {
    setDetailOuvert(false);
    if (etatRef.current.mode !== 'canvas') {
      envoyer({ type: 'selectionner', id });
      envoyer({ type: 'basculer', mode: 'canvas', taille: mesurer() });
    } else envoyer({ type: 'focaliser', id, taille: mesurer() });
  };
  const viserJarvis = (c: CarteCanvas) => {
    if (!c.cibleJarvis) return;
    // Sur mobile le détail est un dialogue : il rend le focus à la carte en se
    // fermant · on cible Jarvis APRÈS, sinon le focus quitterait « Ta demande ».
    if (detailOuvert) {
      setDetailOuvert(false);
      window.setTimeout(() => viserJarvisMaintenant(c), 60);
    } else viserJarvisMaintenant(c);
  };
  const viserJarvisMaintenant = (c: CarteCanvas) => {
    if (!c.cibleJarvis) return;
    const fluide = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const r = ciblerJarvis(c.cibleJarvis, document, { fluide });
    setMessageJarvis(r === 'ok'
      ? `Cible « ${c.libelleCibleJarvis} » choisie dans le panneau Jarvis · écris ta demande. Rien n’est envoyé avant ton clic sur « Demander à Jarvis ».`
      : r === 'cible-absente'
        ? `Le panneau Jarvis ne propose pas « ${c.libelleCibleJarvis} » sur la version courante · choisis la cible à la main dans le panneau.`
        : 'Le panneau Jarvis n’est pas disponible ici (lecture seule ou version antérieure) · rien n’a été envoyé.');
  };

  const surToucheCarte = (ev: KeyboardEvent<HTMLButtonElement>, id: string) => {
    const fleches: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const f = fleches[ev.key];
    if (!f || etatRef.current.selection !== id) return;
    ev.preventDefault();
    const pas = ev.shiftKey ? GRAND_PAS_CLAVIER_CANVAS : PAS_CLAVIER_CANVAS;
    agir({ type: 'deplacer', id, dx: f[0] * pas, dy: f[1] * pas });
  };
  const surToucheZone = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.target !== ev.currentTarget) return;
    if (ev.key === '+' || ev.key === '=') { ev.preventDefault(); envoyer({ type: 'zoomer', facteur: PAS_ZOOM_CANVAS, pointeur: centre() }); }
    else if (ev.key === '-') { ev.preventDefault(); envoyer({ type: 'zoomer', facteur: 1 / PAS_ZOOM_CANVAS, pointeur: centre() }); }
    else if (ev.key === '0') { ev.preventDefault(); envoyer({ type: 'ajuster', taille: mesurer() }); }
  };

  const debut = (ev: PointerEventReact<HTMLElement>, type: 'carte' | 'fond', id?: string) => {
    if (ev.button !== 0) return;
    geste.current = { type, id, x: ev.clientX, y: ev.clientY, bouge: false, pointeur: ev.pointerId };
    try { (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId); } catch { /* jsdom, vieux navigateurs */ }
  };
  const bouger = (ev: PointerEventReact<HTMLElement>) => {
    const g = geste.current;
    if (!g || g.pointeur !== ev.pointerId) return;
    const dx = ev.clientX - g.x; const dy = ev.clientY - g.y;
    if (!g.bouge && Math.hypot(dx, dy) < 4) return;
    g.bouge = true;
    if (g.type === 'fond') { envoyer({ type: 'panoramiquer', dx, dy }); g.x = ev.clientX; g.y = ev.clientY; }
    else setGlisse({ id: g.id!, dx: dx / etatRef.current.vue.k, dy: dy / etatRef.current.vue.k });
  };
  const fin = (ev: PointerEventReact<HTMLElement>) => {
    const g = geste.current;
    geste.current = null;
    if (!g || g.pointeur !== ev.pointerId) return;
    if (g.type === 'carte' && g.bouge) {
      const k = etatRef.current.vue.k;
      setGlisse(null);
      agir({ type: 'deplacer', id: g.id!, dx: (ev.clientX - g.x) / k, dy: (ev.clientY - g.y) / k });
    }
  };

  const vide = modele.cartes.length <= 1;
  const { vue } = etat;
  const parId = new Map(compose.cartes.map((c) => [c.id, c]));
  const detail = carteChoisie ? (
    <DetailCarte modele={modele} carte={carteChoisie} mode={etat.mode} versionCourante={version.courante} messageJarvis={messageJarvis}
      onChoisir={(id) => choisir(id)} onCiblerJarvis={viserJarvis} onVoirSurCanvas={voirSurCanvas}
      onDeplacer={(id, dx, dy) => agir({ type: 'deplacer', id, dx, dy })} pas={GRAND_PAS_CLAVIER_CANVAS} />
  ) : null;

  return (
    <section aria-labelledby="canvas-projet-titre" data-canvas-projet={projectId} data-mode={etat.mode} style={section}>
      <div style={{ display: 'grid', gap: 4 }}>
        <h2 id="canvas-projet-titre" style={titre}>Canvas du projet · version {version.n}</h2>
        <p style={mini}>Cartes reliées par leurs dépendances réelles · une flèche va de ce qui est lu vers ce qui le lit. Déplacer une carte range ta vue : ni l’ordre, ni les dépendances, ni la version ne changent.</p>
      </div>

      {vide && (
        <p data-etat="vide" style={texte}>Rien à relier pour l’instant · ajoute des plans (atelier Vidéo) ou une mise en page (Éditer l’image) : leurs sorties apparaîtront ici avec leurs dépendances.</p>
      )}
      {!vide && (
        <div role="group" aria-label="Affichage du canvas" style={rangee}>
          <button type="button" aria-pressed={etat.mode === 'liste'} onClick={() => basculer('liste')} style={{ ...bouton, ...(etat.mode === 'liste' ? boutonActif : {}) }}>Liste</button>
          <button type="button" aria-pressed={etat.mode === 'canvas'} onClick={() => basculer('canvas')} style={{ ...bouton, ...(etat.mode === 'canvas' ? boutonActif : {}) }}>Canvas</button>
          {etat.mode === 'canvas' && (
            <>
              <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', background: 'var(--line)' }} />
              <button type="button" style={bouton} onClick={() => envoyer({ type: 'ajuster', taille: mesurer() })}>Ajuster</button>
              <button type="button" style={bouton} aria-label="Zoom arrière" onClick={() => envoyer({ type: 'zoomer', facteur: 1 / PAS_ZOOM_CANVAS, pointeur: centre() })}>−</button>
              <span style={{ ...mini, minWidth: 44, textAlign: 'center' }}>{Math.round(vue.k * 100)} %</span>
              <button type="button" style={bouton} aria-label="Zoom avant" onClick={() => envoyer({ type: 'zoomer', facteur: PAS_ZOOM_CANVAS, pointeur: centre() })}>+</button>
              <button type="button" style={{ ...bouton, ...(carteChoisie ? {} : desactive) }} disabled={!carteChoisie}
                onClick={() => carteChoisie && envoyer({ type: 'focaliser', id: carteChoisie.id, taille: mesurer() })}>Centrer la sélection</button>
              <button type="button" style={{ ...bouton, ...(deplacees ? {} : desactive) }} disabled={deplacees === 0}
                onClick={() => agir({ type: 'reinitialiser', taille: mesurer() })}>Réinitialiser la disposition</button>
            </>
          )}
        </div>
      )}
      <p role="status" aria-live="polite" data-canvas-message={message?.genre ?? ''} style={{ ...mini, color: message?.genre === 'erreur' ? 'var(--warn)' : 'var(--muted)' }}>
        {message ? `${message.genre === 'erreur' ? 'Attention · ' : ''}${message.texte}` : ''}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 520px', minWidth: 0 }}>
          {vide || etat.mode === 'liste' ? (
            <ListeCanvas modele={modele} selection={etat.selection} onChoisir={(id) => choisir(id)} />
          ) : (
            <>
              <p id="canvas-aide-clavier" style={{ ...mini, marginBottom: 6 }}>
                Tab parcourt les cartes dans l’ordre des étapes · Entrée choisit une carte, puis les flèches la déplacent (Maj : grand pas). Sur le fond : + et − zooment, 0 ajuste. Les mêmes actions existent en boutons.
              </p>
              <div ref={zone} data-canvas-zone role="group" tabIndex={0} aria-label="Zone du canvas" aria-describedby="canvas-aide-clavier"
                onKeyDown={surToucheZone}
                onPointerDown={(ev) => { if (ev.target === ev.currentTarget || (ev.target as HTMLElement).dataset?.fondCanvas !== undefined) debut(ev, 'fond'); }}
                onPointerMove={bouger} onPointerUp={fin} onPointerCancel={() => { geste.current = null; setGlisse(null); }}
                style={{
                  ...tuile, position: 'relative', overflow: 'hidden', contain: 'paint', height: `min(${HAUTEUR_ZONE}px, 70vh)`,
                  background: 'var(--rail)', touchAction: 'none', cursor: 'grab',
                }}>
                <div data-fond-canvas style={{ position: 'absolute', inset: 0 }} />
                <div data-monde-canvas style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${vue.x}px, ${vue.y}px) scale(${vue.k})` }}>
                  <svg aria-hidden="true" focusable="false" data-liens-canvas
                    style={{ position: 'absolute', left: compose.bornes.x - 200, top: compose.bornes.y - 200, overflow: 'visible', pointerEvents: 'none' }}
                    width={compose.bornes.w + 400} height={compose.bornes.h + 400} viewBox={`${compose.bornes.x - 200} ${compose.bornes.y - 200} ${compose.bornes.w + 400} ${compose.bornes.h + 400}`}>
                    <defs>
                      <marker id="canvas-fleche" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                        <path d="M0,0 L8,4 L0,8 z" style={{ fill: 'var(--muted)' }} />
                      </marker>
                      <marker id="canvas-fleche-active" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                        <path d="M0,0 L8,4 L0,8 z" style={{ fill: 'var(--accent-strong)' }} />
                      </marker>
                    </defs>
                    {compose.routes.map((r) => {
                      const actif = etat.selection !== null && (r.de === etat.selection || r.vers === etat.selection);
                      const decal = (id: string) => (glisse && glisse.id === id ? glisse : { dx: 0, dy: 0 });
                      const pts = r.points.map((p, i) => {
                        const d = i === 0 ? decal(r.de) : i === r.points.length - 1 ? decal(r.vers) : { dx: 0, dy: 0 };
                        return `${p.x + d.dx},${p.y + d.dy}`;
                      });
                      return (
                        <polyline key={`${r.de}>${r.vers}`} data-lien={`${r.de}>${r.vers}`} points={pts.join(' ')} fill="none"
                          style={{ stroke: actif ? 'var(--accent-strong)' : 'var(--muted)', opacity: actif ? 1 : 0.55 }} strokeWidth={actif ? 2.5 : 1.5}
                          strokeDasharray={r.libre ? '6 4' : undefined} markerEnd={`url(#${actif ? 'canvas-fleche-active' : 'canvas-fleche'})`} />
                      );
                    })}
                  </svg>
                  {modele.cartes.map((c) => {
                    const p = parId.get(c.id)!;
                    const g = glisse && glisse.id === c.id ? glisse : null;
                    const choisie = etat.selection === c.id;
                    const media = LIBELLE_MEDIA[c.media];
                    return (
                      <button key={c.id} type="button" data-carte={c.id} aria-pressed={choisie}
                        aria-label={`${c.titre} · ${LIBELLES_NATURE_CANVAS[c.nature]}${media ? ` · ${media}` : ''}`}
                        onClick={() => { if (!glisse) choisir(c.id); }}
                        onKeyDown={(ev) => surToucheCarte(ev, c.id)}
                        onPointerDown={(ev) => { ev.stopPropagation(); debut(ev, 'carte', c.id); }}
                        onPointerMove={bouger} onPointerUp={fin}
                        style={{
                          ...styleCarte(c.nature, choisie), position: 'absolute', left: p.x + (g?.dx ?? 0), top: p.y + (g?.dy ?? 0), width: p.w, height: p.h,
                          overflow: 'hidden', touchAction: 'none',
                        }}>
                        <span style={pastilleNature}>{LIBELLES_NATURE_CANVAS[c.nature]}</span>
                        <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{c.titre}</span>
                        {media && <span style={{ ...mini, fontSize: 12 }}>{media}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {!etroit && (
          <aside data-canvas-detail aria-label="Détail de la carte" style={{ flex: '1 1 280px', minWidth: 0, display: 'grid', gap: 10, alignContent: 'start' }}>
            {detail ?? <p style={mini}>Choisis une carte pour voir ce qu’elle lit, ce qu’elle alimente, et la cibler dans Jarvis.</p>}
          </aside>
        )}
      </div>

      {/* Mobile · le détail en panneau refermable (focus piégé puis rendu à la carte). */}
      {etroit && (
        <Modal open={detailOuvert && !!carteChoisie} onClose={() => setDetailOuvert(false)} title={carteChoisie?.titre ?? 'Détail'} maxWidth={560}>
          {detail}
        </Modal>
      )}
      {etroit && !detailOuvert && messageJarvis && <p role="status" style={mini}>{messageJarvis}</p>}
    </section>
  );
}
