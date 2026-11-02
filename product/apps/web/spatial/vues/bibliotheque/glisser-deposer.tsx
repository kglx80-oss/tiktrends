'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  annonceSurvol, chargeAbandonnee, chargeContient, chargeGlissee, chargeOrpheline, defilementApres, deplieAuSurvol, DELAI_DEPLIAGE_SURVOL_MS,
  elementsGlissables, GARDE_CHARGE_MS, porteDesFichiers, refusAuLacher, verdictDepot, vitesseDefilement, VEILLE_DEFILEMENT_MS,
  type AnnonceSurvol, type ChargeGlissee, type DonneesDrive, type NoeudArbreDrive, type SectionDrive, type ZoneDefilement,
} from '@tiktrends/core';
import { useTelephone } from '../../communs';

/**
 * Bibliothèque · le glisser-déposer à la SOURIS · un fichier (ou la sélection
 * de fichiers qu'il emporte) ou un dossier (ou la sélection de dossiers qu'il
 * emporte), déposé sur un dossier de l'arbre,
 * de la grille ou de la liste. Ce qui part et ce qui reçoit est décidé au noyau
 * (`chargeGlissee`, `verdictDepot`) · ici, les événements et l'état du survol.
 *
 * Un raccourci, rien de plus · la voie accessible (clavier) reste « Déplacer
 * vers… » du menu « … ». Une cible refusée (anti-cycle, système, autre marque,
 * déjà là) ne prend pas le dépôt · curseur interdit (`dropEffect` `none`, aucun
 * `preventDefault`), contour en tirets atténué, et le dépôt n'appelle rien. Au
 * téléphone (seuil de la maquette) et en lecture seule, rien ne se glisse.
 *
 * Un nœud replié de l'arbre survolé pendant un glisser se déplie après
 * `DELAI_DEPLIAGE_SURVOL_MS` (règle et délai au noyau · `deplieAuSurvol`) ;
 * le quitter avant, déposer ou finir le glisser annule l'échéance.
 *
 * Pendant un glisser interne, le pointeur près du bord haut ou bas de la zone
 * qui défile (la page · ou un conteneur qui défile seul, le plus proche du
 * pointeur qui peut encore aller vers ce bord) la fait défiler (bande, vitesse
 * et arrêts au noyau · `vitesseDefilement`). Les `dragover` sont écoutés en
 * CAPTURE sur la fenêtre · ils arrivent aussi hors des cibles (une carte de
 * fichier, la barre flottante) et avant qu'une cible n'arrête leur propagation.
 * Arrêt net hors de la bande, à la limite, au dépôt, à la fin du glisser, à la
 * sortie de la fenêtre et sans `dragover` depuis `VEILLE_DEFILEMENT_MS`.
 *
 * La raison d'un refus est dite pendant le survol · une région polie
 * (`aria-live="polite"`, une seule pour l'écran, posée sur `body` après le
 * montage · le rendu serveur n'en porte pas, parité avec la maquette) reçoit la
 * phrase du verdict quand la cible survolée change et refuse (`annonceSurvol`).
 * Rien sur une cible qui accepte, ni sur la source elle-même.
 *
 * Lâchée sur une cible qui refuse, la charge fait dire la raison par le toast
 * de l'écran (`refuser`), UNE fois (règle au noyau · `refusAuLacher`) · le
 * navigateur ne tire pas `drop` sur une cible qui n'a pas accepté le survol ·
 * c'est la fin du glisser (`dragend`) qui le dit, quand le dernier `dragover`
 * était sur cette cible (chaque `dragover` de la fenêtre, en capture, efface
 * d'abord le refus retenu · une cible refusée le repose).
 *
 * La charge se DÉSARME de façon robuste · par `dragend` écouté sur la fenêtre
 * en capture (la même écoute que le défilement) ; par le dépôt sur une cible
 * qui accepte (seul `drop` que le navigateur tire pendant un glisser interne ·
 * aucune autre zone n'accepte le survol) ; à la relecture des données si elle
 * est orpheline (`chargeOrpheline`) ; et, si la source a quitté le document
 * (son `dragend` n'arrivera plus), après `GARDE_CHARGE_MS` sans `dragover`
 * (`chargeAbandonnee`). La zone d'import répond de nouveau.
 */

