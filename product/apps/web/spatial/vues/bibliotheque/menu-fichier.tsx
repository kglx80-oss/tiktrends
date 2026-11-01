'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { focusMenuSuivant, type CleMenuFichier, type DestinationDeplacement, type EntreeMenuFichier } from '@tiktrends/core';
import { Ic, Lien } from '../../communs';

/**
 * Bibliothèque · le menu « … » d'une carte de fichier (grille) ou d'une ligne
 * (liste). Les entrées, leur état et leur raison sont décidés au noyau
 * (`menuFichier`, `destinationsDeplacement`) · ici, l'ouverture, le clavier et
 * le rendu. Chaque geste ouvert remonte à l'écran (`agir`), qui appelle
 * l'action serveur EXISTANTE · un geste fermé ne remonte jamais.
 *
 * Clavier (motif « menu bouton ») · Entrée, Espace ou Flèche bas sur « … »
 * ouvre et place le focus sur la première entrée ; Flèches haut et bas, Début
 * et Fin parcourent (en boucle) ; Flèche droite ou Entrée sur « Déplacer
 * vers… » ouvre la liste des dossiers, Flèche gauche ou Échap y revient ;
 * Échap ferme et rend le focus à « … » ; Tab ou un clic ailleurs ferme.
 */

export interface PropsMenuFichier {
  nom: string;
  entrees: EntreeMenuFichier[];
  destinations: DestinationDeplacement[];
  ouvert: boolean;
  basculer: (ouvrir: boolean) => void;
  agir: (cle: CleMenuFichier, dossier?: string | null) => void;
  occupe: boolean;
  variante: 'grille' | 'liste';
}

const FERME: CSSProperties = { opacity: 0.5, cursor: 'not-allowed' };

export function MenuFichier(p: PropsMenuFichier) {
  const [vue, setVue] = useState<'principal' | 'destinations'>('principal');
  const [focus, setFocus] = useState(false);
  const declencheur = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  /** L'entrée à focaliser à l'ouverture d'une vue · 0, ou « Déplacer vers… » au retour de la liste des dossiers. */
  const cible = useRef(0);

  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
  const focaliser = (i: number) => { const l = items(); l[Math.max(0, Math.min(i, l.length - 1))]?.focus(); };

  // À chaque ouverture (ou changement de vue) · le focus entre dans le menu.
  useEffect(() => { if (p.ouvert) focaliser(cible.current); }, [p.ouvert, vue]); // eslint-disable-line react-hooks/exhaustive-deps
  // Fermé · on repart de la vue principale.
  useEffect(() => { if (!p.ouvert) { setVue('principal'); cible.current = 0; } }, [p.ouvert]);
  // Un clic hors du menu et de son bouton le ferme.
  const { ouvert, basculer } = p;
  useEffect(() => {
    if (!ouvert) return;
    const clic = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && (menu.current?.contains(t) || declencheur.current?.contains(t))) return;
      basculer(false);
    };
    document.addEventListener('pointerdown', clic);
    return () => document.removeEventListener('pointerdown', clic);
  }, [ouvert, basculer]);

  const fermer = (rendreFocus: boolean) => { p.basculer(false); if (rendreFocus) declencheur.current?.focus(); };
  const ouvrirDestinations = () => { cible.current = 0; setVue('destinations'); };
  const retour = () => {
    cible.current = Math.max(0, p.entrees.findIndex((e) => e.cle === 'ranger'));
    setVue('principal');
  };

  const surTouche = (e: KeyboardEvent<HTMLDivElement>) => {
    const l = items();
    const i = l.indexOf(document.activeElement as HTMLElement);
    const n = focusMenuSuivant(e.key, i, l.length);
    if (n !== null) { e.preventDefault(); l[n]?.focus(); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (vue === 'destinations') retour(); else fermer(true); return; }
    if (e.key === 'Tab') { p.basculer(false); return; }
    if (e.key === 'ArrowLeft' && vue === 'destinations') { e.preventDefault(); retour(); return; }
    if (e.key === 'ArrowRight' && vue === 'principal' && (document.activeElement as HTMLElement | null)?.dataset.menu === 'ranger') {
      const r = p.entrees.find((x) => x.cle === 'ranger');
      if (r?.ouvert) { e.preventDefault(); ouvrirDestinations(); }
    }
  };

  const toucheDeclencheur = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' && !p.ouvert) { e.preventDefault(); cible.current = 0; p.basculer(true); }
  };

  const activer = (x: EntreeMenuFichier) => {
    if (!x.ouvert || p.occupe) return;
    if (x.sousMenu) { ouvrirDestinations(); return; }
    p.agir(x.cle);
    fermer(true);
  };

  const entree = (x: EntreeMenuFichier) => {
    const contenu = <><Ic n={x.icone} />{x.libelle}</>;
    const commun = { role: 'menuitem', tabIndex: -1, 'data-menu': x.cle, title: x.raison ?? undefined } as const;
    if (x.href && x.ouvert) {
      return x.cle === 'telecharger'
        ? <a key={x.cle} {...commun} href={x.href} target="_blank" rel="noopener noreferrer" download onClick={() => fermer(true)}>{contenu}</a>
        : <Lien key={x.cle} {...commun} href={x.href} onClick={() => fermer(false)}>{contenu}</Lien>;
    }
    const indisponible = !x.ouvert || p.occupe;
    return (
      <button key={x.cle} type="button" {...commun} aria-disabled={indisponible || undefined} aria-haspopup={x.sousMenu ? 'menu' : undefined}
        style={indisponible ? FERME : undefined} onClick={() => activer(x)}>
        {contenu}{x.sousMenu && <span aria-hidden="true" style={{ marginLeft: 'auto' }}>›</span>}
      </button>
    );
  };

  const position: CSSProperties = p.variante === 'grille'
    ? { left: 'auto', right: 8, top: 44, width: 250, maxHeight: 340, overflowY: 'auto' }
    : { left: 'auto', right: 0, top: 38, width: 250, maxHeight: 340, overflowY: 'auto' };

  return (
    <>
      <button ref={declencheur} type="button" className="dstar" data-menu-fichier="" aria-label={`Actions sur ${p.nom}`} aria-haspopup="menu" aria-expanded={p.ouvert}
        style={p.ouvert || focus ? { opacity: 1 } : undefined}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        onClick={() => { cible.current = 0; p.basculer(!p.ouvert); }} onKeyDown={toucheDeclencheur}>
        <Ic n="more" />
      </button>
      {p.ouvert && (
        <div ref={menu} className="dmenu glass" role="menu" aria-label={vue === 'principal' ? `Actions sur ${p.nom}` : `Déplacer ${p.nom} vers`} style={position} onKeyDown={surTouche}>
          {vue === 'principal'
            ? p.entrees.map(entree)
            : (
              <>
                <button type="button" role="menuitem" tabIndex={-1} data-menu="retour" onClick={retour}><Ic n="back" />Déplacer vers…</button>
                {p.destinations.map((d) => {
                  const indisponible = d.actuel || p.occupe;
                  return (
                    <button key={d.id ?? ':racine'} type="button" role="menuitemradio" tabIndex={-1} aria-checked={d.actuel} aria-disabled={indisponible || undefined}
                      data-destination={d.id ?? ''} title={d.actuel ? 'Le fichier est déjà ici.' : undefined} style={indisponible ? FERME : undefined}
                      onClick={() => { if (indisponible) return; p.agir('ranger', d.id); fermer(true); }}>
                      <Ic n={d.actuel ? 'check' : 'folder'} />{d.nom}
                    </button>
                  );
                })}
              </>
            )}
        </div>
      )}
    </>
  );
}
