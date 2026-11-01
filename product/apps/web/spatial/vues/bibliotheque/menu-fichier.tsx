'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { focusMenuSuivant, type CleMenuFichier, type EntreeMenu, type OptionSousMenu } from '@tiktrends/core';
import { Ic, Lien } from '../../communs';

/**
 * Bibliothèque · le menu « … » d'une carte (grille) ou d'une ligne (liste) ·
 * d'un FICHIER comme d'un DOSSIER, même composant, même clavier. Les entrées,
 * leur état et leur raison sont décidés au noyau (`menuFichier`,
 * `destinationsDeplacement` · `menuDossier`, `optionsTagDossier`) · ici,
 * l'ouverture, le clavier et le rendu. Chaque geste ouvert remonte à l'écran
 * (`agir`), qui appelle l'action serveur EXISTANTE · un geste fermé ne remonte
 * jamais.
 *
 * Clavier (motif « menu bouton ») · Entrée, Espace ou Flèche bas sur « … »
 * ouvre et place le focus sur la première entrée ; Flèches haut et bas, Début
 * et Fin parcourent (en boucle) ; Flèche droite ou Entrée sur une entrée à liste
 * (« Déplacer vers… », « Tag de couleur ») ouvre ses options, Flèche gauche ou
 * Échap y revient ; Échap ferme et rend le focus à « … » ; Tab ou un clic
 * ailleurs ferme. Un menu peut porter plusieurs entrées à liste (un dossier ·
 * « Déplacer vers… » et « Tag de couleur ») · chacune a ses options (`listes`).
 * Une option fermée (`actuel`, ou une `raison` · destination interdite) reste
 * proposée, sans effet, avec sa phrase en infobulle.
 */

/** Les options d'une entrée à liste, son nom (lecteur d'écran) et l'infobulle d'une option déjà en place. */
export interface ListeMenu {
  options: OptionSousMenu[];
  libelle: string;
  dejaIci: string;
}

export interface PropsMenuFichier<C extends string = CleMenuFichier> {
  nom: string;
  entrees: EntreeMenu<C>[];
  /** Les options de l'entrée à liste (`sousMenu`) · les dossiers de « Déplacer vers… », les tags. */
  destinations: OptionSousMenu[];
  ouvert: boolean;
  basculer: (ouvrir: boolean) => void;
  agir: (cle: C, option?: string | null) => void;
  occupe: boolean;
  /** `dossier` · le bouton prend place dans les actions de la carte de dossier (maquette `facts`). */
  variante: 'grille' | 'liste' | 'dossier';
  /** Ce que porte le menu · l'attribut du bouton « … » (`data-menu-fichier`, `data-menu-dossier`). */
  cible?: 'fichier' | 'dossier';
  /** La liste ouverte · son nom (lecteur d'écran) et l'infobulle d'une option déjà en place. */
  liste?: { libelle: string; dejaIci: string };
  /** Plusieurs entrées à liste · les options de CHACUNE, par clé (remplace `destinations` et `liste`). */
  listes?: Partial<Record<C, ListeMenu>>;
  /** Où poser le bouton et le panneau · par défaut côte à côte (le bouton, puis le menu). */
  placer?: (declencheur: ReactNode, panneau: ReactNode) => ReactNode;
}

const FERME: CSSProperties = { opacity: 0.5, cursor: 'not-allowed' };