/** Le type du transfert · posé au départ (Firefox ne lance aucun glisser sans donnée), jamais relu · la charge vit dans l'écran. */
export const TYPE_GLISSER_BIBLIOTHEQUE = 'application/x-tiktrends-bibliotheque';

/** La cible survolée qui accepte · contour et fond d'accent (la sélection de la maquette, `.fcard.sel`). */
export const STYLE_DEPOT_ACCEPTE: CSSProperties = { outline: '2px solid var(--acc)', outlineOffset: -2, background: 'color-mix(in srgb, var(--acc) 12%, transparent)' };
/** La cible survolée qui refuse · tirets, atténuée · le refus ne tient pas à la seule couleur. */
export const STYLE_DEPOT_REFUSE: CSSProperties = { outline: '2px dashed var(--bad)', outlineOffset: -2, opacity: 0.55 };

/** Le conteneur qui défile seul · `overflow-y` qui défile et un contenu plus haut que lui (la page est traitée à part). */
function defileSeul(e: Element): boolean {
  const oy = getComputedStyle(e).overflowY;
  return (oy === 'auto' || oy === 'scroll' || oy === 'overlay') && e.scrollHeight > e.clientHeight;
}

/**
 * La zone de l'élément `e`, en coordonnées de la fenêtre (celles de `clientY`) · la page (élément de défilement du
 * document) occupe toute la fenêtre ; un conteneur, son rectangle À L'ÉCRAN (`getBoundingClientRect`, zoom de la vue
 * compris · `clientHeight` est en px CSS non zoomés).
 */
function mesurerZone(e: Element): ZoneDefilement {
  const course = { defile: e.scrollTop, max: e.scrollHeight - e.clientHeight };
  if (e === (document.scrollingElement ?? document.documentElement)) return { haut: 0, bas: e.clientHeight, ...course };
  const r = e.getBoundingClientRect();
  return { haut: r.top, bas: r.bottom, ...course };
}

/**
 * La zone qui défile sous le pointeur · le premier conteneur, de la cible du `dragover` vers la page, dont la bande
 * fait défiler (`vitesseDefilement` non nulle · un conteneur déjà à sa limite laisse la main au suivant). `null` · rien
 * ne défile.
 */
function zoneSousPointeur(cible: EventTarget | null, y: number): Element | null {
  const page = document.scrollingElement ?? document.documentElement;
  for (let e = cible instanceof Element ? cible : null; e && e !== page && e !== document.body; e = e.parentElement) {
    if (defileSeul(e) && vitesseDefilement(y, mesurerZone(e)) !== 0) return e;
  }
  return vitesseDefilement(y, mesurerZone(page)) !== 0 ? page : null;
}

export interface OptionsGlisserDeposer {
  donnees: DonneesDrive;
  section: SectionDrive;
  lectureSeule: string | null;
  selection: ReadonlySet<string>;
  occupe: boolean;
  /** Le dépôt accepté · la destination (`null` · non classé) et son nom, jugés au noyau. */
  deposer: (charge: ChargeGlissee, destination: string | null, nom: string) => void;
  /** Déplie le nœud `id` de l'arbre (jamais ne le replie) · appelé à l'échéance du survol prolongé. */
  deplier?: (id: string) => void;
  /** Dit la raison d'un dépôt refusé (le toast de l'écran) · appelé une fois par lâcher sur une cible refusée. */
  refuser?: (raison: string) => void;
}

