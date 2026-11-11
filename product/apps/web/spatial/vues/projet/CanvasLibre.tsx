'use client';

import { Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent, type PointerEvent as PointerEventReact } from 'react';
import {
  GRAND_PAS_CLAVIER_CANVAS, LEGENDE_VIDE, LIBELLES_ETAPE_CANVAS, LIBELLES_NATURE_CANVAS, LIBELLE_MEDIA_CARTE, PAS_CLAVIER_CANVAS, PAS_ZOOM_CANVAS, SANS_ECRAN_NOEUD, STYLE_LIEN_LIGNEE,
  aideCanevasLibre, annonceDeplacement, cadresLignee, categorieLienLignee, composerCanvas, descendantsDeCarte, dimensionsLignee, dispositionApresReinitialisation, entreesDeCarte, etatInitialCanvas, etiquetteCarteLignee,
  legendeLignee, ligneeEnListe, ligneeVersCanvas, messageEnregistrementLibre, miniCarteLignee, phraseAvalCarte, phraseLegende, phraseLiens, rechercheGraphe, texteZoneLibre,
  notesOuvertes, phraseIndicateurNotes, positionCarte, reduireCanvas, repartirNotes, sortiesDeCarte,
  type CarteCanvas, type CibleJarvisNoeud, type DispositionCanvas, type EtatCanvas, type GesteCanvas, type GrapheLibre, type ResultatEnregistrementLibre, type TailleCanvas,
} from '@tiktrends/core';
import { enregistrerDispositionCanvas, reinitialiserDispositionCanvas } from '../../../app/actions/studios/canvas';
import { Ic, Lien } from '../../communs';
import { ErreurNotes, NotesNoeud, NotesSansNoeud, useNotesLignee } from './NotesLignee';
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
 *
 * Lot 11 V5 · DEUX graphes, choisis dans la barre (`?graphe=lignee`) · la
 * PRODUCTION de la version (par défaut, inchangée) et la LIGNÉE du projet
 * (`projeterLignee` · brief, hypothèse, direction, lots, créations, résultats,
 * lots de test, apprentissages, itérations). La lignée porte en plus, tout
 * CALCULÉ · les cadres des groupes de lot, la légende des catégories de liens
 * (seules celles qui existent en données), une mini-carte DÉCORATIVE
 * (`aria-hidden` · se déplacer passe par la vue et la liste) et son équivalent
 * EN LISTE (lecteur d'écran, clavier) · chaque nœud y ouvre son écran existant.
 * Aucun nœud ni lien ne s'ajoute à la main · seules les positions
 * s'enregistrent, dans la même disposition personnelle (identifiants disjoints) ·
 * « Réinitialiser » ne remet en place que le graphe affiché.
 *
 * PC E11 · les NOTES de la lignée (`NotesLignee.tsx`) · une note est attachée à
 * UN nœud (sa clé stable), jamais à un lien ni libre · un indicateur sur la
 * carte (notes OUVERTES, `notesOuvertes`) est un bouton qui choisit le nœud et
 * porte le focus sur ses notes · le détail du nœud et chaque nœud de la liste
 * les montrent avec leurs gestes · « Notes sans nœud » garde lisibles celles
 * dont la donnée a disparu. Aucune carte ni aucun trait ne s'ajoute.
 */

const TAILLE_DEFAUT: TailleCanvas = { largeur: 860, hauteur: 520 };
const HAUTEUR_ZONE = 560;


export function CanvasLibre({ c, cibler }: { c: CanevasLibre; cibler: (cible: CibleJarvisNoeud) => void }) {
  const lignee = c.lignee ?? null;
  const [graphe, setGraphe] = useState<GrapheLibre>(lignee && c.grapheInitial === 'lignee' ? 'lignee' : 'production');
  const enLignee = graphe === 'lignee' && lignee !== null;
  // Même projection que la V5 · une carte avec aperçu est plus haute. La disposition automatique en dépend.
  const modeleProduction = useMemo(() => dimensionsLignee(c.modele, c.apercus), [c.modele, c.apercus]);
  const modeleLignee = useMemo(() => (lignee ? dimensionsLignee(ligneeVersCanvas(lignee.modele), lignee.apercus) : null), [lignee]);
  const modele = enLignee ? modeleLignee! : modeleProduction;
  const apercus = enLignee ? lignee!.apercus : c.apercus;
  const liste = useMemo(() => (lignee ? ligneeEnListe(lignee.modele, lignee.groupes, lignee.destinations) : []), [lignee]);
  const legende = useMemo(() => (lignee ? legendeLignee(lignee.modele) : []), [lignee]);
  // PC E11 · les notes · rangées sous leur nœud, ou « sans nœud » quand la donnée a disparu.
  const notesCtl = useNotesLignee(c.projectId, lignee?.notes ?? null);
  const notes = useMemo(() => (lignee && notesCtl.vue ? repartirNotes(notesCtl.vue.notes, lignee.modele) : null), [lignee, notesCtl.vue]);
  // « Ouvrir les notes » depuis l'indicateur · le focus va au titre des notes du détail une fois le détail RENDU.
  const [notesAOuvrir, setNotesAOuvrir] = useState<string | null>(null);
  const reduire = useMemo(() => (e: EtatCanvas, g: GesteCanvas) => reduireCanvas(modele, e, g).etat, [modele]);
  const [etat, envoyer] = useReducer(reduire, c.disposition, (d: DispositionCanvas) => etatInitialCanvas(d, 'canvas'));
  const etatRef = useRef(etat);
  etatRef.current = etat;

  const zone = useRef<HTMLDivElement>(null);
  const taille = useRef<TailleCanvas>(TAILLE_DEFAUT);
  const rev = useRef(c.rev);
  const enCours = useRef<Promise<void> | null>(null);
  const enAttente = useRef<{ d: DispositionCanvas; reinit: boolean | 'partiel' } | null>(null);
  // La zone `aria-live` · l'annonce d'un déplacement au clavier, puis le retour de l'enregistrement.
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [retour, setRetour] = useState<{ ton: 'ok' | 'err'; texte: string } | null>(null);
  const [glisse, setGlisse] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const geste = useRef<{ type: 'carte' | 'fond'; id?: string; x: number; y: number; bouge: boolean; pointeur: number } | null>(null);

  const compose = useMemo(() => composerCanvas(modele, etat.disposition), [modele, etat.disposition]);
  const parId = useMemo(() => new Map(compose.cartes.map((k) => [k.id, k])), [compose]);
  const choisie = etat.selection ? modele.cartes.find((k) => k.id === etat.selection) ?? null : null;
  const deplacees = Object.keys(etat.disposition.positions).filter((id) => modele.grille[id]).length;
  useEffect(() => {
    if (!notesAOuvrir || etat.selection !== notesAOuvrir) return;
    setNotesAOuvrir(null);
    document.querySelector<HTMLElement>(`[data-notes-panneau="detail:${notesAOuvrir}"] [data-titre-notes]`)?.focus();
  }, [notesAOuvrir, etat.selection]);


  /* ── Écriture · uniquement depuis un geste qui la demande (file, une à la fois) ── */
  // `reinit` · `true` efface toute la disposition (geste existant), `'partiel'` remet en place le seul graphe affiché (l'autre garde ses positions).
  const enregistrer = useCallback((d: DispositionCanvas, reinit: boolean | 'partiel') => {
    enAttente.current = { d, reinit };
    if (enCours.current) return;
    const suivant = async (): Promise<void> => {
      const job = enAttente.current;
      enAttente.current = null;
      if (!job) return;
      let r: ResultatEnregistrementLibre;
      try {
        const rep = job.reinit === true
          ? await reinitialiserDispositionCanvas({ projectId: c.projectId, rev: rev.current })
          : await enregistrerDispositionCanvas({ projectId: c.projectId, disposition: job.d, rev: rev.current });
        if (rep.ok) { rev.current = rep.rev; r = { ok: true, reinitialise: job.reinit !== false }; }
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

  // À l'ouverture (et à chaque changement de graphe) · la vue s'ajuste à la vraie taille de la zone (lecture seule).
  useEffect(() => { envoyer({ type: 'ouvrir', taille: mesurer() }); }, [mesurer, graphe]);

  /** Changer de graphe · rien n'est écrit · l'adresse le garde (`?graphe=lignee`), l'historique n'est pas allongé. */
  const choisirGraphe = (g: GrapheLibre) => {
    if (g === graphe || (g === 'lignee' && !lignee)) return;
    envoyer({ type: 'selectionner', id: null });
    setGlisse(null);
    setGraphe(g);
    try { window.history.replaceState(window.history.state, '', `${window.location.pathname}${rechercheGraphe(window.location.search, g)}${window.location.hash}`); } catch { /* navigateur sans historique */ }
  };

  /** Réinitialiser · le graphe affiché reprend sa place automatique · l'autre graphe garde ses positions. */
  const reinitialiser = () => {
    const garde = dispositionApresReinitialisation(etatRef.current.disposition, graphe);
    if (!garde) { agir({ type: 'reinitialiser', taille: mesurer() }); return; }
    envoyer({ type: 'remplacer', disposition: garde });
    envoyer({ type: 'ajuster', taille: mesurer() });
    setAnnonce(null); setRetour(null);
    enregistrer(garde, 'partiel');
  };

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
  // Lot 11 · cadres des groupes (boîte des membres POSÉS) et mini-carte · calculés, rien n'est saisi.
  const cadres = useMemo(() => (enLignee ? cadresLignee(lignee!.groupes, new Map(compose.cartes.map((k) => [k.id, k]))) : []), [enLignee, lignee, compose]);
  const groupeDe = useMemo(() => new Map((lignee?.groupes ?? []).map((g) => [g.id, g])), [lignee]);
  const mini = enLignee ? miniCarteLignee({ cartes: compose.cartes, cadres, vue, taille: taille.current }) : null;
  const elementChoisi = enLignee && choisie ? liste.find((x) => x.id === choisie.id) ?? null : null;
  const noeudLignee = useMemo(() => new Map((lignee?.modele.noeuds ?? []).map((n) => [n.id, n])), [lignee]);
  const lit = choisie ? entreesDeCarte(modele, choisie.id) : [];
  const alimente = choisie ? sortiesDeCarte(modele, choisie.id) : [];
  const aval = choisie ? [...descendantsDeCarte(modele, choisie.id)].map((id) => modele.cartes.find((k) => k.id === id)).filter((k): k is CarteCanvas => !!k) : [];

  return (
    <div data-canvas-libre={c.projectId} data-version={c.version.id} data-graphe={enLignee ? 'lignee' : 'production'}>
      <div className="btool" role="group" aria-label="Graphe du canvas libre">
        <button className="chip" type="button" data-graphe-choix="production" aria-pressed={!enLignee} onClick={() => choisirGraphe('production')}
          title="Les sorties de la version et leurs dépendances de calcul">Production</button>
        <button className="chip" type="button" data-graphe-choix="lignee" aria-pressed={enLignee} aria-disabled={!lignee || undefined} aria-describedby={lignee ? undefined : 'canvas-libre-sans-lignee'}
          title={lignee ? 'Brief, hypothèse, lots, créations, résultats, apprentissages, itérations · liens lus dans les données' : undefined}
          onClick={() => choisirGraphe('lignee')}>Lignée</button>
      </div>
      {!lignee && <p id="canvas-libre-sans-lignee" className="faint" data-raison-ferme="lignee" style={{ fontSize: '11.5px', margin: '0 0 10px' }}>La lignée n’est pas disponible · le projet n’a encore que sa marque, ou sa lecture a échoué. Recharge la page pour réessayer.</p>}
      {enLignee && (
        <ul data-legende-lignee="" aria-label="Légende des liens de la lignée" style={{ listStyle: 'none', margin: '0 0 10px', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: '11.5px', color: 'var(--fg2)' }}>
          {legende.length === 0 && <li data-legende-vide="">{LEGENDE_VIDE}</li>}
          {legende.map((e) => (
            <li key={e.categorie} data-legende={e.categorie} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <svg aria-hidden="true" focusable="false" width="28" height="8" viewBox="0 0 28 8"><line x1="1" y1="4" x2="27" y2="4" style={{ stroke: e.couleur }} strokeWidth={2} strokeDasharray={e.tirets ?? undefined} /></svg>
              {phraseLegende(e)}
            </li>
          ))}
        </ul>
      )}
      <div className="btool" role="group" aria-label="Affichage du canvas libre">
        <button className="chip" type="button" onClick={() => envoyer({ type: 'ajuster', taille: mesurer() })}>Ajuster</button>
        <button className="chip" type="button" aria-label="Zoom arrière" onClick={() => envoyer({ type: 'zoomer', facteur: 1 / PAS_ZOOM_CANVAS, pointeur: centre() })}>−</button>
        <span className="faint" style={{ minWidth: 44, textAlign: 'center', fontSize: '11.5px', marginLeft: 0 }}>{Math.round(vue.k * 100)} %</span>
        <button className="chip" type="button" aria-label="Zoom avant" onClick={() => envoyer({ type: 'zoomer', facteur: PAS_ZOOM_CANVAS, pointeur: centre() })}>+</button>
        <button className="chip" type="button" disabled={!choisie} onClick={() => choisie && envoyer({ type: 'focaliser', id: choisie.id, taille: mesurer() })}>Centrer la sélection</button>
        <button className="chip" type="button" data-reinitialiser="" disabled={deplacees === 0}
          title={deplacees === 0 ? 'Aucune carte placée à la main' : 'Les cartes de ce graphe reprennent leur place automatique'}
          onClick={reinitialiser}>Réinitialiser la disposition</button>
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
          {cadres.map(({ id: gid, rect, entete }, i) => {
            const g = groupeDe.get(gid)!;
            return (
              // Le cadre est un repère visuel (`aria-hidden`) · la liste dit les lots, leur contenu et ouvre leur fiche.
              <div key={`${gid}#${i}`} data-cadre-lot={gid} data-nature={g.nature} data-suite={entete ? undefined : ''} aria-hidden="true"
                style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: 18, border: '1px dashed var(--edge)', background: 'var(--glass2)', pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', left: 12, right: 12, top: 3, height: 18, display: 'flex', alignItems: 'center', gap: 6, font: '600 10.5px/18px var(--sf)', color: 'var(--fg2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span style={{ letterSpacing: '.1em', color: 'var(--fg3)' }}>{g.etiquette}</span>
                  <span>{g.titre}</span>
                </div>
              </div>
            );
          })}
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
              // Lignée · le motif et la couleur de la CATÉGORIE (lue dans les données, `legendeLignee`) · jamais un lien sans donnée.
              const cat = enLignee ? categorieLienLignee(lignee!.modele, r.de, r.vers) : null;
              const st = cat ? STYLE_LIEN_LIGNEE[cat] : null;
              return (
                <polyline key={`${r.de}>${r.vers}`} data-lien={`${r.de}>${r.vers}`} data-categorie={cat ?? undefined} points={pts.join(' ')} fill="none"
                  style={{ stroke: st ? st.couleur : actif ? 'var(--chg)' : 'var(--fg3)', opacity: actif ? 1 : st ? 0.85 : 0.6 }} strokeWidth={actif ? 2.5 : 1.5}
                  strokeDasharray={st ? st.tirets ?? undefined : r.libre ? '6 4' : undefined} />
              );
            })}
          </svg>
          {modele.cartes.map((k) => {
            const p = parId.get(k.id)!;
            const g = glisse && glisse.id === k.id ? glisse : null;
            const sel = etat.selection === k.id;
            const media = enLignee ? null : LIBELLE_MEDIA_CARTE[k.media];
            const type = enLignee ? etiquetteCarteLignee(lignee!.modele, k.id) : null;
            const badge = enLignee ? noeudLignee.get(k.id)?.badge ?? null : null;
            const ouvertes = enLignee && notes ? notesOuvertes(notes.parNoeud.get(k.id)) : 0;
            return (
              <Fragment key={k.id}>
              <button type="button" className={`node${sel ? ' sel' : ''}${badge ? ' wn' : ''}`} data-carte={k.id} aria-pressed={sel}
                data-x={Math.round(p.x)} data-y={Math.round(p.y)}
                aria-label={type ? `${k.titre} · ${type.toLowerCase()}${badge ? ` · ${badge}` : ''}${ouvertes ? ` · ${phraseIndicateurNotes(ouvertes)}` : ''}` : `${k.titre} · ${LIBELLES_NATURE_CANVAS[k.nature]}${media ? ` · ${media}` : ''}`}
                onClick={() => { if (!glisse) envoyer({ type: 'selectionner', id: k.id }); }}
                onKeyDown={(ev) => surToucheCarte(ev, k)}
                onPointerDown={(ev) => { ev.stopPropagation(); debut(ev, 'carte', k.id); }}
                onPointerMove={bouger} onPointerUp={fin}
                style={{ position: 'absolute', left: p.x + (g?.dx ?? 0), top: p.y + (g?.dy ?? 0), width: p.w, height: p.h, overflow: 'hidden', alignContent: 'start', textAlign: 'left', touchAction: 'none', cursor: 'grab' }}>
                <span className="k">{type ?? `${LIBELLES_NATURE_CANVAS[k.nature].toUpperCase()} · ${LIBELLES_ETAPE_CANVAS[k.etape].toUpperCase()}`}</span>
                <strong>{k.titre}</strong>
                {apercus[k.id]
                  ? <img src={apercus[k.id]} alt={`Aperçu · ${k.titre}`} draggable={false} loading="lazy" onError={(e) => { e.currentTarget.hidden = true; }} style={{ display: 'block', width: '100%', aspectRatio: '4 / 5', maxHeight: 230, borderRadius: 12, objectFit: 'cover', pointerEvents: 'none' }} />
                  : <span>{k.resume}</span>}
                {media && <span className="faint" style={{ marginLeft: 0 }}>{media}</span>}
                {badge && <span className="pill g" style={{ justifySelf: 'start' }}>{badge}</span>}
              </button>
              {/* PC E11 · l'indicateur des notes OUVERTES du nœud · un bouton (clavier : Tab puis Entrée) qui choisit le nœud et porte le focus sur ses notes. */}
              {ouvertes > 0 && (
                <button type="button" className="pill c" data-ouvrir-notes={k.id} aria-label={`${phraseIndicateurNotes(ouvertes)} sur « ${k.titre} » · ouvrir les notes`}
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onClick={() => { setNotesAOuvrir(k.id); envoyer({ type: 'selectionner', id: k.id }); }}
                  style={{ position: 'absolute', left: p.x + p.w + (g?.dx ?? 0) - 10, top: p.y + (g?.dy ?? 0) - 22, transform: 'translateX(-100%)', minHeight: 44, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: 0 }}>
                  <Ic n="bookmark" />{ouvertes} note{ouvertes > 1 ? 's' : ''}
                </button>
              )}
              </Fragment>
            );
          })}
        </div>
        {/* Mini-carte · DÉCORATIVE (aucun geste, cachée aux lecteurs d'écran) · la fenêtre visible sur toute la lignée. */}
        {mini && (
          <svg data-mini-carte="" aria-hidden="true" focusable="false" width={mini.largeur} height={mini.hauteur} viewBox={`0 0 ${mini.largeur} ${mini.hauteur}`}
            style={{ position: 'absolute', right: 10, bottom: 10, borderRadius: 12, background: 'var(--ink)', border: '1px solid var(--edge2)', pointerEvents: 'none', opacity: 0.92 }}>
            {mini.cadres.map((r, i) => <rect key={`${r.id}#${i}`} data-mini-cadre={r.id} x={r.x} y={r.y} width={r.w} height={r.h} rx={3} fill="none" style={{ stroke: 'var(--edge)' }} strokeDasharray="3 2" />)}
            {mini.cartes.map((r) => <rect key={r.id} data-mini-carte-noeud={r.id} x={r.x} y={r.y} width={r.w} height={r.h} rx={1.5} style={{ fill: noeudLignee.get(r.id)?.badge ? 'var(--good)' : 'var(--fg3)' }} />)}
            {mini.fenetre && <rect data-mini-fenetre="" x={mini.fenetre.x} y={mini.fenetre.y} width={mini.fenetre.w} height={mini.fenetre.h} rx={3} fill="none" style={{ stroke: 'var(--chg)' }} strokeWidth={1.5} />}
          </svg>
        )}
      </div>
      <p id="canvas-libre-aide" className="faint" style={{ fontSize: '11.5px', margin: '10px 0 0' }}>
        {enLignee
          ? 'Déplacer une carte range ta vue de la lignée · aucun nœud, aucun lien ne change, rien n’est recalculé. Un lien dit d’où vient un nœud, ce n’est pas une dépendance. Clavier · Tab parcourt les cartes, les flèches déplacent la carte (Maj · grand pas) ; sur le fond, + et − zooment, 0 ajuste. La même lignée est en liste sous le canvas.'
          : 'Déplacer une carte range ta vue · ni l’ordre, ni les dépendances, ni la version ne changent. Clavier · Tab parcourt les cartes, les flèches déplacent la carte (Maj · grand pas) ; sur le fond, + et − zooment, 0 ajuste.'}
      </p>

      {choisie && (
        <div className="tile" data-detail-carte={choisie.id} style={{ marginTop: 12 }}>
          <div className="sech" style={{ margin: 0 }}>
            <h2>{choisie.titre}</h2>
            <span className="pill">{enLignee ? etiquetteCarteLignee(lignee!.modele, choisie.id).toLowerCase() : `${LIBELLES_NATURE_CANVAS[choisie.nature]} · ${LIBELLES_ETAPE_CANVAS[choisie.etape]}`}</span>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '12.5px' }}>{choisie.resume}</p>
          {elementChoisi && (
            <div data-detail-lignee={elementChoisi.id} style={{ display: 'grid', gap: 6, fontSize: '12px' }}>
              <p className="faint" style={{ margin: 0, marginLeft: 0 }}>{phraseLiens('Vient de', elementChoisi.vientDe)}</p>
              <p className="faint" style={{ margin: 0, marginLeft: 0 }}>{phraseLiens('A donné', elementChoisi.aDonne)}</p>
              {elementChoisi.dans.length > 0 && <p className="faint" style={{ margin: 0, marginLeft: 0 }}>Dans · {elementChoisi.dans.join(', ')}</p>}
              <p className="faint" style={{ margin: 0, marginLeft: 0 }}>Un lien de lignée dit d’où vient ce nœud · ce n’est pas une dépendance, rien n’est recalculé.</p>
              {elementChoisi.lien
                ? <Lien className="btn sm" style={{ justifySelf: 'start' }} href={elementChoisi.lien.href} data-ecran-detail={elementChoisi.id}>{elementChoisi.lien.libelle}</Lien>
                : <p className="faint" style={{ margin: 0, marginLeft: 0 }}>{SANS_ECRAN_NOEUD}</p>}
              {notes && <NotesNoeud noeud={{ id: elementChoisi.id, titre: elementChoisi.titre }} notes={notes.parNoeud.get(elementChoisi.id) ?? []} lieu="detail" ctl={notesCtl} />}
            </div>
          )}
          {!enLignee && [{ titre: 'Lit', cartes: lit, vide: 'Aucune dépendance · c’est un point de départ.' }, { titre: 'Alimente', cartes: alimente, vide: 'Rien ne la lit.' }].map((b) => (
            <div key={b.titre} data-liste={b.titre}>
              <span className="faint" style={{ fontSize: '11.5px', marginLeft: 0 }}>{b.titre}</span>
              {b.cartes.length === 0
                ? <p className="faint" style={{ margin: '4px 0 0', fontSize: '12px', marginLeft: 0 }}>{b.vide}</p>
                : <div className="chips" style={{ marginTop: 6 }}>{b.cartes.map((x) => (
                  <button key={x.id} className="chip" type="button" onClick={() => envoyer({ type: 'focaliser', id: x.id, taille: mesurer() })}>{x.titre}</button>
                ))}</div>}
            </div>
          ))}
          {!enLignee && <p className="faint" style={{ margin: 0, fontSize: '12px', marginLeft: 0 }}>{phraseAvalCarte(aval)}</p>}
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

      {/* Lot 11 · l'ÉQUIVALENT EN LISTE de la lignée · mêmes nœuds, même ordre, liens dits dans les deux sens, écran existant de chaque nœud. */}
      {enLignee && (
        <details data-lignee-liste="" style={{ marginTop: 12 }}>
          <summary className="chip">La lignée en liste · {liste.length} nœud{liste.length > 1 ? 's' : ''}{lignee!.groupes.length ? ` · ${lignee!.groupes.length} lot${lignee!.groupes.length > 1 ? 's' : ''}` : ''}</summary>
          {lignee!.groupes.length > 0 && (
            <section aria-label="Les lots de la lignée" style={{ marginTop: 10 }}>
              <h3 style={{ font: '600 13px/1.25 var(--sfd)', color: 'var(--fg)', margin: '0 0 6px' }}>Les lots</h3>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                {lignee!.groupes.map((g) => (
                  <li key={g.id} data-groupe-liste={g.id} className="tile" style={{ display: 'grid', gap: 4, fontSize: '12px' }}>
                    <strong>{g.titre}</strong>
                    <span className="muted">{g.texte}</span>
                    <span className="faint" style={{ marginLeft: 0 }}>Contient · {g.membres.map((x) => noeudLignee.get(x)?.titre ?? x).join(', ')}</span>
                    {g.lien && <Lien className="btn sm" style={{ justifySelf: 'start' }} href={g.lien.href}>{g.lien.libelle}</Lien>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <h3 style={{ font: '600 13px/1.25 var(--sfd)', color: 'var(--fg)', margin: '12px 0 6px' }}>Les nœuds, de la marque à l’itération</h3>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {liste.map((x) => (
              <li key={x.id} data-element-lignee={x.id} className="tile" style={{ display: 'grid', gap: 4, fontSize: '12px' }}>
                <strong>{x.intitule}</strong>
                <span className="muted">{x.resume}</span>
                <span className="faint" style={{ marginLeft: 0 }}>{phraseLiens('Vient de', x.vientDe)}</span>
                <span className="faint" style={{ marginLeft: 0 }}>{phraseLiens('A donné', x.aDonne)}</span>
                {x.dans.length > 0 && <span className="faint" style={{ marginLeft: 0 }}>Dans · {x.dans.join(', ')}</span>}
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {x.lien
                    ? <Lien className="btn sm" href={x.lien.href} data-ecran={x.id}>{x.lien.libelle}</Lien>
                    : <span className="faint" style={{ marginLeft: 0 }} data-sans-ecran={x.id}>{SANS_ECRAN_NOEUD}</span>}
                  <button className="chip" type="button" data-montrer={x.id} onClick={() => envoyer({ type: 'focaliser', id: x.id, taille: mesurer() })}>Montrer sur le canvas</button>
                </span>
                {notes && <NotesNoeud noeud={{ id: x.id, titre: x.titre }} notes={notes.parNoeud.get(x.id) ?? []} lieu="liste" ctl={notesCtl} />}
              </li>
            ))}
          </ol>
        </details>
      )}
      {enLignee && notes && <NotesSansNoeud notes={notes.sansNoeud} ctl={notesCtl} />}
      {enLignee && <ErreurNotes ctl={notesCtl} />}
    </div>
  );
}