export function MenuFichier<C extends string = CleMenuFichier>(p: PropsMenuFichier<C>) {
  /** La vue · le menu (`null`), ou la liste ouverte d'une entrée (sa clé). */
  const [vue, setVue] = useState<C | null>(null);
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
  useEffect(() => { if (!p.ouvert) { setVue(null); cible.current = 0; } }, [p.ouvert]);
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
  const ouvrirDestinations = (cle: C) => { cible.current = 0; setVue(cle); };
  const retour = () => {
    cible.current = Math.max(0, p.entrees.findIndex((e) => e.cle === vue));
    setVue(null);
  };
  /** L'entrée dont la liste est ouverte · aucune dans la vue principale. */
  const aListe = vue === null ? undefined : p.entrees.find((x) => x.sousMenu && x.cle === vue);
  const listeDe = (cle: C): ListeMenu => p.listes?.[cle]
    ?? { options: p.destinations, ...(p.liste ?? { libelle: `Déplacer ${p.nom} vers`, dejaIci: 'Le fichier est déjà ici.' }) };
  const liste = aListe ? listeDe(aListe.cle) : null;

  const surTouche = (e: KeyboardEvent<HTMLDivElement>) => {
    const l = items();
    const i = l.indexOf(document.activeElement as HTMLElement);
    const n = focusMenuSuivant(e.key, i, l.length);
    if (n !== null) { e.preventDefault(); l[n]?.focus(); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (aListe) retour(); else fermer(true); return; }
    if (e.key === 'Tab') { p.basculer(false); return; }
    if (e.key === 'ArrowLeft' && aListe) { e.preventDefault(); retour(); return; }
    if (e.key === 'ArrowRight' && !aListe) {
      const ici = p.entrees.find((x) => x.sousMenu && x.cle === (document.activeElement as HTMLElement | null)?.dataset.menu);
      if (ici?.ouvert && !p.occupe) { e.preventDefault(); ouvrirDestinations(ici.cle); }
    }
  };

  const toucheDeclencheur = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' && !p.ouvert) { e.preventDefault(); cible.current = 0; p.basculer(true); }
  };

  const activer = (x: EntreeMenu<C>) => {
    if (!x.ouvert || p.occupe) return;
    if (x.sousMenu) { ouvrirDestinations(x.cle); return; }
    p.agir(x.cle);
    fermer(true);
  };

  const entree = (x: EntreeMenu<C>) => {
    const contenu = <><Ic n={x.icone} />{x.libelle}</>;
    const commun = { role: 'menuitem', tabIndex: -1, 'data-menu': x.cle, title: x.raison ?? x.detail } as const;
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

  // Grille · sous « … » en coin de la carte de fichier (`dstar`) ou des actions de la carte de dossier (`facts`, comme le menu du tag) ; liste · sous la ligne.
  const position: CSSProperties = p.variante === 'grille'
    ? { left: 'auto', right: 8, top: 44, width: 250, maxHeight: 340, overflowY: 'auto' }
    : p.variante === 'dossier'
      ? { left: 'auto', right: 8, top: 42, width: 250, maxHeight: 340, overflowY: 'auto' }
      : { left: 'auto', right: 0, top: 38, width: 250, maxHeight: 340, overflowY: 'auto' };

  const bouton = (
    <button ref={declencheur} type="button" className={p.variante === 'dossier' ? undefined : 'dstar'} {...{ [`data-menu-${p.cible ?? 'fichier'}`]: '' }}
      aria-label={`Actions sur ${p.nom}`} aria-haspopup="menu" aria-expanded={p.ouvert}
      style={p.ouvert || focus ? { opacity: 1 } : undefined}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      onClick={() => { cible.current = 0; p.basculer(!p.ouvert); }} onKeyDown={toucheDeclencheur}>
      <Ic n="more" />
    </button>
  );
  const panneau = p.ouvert && (
    <div ref={menu} className="dmenu glass" role="menu" aria-label={aListe && liste ? liste.libelle : `Actions sur ${p.nom}`} style={position} onKeyDown={surTouche}>
      {!aListe || !liste
        ? p.entrees.map(entree)
        : (
          <>
            <button type="button" role="menuitem" tabIndex={-1} data-menu="retour" onClick={retour}><Ic n="back" />{aListe.libelle}</button>
            {liste.options.map((d) => {
              const indisponible = d.actuel || !!d.raison || p.occupe;
              return (
                <button key={d.id ?? ':racine'} type="button" role="menuitemradio" tabIndex={-1} aria-checked={d.actuel} aria-disabled={indisponible || undefined}
                  data-destination={d.id ?? ''} title={d.actuel ? liste.dejaIci : (d.raison ?? undefined)} style={indisponible ? FERME : undefined}
                  onClick={() => { if (indisponible) return; p.agir(aListe.cle, d.id); fermer(true); }}>
                  {d.teinte
                    ? <i aria-hidden="true" style={{ width: 12, height: 12, borderRadius: '50%', background: d.teinte, flex: 'none', margin: '0 3px' }} />
                    : <Ic n={d.icone ?? (d.actuel ? 'check' : 'folder')} />}
                  {d.nom}
                  {d.teinte && d.actuel && <span aria-hidden="true" style={{ marginLeft: 'auto', display: 'flex' }}><Ic n="check" /></span>}
                </button>
              );
            })}
          </>
        )}
    </div>
  );

  return <>{p.placer ? p.placer(bouton, panneau) : <>{bouton}{panneau}</>}</>;
}