export function useGlisserDeposer(o: OptionsGlisserDeposer) {
  const telephone = useTelephone();
  const charge = useRef<ChargeGlissee | null>(null);
  const [survol, setSurvol] = useState<{ id: string; ok: boolean } | null>(null);
  /** Ce que dit la région polie · la raison du refus de la cible survolée (`annonceSurvol`). */
  const [annonce, setAnnonce] = useState<AnnonceSurvol>(null);
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);
  /**
   * Le défilement en cours · la zone, la dernière hauteur du pointeur, la position tenue en fractions de pixel (le
   * navigateur peut arrondir `scrollTop` · une vitesse lente avancerait sinon de zéro à chaque image), l'image
   * demandée, l'heure de la précédente et la veille.
   */
  const defilement = useRef<{ zone: Element; y: number; position: number; image: number | null; avant: number | null; veille: ReturnType<typeof setTimeout> } | null>(null);
  /** L'échéance du dépliage au survol · un seul nœud à la fois. */
  const depliage = useRef<{ id: string; minuterie: ReturnType<typeof setTimeout> } | null>(null);
  /** L'élément source du glisser · retiré du document, son `dragend` n'arrivera plus (`chargeAbandonnee`). */
  const sourceEl = useRef<Element | null>(null);
  /** La cible refusée sous le pointeur au dernier `dragover` · ce que dit le toast si l'on lâche (`refusAuLacher`). */
  const refusSous = useRef<AnnonceSurvol>(null);
  /** La garde de la charge · relancée à chaque `dragover`. */
  const garde = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Le toast de l'écran, relu par les écoutes de la fenêtre (posées une fois). */
  const refuser = useRef(o.refuser);
  useEffect(() => { refuser.current = o.refuser; });
  const ctx = { section: o.section, lectureSeule: o.lectureSeule };
  // Au téléphone, rien ne se glisse · en lecture seule non plus, le noyau ne laisse rien partir (`chargeGlissee`).
  const actif = !telephone;
  // Ce qui se glisse, calculé une fois par données (et non carte par carte · rendu linéaire, `elementsGlissables`).
  const glissables = useMemo(() => elementsGlissables(o.donnees, { section: o.section, lectureSeule: o.lectureSeule }), [o.donnees, o.section, o.lectureSeule]);
  const annulerDepliage = (id?: string) => {
    if (!depliage.current || (id !== undefined && depliage.current.id !== id)) return;
    clearTimeout(depliage.current.minuterie);
    depliage.current = null;
  };
  const arreterDefilement = () => {
    const d = defilement.current;
    if (!d) return;
    if (d.image !== null) cancelAnimationFrame(d.image);
    clearTimeout(d.veille);
    defilement.current = null;
  };
  const leverGarde = () => {
    if (garde.current) clearTimeout(garde.current);
    garde.current = null;
  };
  // Démonté en plein survol · l'échéance, la garde et le défilement ne survivent pas à l'écran.
  useEffect(() => { const d = depliage; return () => { if (d.current) clearTimeout(d.current.minuterie); leverGarde(); arreterDefilement(); }; }, []);
  // La charge désarmée · survol, annonce, dépliage, garde et défilement. Rien n'est envoyé.
  const finir = () => {
    charge.current = null; sourceEl.current = null; refusSous.current = null;
    leverGarde(); annulerDepliage(); arreterDefilement(); setSurvol(null); setAnnonce(null);
  };
  /** La garde · à l'échéance, la charge est abandonnée si sa source a quitté le document (règle au noyau), sinon relancée. */
  const armerGarde = () => {
    leverGarde();
    garde.current = setTimeout(() => {
      garde.current = null;
      if (!charge.current) return;
      if (chargeAbandonnee({ silenceMs: GARDE_CHARGE_MS, sourceDansDocument: !!sourceEl.current?.isConnected })) finir();
      else armerGarde();
    }, GARDE_CHARGE_MS);
  };
  // La relecture des données · une charge dont un élément n'existe plus est désarmée.
  useEffect(() => {
    if (charge.current && chargeOrpheline(o.donnees, charge.current)) finir();
    // `finir` ne lit que des références et des setters stables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.donnees]);

  /** Une image du défilement · la vitesse relue au noyau (bande, limites) à la position du moment, nulle · arrêt net. */
  const image = (t: number) => {
    const d = defilement.current;
    if (!d) return;
    d.image = null;
    const z = mesurerZone(d.zone);
    const v = vitesseDefilement(d.y, z);
    if (v === 0) { arreterDefilement(); return; }
    // Défilée d'ailleurs (molette pendant le glisser) · on repart de la position réelle.
    if (Math.abs(z.defile - d.position) > 1) d.position = z.defile;
    if (d.avant !== null) {
      d.position = defilementApres({ defile: d.position, max: z.max }, v, t - d.avant);
      d.zone.scrollTop = d.position;
    }
    d.avant = t;
    d.image = requestAnimationFrame(image);
  };

  // Les `dragover` de toute la fenêtre, en capture · le défilement suit le pointeur, même hors des cibles.
  useEffect(() => {
    if (!actif) return;
    const survoler = (e: globalThis.DragEvent) => {
      if (!charge.current) return;
      // En capture, avant la cible · le refus retenu est effacé, une cible refusée le repose ; la garde repart.
      refusSous.current = null;
      armerGarde();
      const zone = zoneSousPointeur(e.target, e.clientY);
      if (!zone) { arreterDefilement(); return; }
      let d = defilement.current;
      if (d && d.zone !== zone) { arreterDefilement(); d = null; }
      if (!d) {
        d = { zone, y: e.clientY, position: zone.scrollTop, image: null, avant: null, veille: setTimeout(arreterDefilement, VEILLE_DEFILEMENT_MS) };
        defilement.current = d;
        d.image = requestAnimationFrame(image);
        return;
      }
      d.y = e.clientY;
      clearTimeout(d.veille);
      d.veille = setTimeout(arreterDefilement, VEILLE_DEFILEMENT_MS);
      if (d.image === null) d.image = requestAnimationFrame(image);
    };
    // Sortie de la fenêtre (`dragleave` sans élément d'arrivée), dépôt, fin du glisser · arrêt net.
    const quitter = (e: globalThis.DragEvent) => { if (e.relatedTarget === null) arreterDefilement(); };
    // Fin du glisser, en capture (aucune cible ne l'arrête) · la charge désarmée, et le refus dit s'il y a lieu.
    const terminer = (e: globalThis.DragEvent) => {
      arreterDefilement();
      if (!charge.current) return;
      const dt = e.dataTransfer as (DataTransfer & { mozUserCancelled?: boolean }) | null;
      const raison = refusAuLacher(refusSous.current, { effet: dt?.dropEffect, annule: dt?.mozUserCancelled });
      finir();
      if (raison) refuser.current?.(raison);
    };
    window.addEventListener('dragover', survoler, true);
    window.addEventListener('dragleave', quitter, true);
    window.addEventListener('drop', arreterDefilement, true);
    window.addEventListener('dragend', terminer, true);
    return () => {
      window.removeEventListener('dragover', survoler, true);
      window.removeEventListener('dragleave', quitter, true);
      window.removeEventListener('drop', arreterDefilement, true);
      window.removeEventListener('dragend', terminer, true);
    };
    // `image` et `arreterDefilement` ne lisent que des références · l'écoute vit autant que l'écran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif]);

  /** Un élément qui se glisse (carte, ligne) · rien s'il ne part pas (règle du noyau). */
  const source = (id: string) => {
    if (!actif || !glissables.has(id)) return {};
    return {
      draggable: true,
      onDragStart: (e: DragEvent) => {
        const c = o.occupe ? null : chargeGlissee(o.donnees, id, o.selection, ctx);
        if (!c) { e.preventDefault(); return; }
        e.stopPropagation();
        charge.current = c;
        sourceEl.current = e.currentTarget;
        refusSous.current = null;
        armerGarde();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(TYPE_GLISSER_BIBLIOTHEQUE, c.type === 'dossier' ? c.id : c.ids.join(','));
      },
      // La fin du glisser est écoutée sur la fenêtre, en capture (`terminer`) · une seule voie, le refus dit une fois.
    };
  };

  /**
   * Un dossier qui reçoit (nœud de l'arbre, carte, ligne) · jugé à chaque survol. Un nœud de l'arbre passe son état
   * (`noeud`) · replié, il se déplie au survol prolongé.
   */
  const cible = (id: string, noeud?: Pick<NoeudArbreDrive, 'id' | 'aEnfants' | 'ouvert'>) => {
    if (!actif) return {};
    return {
      'data-depot': survol?.id === id ? (survol.ok ? 'accepte' : 'refuse') : undefined,
      onDragOver: (e: DragEvent) => {
        const c = charge.current;
        if (!c) return;
        e.stopPropagation();
        const verdict = verdictDepot(o.donnees, c, id);
        const ok = !o.occupe && verdict.ok;
        if (ok) e.preventDefault();
        e.dataTransfer.dropEffect = ok ? 'move' : 'none';
        // La source elle-même n'est pas mise en évidence · elle refuse sans le dire.
        const source = chargeContient(c, id);
        const montre = source ? null : { id, ok };
        setSurvol((s) => (s?.id === montre?.id && s?.ok === montre?.ok ? s : montre));
        // La raison d'un refus, dite une fois par cible (règle au noyau · rendre l'annonce courante n'écrit rien).
        setAnnonce((a) => annonceSurvol(a, id, source ? null : verdict));
        // Le refus retenu pour le lâcher · effacé par la fenêtre à chaque `dragover`, reposé ici si cette cible refuse.
        refusSous.current = annonceSurvol(null, id, source ? null : verdict);
        // Le dépliage au survol · l'échéance part au premier survol du nœud, pas à chacun (le navigateur en tire en continu).
        if (depliage.current?.id !== id) annulerDepliage();
        if (noeud && o.deplier && !depliage.current && deplieAuSurvol(noeud, c)) {
          const deplier = o.deplier;
          depliage.current = { id, minuterie: setTimeout(() => { depliage.current = null; deplier(id); }, DELAI_DEPLIAGE_SURVOL_MS) };
        }
      },
      onDragLeave: (e: DragEvent) => {
        if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
        annulerDepliage(id);
        setSurvol((s) => (s?.id === id ? null : s));
        setAnnonce((a) => (a?.cible === id ? null : a));
      },
      onDrop: (e: DragEvent) => {
        const c = charge.current;
        if (!c) return;
        e.preventDefault(); e.stopPropagation();
        // Revérifié au dépôt · une cible refusée n'appelle rien, et dit pourquoi (si le navigateur tire `drop` sur elle).
        const v = verdictDepot(o.donnees, c, id);
        const raison = refusAuLacher(annonceSurvol(null, id, chargeContient(c, id) ? null : v), { effet: null });
        finir();
        if (raison) o.refuser?.(raison);
        if (!v.ok || o.occupe) return;
        o.deposer(c, v.destination, v.nom);
      },
    };
  };

  /**
   * Le style de l'élément `id` · le sien (`base`), et celui du survol par-dessus · `undefined` quand aucun des deux
   * n'existe (le rendu serveur n'en porte jamais · parité avec la maquette).
   */
  const style = (id: string, base?: CSSProperties | null): CSSProperties | undefined => {
    const depot = survol?.id === id ? (survol.ok ? STYLE_DEPOT_ACCEPTE : STYLE_DEPOT_REFUSE) : undefined;
    return base || depot ? { ...(base ?? {}), ...(depot ?? {}) } : undefined;
  };

  /** Un glisser interne est en cours · la zone d'import (fichiers de l'ordinateur) ne s'en mêle pas. */
  const enCours = () => charge.current !== null;

  /** La zone d'import répond-elle à ce glisser · des fichiers de l'ordinateur (`Files`), jamais un glisser interne. */
  const importable = (e: DragEvent) => !enCours() && porteDesFichiers(e.dataTransfer?.types);

  /**
   * La région polie de l'écran, UNE · posée sur `body` après le montage (le rendu serveur n'en porte pas). L'annonce
   * est réinsérée à chaque nouvelle cible (clé) · une phrase identique sur une autre cible est donc redite.
   */
  const rendu = actif && monte
    ? createPortal(<span className="sr" role="status" aria-live="polite" data-annonce-depot="">{annonce && <span key={annonce.cible}>{annonce.texte}</span>}</span>, document.body)
    : null;

  return { source, cible, style, enCours, importable, annonce: rendu };
}
