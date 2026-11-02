'use client';

import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import {
  chargeContient, chargeGlissee, deplieAuSurvol, DELAI_DEPLIAGE_SURVOL_MS, glissable, porteDesFichiers, verdictDepot,
  type ChargeGlissee, type DonneesDrive, type NoeudArbreDrive, type SectionDrive,
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
 */

/** Le type du transfert · posé au départ (Firefox ne lance aucun glisser sans donnée), jamais relu · la charge vit dans l'écran. */
export const TYPE_GLISSER_BIBLIOTHEQUE = 'application/x-tiktrends-bibliotheque';

/** La cible survolée qui accepte · contour et fond d'accent (la sélection de la maquette, `.fcard.sel`). */
export const STYLE_DEPOT_ACCEPTE: CSSProperties = { outline: '2px solid var(--acc)', outlineOffset: -2, background: 'color-mix(in srgb, var(--acc) 12%, transparent)' };
/** La cible survolée qui refuse · tirets, atténuée · le refus ne tient pas à la seule couleur. */
export const STYLE_DEPOT_REFUSE: CSSProperties = { outline: '2px dashed var(--bad)', outlineOffset: -2, opacity: 0.55 };

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
}

export function useGlisserDeposer(o: OptionsGlisserDeposer) {
  const telephone = useTelephone();
  const charge = useRef<ChargeGlissee | null>(null);
  const [survol, setSurvol] = useState<{ id: string; ok: boolean } | null>(null);
  /** L'échéance du dépliage au survol · un seul nœud à la fois. */
  const depliage = useRef<{ id: string; minuterie: ReturnType<typeof setTimeout> } | null>(null);
  const ctx = { section: o.section, lectureSeule: o.lectureSeule };
  // Au téléphone, rien ne se glisse · en lecture seule non plus, le noyau ne laisse rien partir (`chargeGlissee`).
  const actif = !telephone;
  const annulerDepliage = (id?: string) => {
    if (!depliage.current || (id !== undefined && depliage.current.id !== id)) return;
    clearTimeout(depliage.current.minuterie);
    depliage.current = null;
  };
  // Démonté en plein survol · l'échéance ne survit pas à l'écran.
  useEffect(() => { const d = depliage; return () => { if (d.current) clearTimeout(d.current.minuterie); }; }, []);
  const finir = () => { charge.current = null; annulerDepliage(); setSurvol(null); };

  /** Un élément qui se glisse (carte, ligne) · rien s'il ne part pas (règle du noyau). */
  const source = (id: string) => {
    if (!actif || !glissable(o.donnees, id, ctx)) return {};
    return {
      draggable: true,
      onDragStart: (e: DragEvent) => {
        const c = o.occupe ? null : chargeGlissee(o.donnees, id, o.selection, ctx);
        if (!c) { e.preventDefault(); return; }
        e.stopPropagation();
        charge.current = c;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(TYPE_GLISSER_BIBLIOTHEQUE, c.type === 'dossier' ? c.id : c.ids.join(','));
      },
      onDragEnd: finir,
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
        const ok = !o.occupe && verdictDepot(o.donnees, c, id).ok;
        if (ok) e.preventDefault();
        e.dataTransfer.dropEffect = ok ? 'move' : 'none';
        // La source elle-même n'est pas mise en évidence · elle refuse sans le dire.
        const montre = chargeContient(c, id) ? null : { id, ok };
        setSurvol((s) => (s?.id === montre?.id && s?.ok === montre?.ok ? s : montre));
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
      },
      onDrop: (e: DragEvent) => {
        const c = charge.current;
        if (!c) return;
        e.preventDefault(); e.stopPropagation();
        finir();
        // Revérifié au dépôt · une cible refusée n'appelle rien.
        const v = verdictDepot(o.donnees, c, id);
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

  return { source, cible, style, enCours, importable };
}
