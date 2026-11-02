'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ajouterMedias, appliquerPage, MESSAGE_PAGE, pagesInitiales,
  type DonneesDrive, type EtatPagesBibliotheque, type FenetresBibliotheque, type MediaSource, type SuiteListe,
} from '@tiktrends/core';
import { pageBibliothequeAction } from '../../../app/actions/assets';
import { Ic } from '../../communs';

/**
 * Bibliothèque · « Charger plus » et la recherche sur TOUS les fichiers de
 * l'espace. La page envoie sa fenêtre (les plus récents) et ses curseurs ;
 * chaque page lue ensuite (`pageBibliothequeAction`) s'ajoute aux données de
 * l'écran (`ajouterMedias`, sans doublon), et l'écran entier · sélection,
 * menus, glisser, archive, lien interne · travaille sur ces données-là. Ce
 * qu'il reste et ce qu'il faut demander est décidé au noyau (`suiteListe`).
 *
 * Après un geste, la page se relit (`router.refresh`) · ses nouvelles données
 * remplacent les pages lues (un fichier lu avant le geste pourrait avoir changé
 * de dossier) · « Charger plus » reprend depuis la fenêtre neuve.
 */

/** Ce que la page passe · le curseur de chaque fenêtre (`null` · la fenêtre contient tout). */
export type PaginationBibliotheque = FenetresBibliotheque;

interface Etat {
  base: DonneesDrive;
  extras: MediaSource[];
  pages: EtatPagesBibliotheque | null;
  enCours: string | null;
  erreur: { cle: string; texte: string } | null;
}

const depart = (base: DonneesDrive, fenetres: PaginationBibliotheque | null | undefined): Etat => ({ base, extras: [], pages: fenetres ? pagesInitiales(fenetres) : null, enCours: null, erreur: null });

export interface PagesBibliotheque {
  donnees: DonneesDrive;
  pages: EtatPagesBibliotheque | null;
  enCours: string | null;
  erreur: { cle: string; texte: string } | null;
  charger: (suite: SuiteListe) => Promise<void>;
}

export function usePagesBibliotheque(base: DonneesDrive, fenetres: PaginationBibliotheque | null | undefined): PagesBibliotheque {
  const [etat, setEtat] = useState<Etat>(() => depart(base, fenetres));
  // La page relue (nouvelles données) · les pages lues avant tombent, sur ce rendu même.
  let e = etat;
  if (etat.base !== base) { e = depart(base, fenetres); setEtat(e); }
  const donnees = useMemo(() => ajouterMedias(base, e.extras), [base, e.extras]);
  const vol = useRef<string | null>(null);

  const charger = useCallback(async (suite: SuiteListe) => {
    const demande = suite.demande;
    if (!demande || vol.current) return;
    vol.current = suite.cle;
    setEtat((x) => ({ ...x, enCours: suite.cle, erreur: null }));
    const r = await pageBibliothequeAction(demande).catch(() => ({ error: MESSAGE_PAGE.echec }));
    vol.current = null;
    setEtat((x) => {
      // La page a été relue entre-temps · cette page appartient aux données d'avant, elle n'entre pas.
      if (x.base !== base) return x;
      if ('error' in r) return { ...x, enCours: null, erreur: { cle: suite.cle, texte: r.error || MESSAGE_PAGE.echec } };
      return { ...x, enCours: null, extras: [...x.extras, ...r.medias], pages: x.pages ? appliquerPage(x.pages, suite.cle, r) : x.pages };
    });
  }, [base]);

  return { donnees, pages: e.pages, enCours: e.enCours, erreur: e.erreur, charger };
}

/** La recherche se lance seule (après une courte pause de frappe) · sa première page et son total, sur tout l'espace. */
export function useRechercheServeur(api: PagesBibliotheque, suite: SuiteListe | null): void {
  const attente = !!suite && suite.total === null && !!suite.demande && api.erreur?.cle !== suite.cle && api.enCours !== suite.cle;
  const cle = attente ? suite!.cle : null;
  const dernier = useRef(suite);
  dernier.current = suite;
  const { charger } = api;
  useEffect(() => {
    if (!cle) return;
    const t = setTimeout(() => { const s = dernier.current; if (s && s.cle === cle) void charger(s); }, 300);
    return () => clearTimeout(t);
  }, [cle, charger]);
}

/** Sous la liste · ce qui est affiché sur combien, et « Charger plus » tant qu'il reste des fichiers. */
export function ChargerPlus({ suite, api }: { suite: SuiteListe | null; api: Pick<PagesBibliotheque, 'enCours' | 'erreur' | 'charger'> }) {
  if (!suite) return null;
  const enCours = api.enCours === suite.cle;
  const erreur = api.erreur?.cle === suite.cle ? api.erreur.texte : null;
  const id = `suite-${suite.cle.replace(/[^\w-]/g, '_')}`;
  return (
    <div data-suite={suite.cle} style={{ display: 'grid', gap: 8, justifyItems: 'center', padding: '14px 0 4px', textAlign: 'center' }}>
      <small className="faint" id={id} role="status" aria-live="polite">{erreur ?? suite.texte}</small>
      {suite.demande && (suite.total !== null || erreur) && (
        <button className="btn" type="button" data-geste="charger-plus" aria-describedby={id} aria-busy={enCours || undefined} disabled={enCours} onClick={() => void api.charger(suite)}>
          <Ic n="down" />{enCours ? MESSAGE_PAGE.chargement : MESSAGE_PAGE.bouton}
        </button>
      )}
    </div>
  );
}
