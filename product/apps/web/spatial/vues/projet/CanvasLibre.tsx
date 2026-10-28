'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent, type PointerEvent as PointerEventReact } from 'react';
import {
  GRAND_PAS_CLAVIER_CANVAS, LIBELLES_ETAPE_CANVAS, LIBELLES_NATURE_CANVAS, LIBELLE_MEDIA_CARTE, PAS_CLAVIER_CANVAS, PAS_ZOOM_CANVAS,
  aideCanevasLibre, annonceDeplacement, composerCanvas, descendantsDeCarte, entreesDeCarte, etatInitialCanvas, messageEnregistrementLibre, phraseAvalCarte, texteZoneLibre,
  positionCarte, reduireCanvas, sortiesDeCarte,
  type CarteCanvas, type CibleJarvisNoeud, type DispositionCanvas, type EtatCanvas, type GesteCanvas, type ResultatEnregistrementLibre, type TailleCanvas,
} from '@tiktrends/core';
import { enregistrerDispositionCanvas, reinitialiserDispositionCanvas } from '../../../app/actions/studios/canvas';
import type { CanevasLibre } from './types';

/**
 * Le canvas LIBRE de la fiche projet · porté de la fiche V5 (`CanvasMetier`),
 * composé des classes de la maquette (`board`, `btool`, `chip`, `node`,
 * `tile`, `pill`). Mêmes cartes (dérivées du contenu de la version), mêmes
 * liens, même réducteur de gestes (`reduireCanvas`), même STOCKAGE
 * (`enregistrerDispositionCanvas` / `reinitialiserDispositionCanvas`) · une
 * disposition déjà rangée dans la V5 est relue telle quelle.
 *
 *  · Seuls deux gestes écrivent, et seulement la disposition PERSONNELLE ·
 *    déplacer une carte (glisser, flèches, boutons du détail), réinitialiser.
 *    Zoomer, ajuster, déplacer la vue, choisir, centrer · rien.
 *  · Clavier · Tab parcourt les cartes, les flèches déplacent la carte qui a
 *    le focus (Maj · grand pas), l'annonce `aria-live` dit où elle est allée ;
 *    sur le fond, + et − zooment, 0 ajuste.
 *  · « Cibler Jarvis » (carte d'un plan, d'une identité ou du brief, version
 *    courante) choisit la cible dans les propositions · rien n'est envoyé.
 */

const TAILLE_DEFAUT: TailleCanvas = { largeur: 860, hauteur: 520 };
const HAUTEUR_ZONE = 560;


export function CanvasLibre({ c, cibler }: { c: CanevasLibre; cibler: (cible: CibleJarvisNoeud) => void }) {
  // Même projection que la V5 · une carte avec aperçu est plus haute. La disposition automatique en dépend.
  const modele = useMemo(() => ({ ...c.modele, dimensions: Object.fromEntries(c.modele.cartes.map((k) => [k.id, { w: 220, h: c.apercus[k.id] ? 340 : 160 }])) }), [c.modele, c.apercus]);
  const reduire = useMemo(() => (e: EtatCanvas, g: GesteCanvas) => reduireCanvas(modele, e, g).etat, [modele]);
  const [etat, envoyer] = useReducer(reduire, c.disposition, (d: DispositionCanvas) => etatInitialCanvas(d, 'canvas'));
  const etatRef = useRef(etat);
  etatRef.current = etat;

  const zone = useRef<HTMLDivElement>(null);
  const taille = useRef<TailleCanvas>(TAILLE_DEFAUT);
  const rev = useRef(c.rev);
  const enCours = useRef<Promise<void> | null>(null);
  const enAttente = useRef<{ d: DispositionCanvas; reinit: boolean } | null>(null);
  // La zone `aria-live` · l'annonce d'un déplacement au clavier, puis le retour de l'enregistrement.
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [retour, setRetour] = useState<{ ton: 'ok' | 'err'; texte: string } | null>(null);
  const [glisse, setGlisse] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const geste = useRef<{ type: 'carte' | 'fond'; id?: string; x: number; y: number; bouge: boolean; pointeur: number } | null>(null);

  const compose = useMemo(() => composerCanvas(modele, etat.disposition), [modele, etat.disposition]);
  const parId = useMemo(() => new Map(compose.cartes.map((k) => [k.id, k])), [compose]);
  const choisie = etat.selection ? modele.cartes.find((k) => k.id === etat.selection) ?? null : null;
  const deplacees = Object.keys(etat.disposition.positions).filter((id) => modele.grille[id]).length;


  /* ── Écriture · uniquement depuis un geste qui la demande (file, une à la fois) ── */
  const enregistrer = useCallback((d: DispositionCanvas, reinit: boolean) => {
    enAttente.current = { d, reinit };
    if (enCours.current) return;
    const suivant = async (): Promise<void> => {
      const job = enAttente.current;
      enAttente.current = null;
      if (!job) return;
      let r: ResultatEnregistrementLibre;
      try {
        const rep = job.reinit
          ? await reinitialiserDispositionCanvas({ projectId: c.projectId, rev: rev.current })
          : await enregistrerDispositionCanvas({ projectId: c.projectId, disposition: job.d, rev: rev.current });
        if (rep.ok) { rev.current = rep.rev; r = { ok: true, reinitialise: job.reinit }; }
        else r = { ok: false, conflit: rep.code === 'VERSION_CONFLICT', message: rep.message };
      } catch {
        r = { ok: false, coupure: true };
      }
      setRetour(messageEnregistrementLibre(r));
      // Conflit · on n'écrase rien, la file s'arrête (recharger reprend la plus récente).
      if (!r.ok && 'conflit' in r && r.conflit) { enAttente.current = null; return; }
      if (enAttente.current) await suivant();
    };
    enCours.current = suivant().finally(() => { enCours.current = null; });
  }, [c.projectId]);

  const agir = useCallback((g: GesteCanvas) => {
    const r = reduireCanvas(modele, etatRef.current, g);
    envoyer(g);
    if (r.aEnregistrer) { setAnnonce(null); setRetour(null); }
    if (r.aEnregistrer) enregistrer(r.aEnregistrer, g.type === 'reinitialiser');
    return r;
  }, [modele, enregistrer]);

  const mesurer = useCallback((): TailleCanvas => {
    const z = zone.current;
    if (z && z.clientWidth > 0) taille.current = { largeur: z.clientWidth, hauteur: z.clientHeight || HAUTEUR_ZONE };
    return taille.current;
  }, []);
  const centre = () => { const t = mesurer(); return { x: t.largeur / 2, y: t.hauteur / 2 }; };

  // À l'ouverture · la vue s'ajuste à la vraie taille de la zone (lecture seule).
  useEffect(() => { envoyer({ type: 'ouvrir', taille: mesurer() }); }, [mesurer]);

  // Molette · zoom centré sur le pointeur (écouteur non passif · la page ne défile pas).
  useEffect(() => {
    const z = zone.current;
    if (!z) return;
    const surMolette = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = z.getBoundingClientRect();
      envoyer({ type: 'zoomer', facteur: ev.deltaY < 0 ? PAS_ZOOM_CANVAS : 1 / PAS_ZOOM_CANVAS, pointeur: { x: ev.clientX - r.left, y: ev.clientY - r.top } });
    };
    z.addEventListener('wheel', surMolette, { passive: false });
    return () => z.removeEventListener('wheel', surMolette);
  }, []);

  /** Déplacer au clavier ou par les boutons du détail · l'annonce dit où la carte est allée. */
  const deplacer = (k: CarteCanvas, dx: number, dy: number) => {
    const r = agir({ type: 'deplacer', id: k.id, dx, dy });
    if (r.aEnregistrer) setAnnonce(annonceDeplacement(k.titre, dx, dy, positionCarte(modele, r.aEnregistrer, k.id)));
  };

  const surToucheCarte = (ev: KeyboardEvent<HTMLButtonElement>, k: CarteCanvas) => {
    const fleches: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const f = fleches[ev.key];
    if (!f) return;
    ev.preventDefault();
    const pas = ev.shiftKey ? GRAND_PAS_CLAVIER_CANVAS : PAS_CLAVIER_CANVAS;
    deplacer(k, f[0] * pas, f[1] * pas);
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

  const { vue } = etat;
  const lit = choisie ? entreesDeCarte(modele, choisie.id) : [];
  const alimente = choisie ? sortiesDeCarte(modele, choisie.id) : [];
  const aval = choisie ? [...descendantsDeCarte(modele, choisie.id)].map((id) => modele.cartes.find((k) => k.id === id)).filter((k): k is CarteCanvas => !!k) : [];

  return (
    <div data-canvas-libre={c.projectId} data-version={c.version.id}>
      <div className="btool" role="group" aria-label="Affichage du canvas libre">
        <button className="chip" type="button" onClick={() => envoyer({ type: 'ajuster', taille: mesurer() })}>Ajuster</button>
        <button className="chip" type="button" aria-label="Zoom arrière" onClick={() => envoyer({ type: 'zoomer', facteur: 1 / PAS_ZOOM_CANVAS, pointeur: centre() })}>−</button>
        <span className="faint" style={{ minWidth: 44, textAlign: 'center', fontSize: '11.5px', marginLeft: 0 }}>{Math.round(vue.k * 100)} %</span>
        <button className="chip" type="button" aria-label="Zoom avant" onClick={() => envoyer({ type: 'zoomer', facteur: PAS_ZOOM_CANVAS, pointeur: centre() })}>+</button>
        <button className="chip" type="button" disabled={!choisie} onClick={() => choisie && envoyer({ type: 'focaliser', id: choisie.id, taille: mesurer() })}>Centrer la sélection</button>
        <button className="chip" type="button" data-reinitialiser="" disabled={deplacees === 0}
          title={deplacees === 0 ? 'Aucune carte placée à la main' : 'Toutes les cartes reprennent leur place automatique'}
          onClick={() => agir({ type: 'reinitialiser', taille: mesurer() })}>Réinitialiser la disposition</button>
        <span className="faint" style={{ marginLeft: 'auto', fontSize: '11.5px' }}>{aideCanevasLibre(modele.cartes.length, deplacees)}</span>
      </div>
      <p role="status" aria-live="polite" data-canvas-message={retour?.ton ?? (annonce ? 'info' : '')} className="faint" style={{ fontSize: '12px', margin: '0 0 10px', minHeight: 16 }}>
        {texteZoneLibre(annonce, retour)}
      </p>

      <div ref={zone} data-canvas-zone="" role="group" tabIndex={0} aria-label="Zone du canvas libre" aria-describedby="canvas-libre-aide"
        onKeyDown={surToucheZone}
        onPointerDown={(ev) => { if (ev.target === ev.currentTarget || (ev.target as HTMLElement).dataset?.fondCanvas !== undefined) debut(ev, 'fond'); }}
        onPointerMove={bouger} onPointerUp={fin} onPointerCancel={() => { geste.current = null; setGlisse(null); }}
        style={{ position: 'relative', overflow: 'hidden', height: `min(${HAUTEUR_ZONE}px, 70vh)`, touchAction: 'none', cursor: 'grab', borderRadius: 22 }}>
        <div data-fond-canvas="" style={{ position: 'absolute', inset: 0 }} />
        <div data-monde-canvas="" style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${vue.x}px, ${vue.y}px) scale(${vue.k})` }}>
          <svg aria-hidden="true" focusable="false" data-liens-canvas=""
            style={{ position: 'absolute', left: compose.bornes.x - 200, top: compose.bornes.y - 200, overflow: 'visible', pointerEvents: 'none' }}
            width={compose.bornes.w + 400} height={compose.bornes.h + 400} viewBox={`${compose.bornes.x - 200} ${compose.bornes.y - 200} ${compose.bornes.w + 400} ${compose.bornes.h + 400}`}>
            {compose.routes.map((r) => {
              const actif = etat.selection !== null && (r.de === etat.selection || r.vers === etat.selection);
              const decal = (id: string) => (glisse && glisse.id === id ? glisse : { dx: 0, dy: 0 });
              const pts = r.points.map((p, i) => {
                const d = i === 0 ? decal(r.de) : i === r.points.length - 1 ? decal(r.vers) : { dx: 0, dy: 0 };
                return `${p.x + d.dx},${p.y + d.dy}`;
              });
              return (
                <polyline key={`${r.de}>${r.vers}`} data-lien={`${r.de}>${r.vers}`} points={pts.join(' ')} fill="none"
                  style={{ stroke: actif ? 'var(--chg)' : 'var(--fg3)', opacity: actif ? 1 : 0.6 }} strokeWidth={actif ? 2.5 : 1.5}
                  strokeDasharray={r.libre ? '6 4' : undefined} />
              );
            })}
          </svg>
          {modele.cartes.map((k) => {
            const p = parId.get(k.id)!;
            const g = glisse && glisse.id === k.id ? glisse : null;
            const sel = etat.selection === k.id;
            const media = LIBELLE_MEDIA_CARTE[k.media];
            return (
              <button key={k.id} type="button" className={`node${sel ? ' sel' : ''}`} data-carte={k.id} aria-pressed={sel}
                data-x={Math.round(p.x)} data-y={Math.round(p.y)}
                aria-label={`${k.titre} · ${LIBELLES_NATURE_CANVAS[k.nature]}${media ? ` · ${media}` : ''}`}
                onClick={() => { if (!glisse) envoyer({ type: 'selectionner', id: k.id }); }}
                onKeyDown={(ev) => surToucheCarte(ev, k)}
                onPointerDown={(ev) => { ev.stopPropagation(); debut(ev, 'carte', k.id); }}
                onPointerMove={bouger} onPointerUp={fin}
                style={{ position: 'absolute', left: p.x + (g?.dx ?? 0), top: p.y + (g?.dy ?? 0), width: p.w, height: p.h, overflow: 'hidden', alignContent: 'start', textAlign: 'left', touchAction: 'none', cursor: 'grab' }}>
                <span className="k">{LIBELLES_NATURE_CANVAS[k.nature].toUpperCase()} · {LIBELLES_ETAPE_CANVAS[k.etape].toUpperCase()}</span>
                <strong>{k.titre}</strong>
                {c.apercus[k.id]
                  ? <img src={c.apercus[k.id]} alt={`Aperçu · ${k.titre}`} draggable={false} loading="lazy" style={{ display: 'block', width: '100%', aspectRatio: '4 / 5', maxHeight: 230, borderRadius: 12, objectFit: 'cover', pointerEvents: 'none' }} />
                  : <span>{k.resume}</span>}
                {media && <span className="faint" style={{ marginLeft: 0 }}>{media}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <p id="canvas-libre-aide" className="faint" style={{ fontSize: '11.5px', margin: '10px 0 0' }}>
        Déplacer une carte range ta vue · ni l’ordre, ni les dépendances, ni la version ne changent. Clavier · Tab parcourt les cartes, les flèches déplacent la carte (Maj · grand pas) ; sur le fond, + et − zooment, 0 ajuste.
      </p>

      {choisie && (
        <div className="tile" data-detail-carte={choisie.id} style={{ marginTop: 12 }}>
          <div className="sech" style={{ margin: 0 }}>
            <h2>{choisie.titre}</h2>
            <span className="pill">{LIBELLES_NATURE_CANVAS[choisie.nature]} · {LIBELLES_ETAPE_CANVAS[choisie.etape]}</span>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '12.5px' }}>{choisie.resume}</p>
          {[{ titre: 'Lit', cartes: lit, vide: 'Aucune dépendance · c’est un point de départ.' }, { titre: 'Alimente', cartes: alimente, vide: 'Rien ne la lit.' }].map((b) => (
            <div key={b.titre} data-liste={b.titre}>
              <span className="faint" style={{ fontSize: '11.5px', marginLeft: 0 }}>{b.titre}</span>
              {b.cartes.length === 0
                ? <p className="faint" style={{ margin: '4px 0 0', fontSize: '12px', marginLeft: 0 }}>{b.vide}</p>
                : <div className="chips" style={{ marginTop: 6 }}>{b.cartes.map((x) => (
                  <button key={x.id} className="chip" type="button" onClick={() => envoyer({ type: 'focaliser', id: x.id, taille: mesurer() })}>{x.titre}</button>
                ))}</div>}
            </div>
          ))}
          <p className="faint" style={{ margin: 0, fontSize: '12px', marginLeft: 0 }}>{phraseAvalCarte(aval)}</p>
          <div className="chips" style={{ marginTop: 0 }}>
            {choisie.cibleJarvis && c.version.courante && (
              <button className="pill c" type="button" data-cibler-jarvis={choisie.cibleJarvis} title="Choisit cette cible dans les propositions · rien n’est envoyé"
                onClick={() => cibler({ cible: choisie.cibleJarvis!, libelle: choisie.libelleCibleJarvis ?? choisie.titre })}>Cibler Jarvis · {choisie.libelleCibleJarvis}</button>
            )}
            <span role="group" aria-label={`Déplacer ${choisie.titre}`} style={{ display: 'inline-flex', gap: 6 }}>
              <button className="chip" type="button" aria-label="Déplacer à gauche" onClick={() => deplacer(choisie, -GRAND_PAS_CLAVIER_CANVAS, 0)}>←</button>
              <button className="chip" type="button" aria-label="Déplacer vers le haut" onClick={() => deplacer(choisie, 0, -GRAND_PAS_CLAVIER_CANVAS)}>↑</button>
              <button className="chip" type="button" aria-label="Déplacer vers le bas" onClick={() => deplacer(choisie, 0, GRAND_PAS_CLAVIER_CANVAS)}>↓</button>
              <button className="chip" type="button" aria-label="Déplacer à droite" onClick={() => deplacer(choisie, GRAND_PAS_CLAVIER_CANVAS, 0)}>→</button>
            </span>
          </div>
          {choisie.cibleJarvis && !c.version.courante && (
            <p className="faint" style={{ margin: 0, fontSize: '12px', marginLeft: 0 }}>Cible Jarvis · {choisie.libelleCibleJarvis}. Jarvis propose sur la version courante · ouvre-la pour lui demander une proposition.</p>
          )}
        </div>
      )}
    </div>
  );
}
