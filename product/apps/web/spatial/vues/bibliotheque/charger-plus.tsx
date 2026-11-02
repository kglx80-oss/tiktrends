'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ajouterMedias, appliquerPage, MESSAGE_PAGE, noterListeChargee, pagesApresRelecture, pagesInitiales, profondeurApresPage, relecturesApresGeste,
  type DemandePageBibliotheque, type DonneesDrive, type EtatPagesBibliotheque, type FenetresBibliotheque, type ListeChargee, type MediaSource, type PageBibliotheque, type SuiteListe,
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
 * Après un geste, la page se relit (`router.refresh`) · un fichier lu avant
 * le geste a pu changer (nom, dossier, corbeille), ses pages ne valent plus.
 * Chaque liste chargée se RELIT alors jusqu'à la même profondeur (noyau ·
 * `relecturesApresGeste`, borne `PROFONDEUR_MAX_BIBLIOTHEQUE`), depuis son
 * début, en une requête · ni doublon ni trou. Pendant cette relecture l'écran
 * garde les fichiers qu'il montrait (la liste ne se replie pas, le défilement
 * reste où il est) et « Charger plus » attend · puis les fichiers relus
 * remplacent les anciens. Une relecture refusée revient à la fenêtre neuve et
 * le dit.
 */

/** Ce que la page passe · le curseur de chaque fenêtre (`null` · la fenêtre contient tout). */
export type PaginationBibliotheque = FenetresBibliotheque;

type Relecture = Array<{ cle: string; demande: DemandePageBibliotheque }>;

interface Etat {
  base: DonneesDrive;
  extras: MediaSource[];
  pages: EtatPagesBibliotheque | null;
  /** Les listes lues par « Charger plus » (ou la recherche), la plus récente d'abord, et leur profondeur. */
  listes: ListeChargee[];
  /** La page s'est relue · ce qu'il faut relire (`null` · rien en cours). */
  relecture: Relecture | null;
  enCours: string | null;
  erreur: { cle: string; texte: string } | null;
}

const depart = (base: DonneesDrive, fenetres: PaginationBibliotheque | null | undefined): Etat => ({ base, extras: [], pages: fenetres ? pagesInitiales(fenetres) : null, listes: [], relecture: null, enCours: null, erreur: null });

/** La page relue · relire chaque liste chargée à sa profondeur, en gardant d'ici là ce que l'écran montrait. */
function apresRelecturePage(avant: Etat, base: DonneesDrive, fenetres: PaginationBibliotheque | null | undefined): Etat {
  const relecture = fenetres && avant.pages ? relecturesApresGeste(avant.listes) : [];
  if (!relecture.length) return depart(base, fenetres);
  return { ...avant, base, relecture, enCours: relecture[0]!.cle, erreur: null };
}

export interface PagesBibliotheque {
  donnees: DonneesDrive;
  pages: EtatPagesBibliotheque | null;
  enCours: string | null;
  erreur: { cle: string; texte: string } | null;
  charger: (suite: SuiteListe) => Promise<void>;
}

const lirePage = (d: DemandePageBibliotheque): Promise<PageBibliotheque | { error: string }> => pageBibliothequeAction(d).catch(() => ({ error: MESSAGE_PAGE.echec }));

export function usePagesBibliotheque(base: DonneesDrive, fenetres: PaginationBibliotheque | null | undefined): PagesBibliotheque {
  const [etat, setEtat] = useState<Etat>(() => depart(base, fenetres));
  // La page relue (nouvelles données) · sur ce rendu même, les listes chargées partent en relecture.
  let e = etat;
  if (etat.base !== base) { e = apresRelecturePage(etat, base, fenetres); setEtat(e); }
  const donnees = useMemo(() => ajouterMedias(base, e.extras), [base, e.extras]);
  const vol = useRef<string | null>(null);
  const relit = useRef(false);
  relit.current = !!e.relecture;

  // La relecture · chaque liste depuis son début, à sa profondeur · le résultat remplace les pages d'avant.
  const relecture = e.relecture;
  useEffect(() => {
    if (!relecture) return;
    let vivant = true;
    void (async () => {
      const relues: Array<Relecture[number] & { page: PageBibliotheque }> = [];
      for (const r of relecture) {
        const page = await lirePage(r.demande);
        if (!vivant) return;
        if ('error' in page) {
          setEtat((x) => (x.base !== base || x.relecture !== relecture ? x : { ...depart(base, fenetres), erreur: { cle: r.cle, texte: page.error || MESSAGE_PAGE.echec } }));
          return;
        }
        relues.push({ ...r, page });
      }
      setEtat((x) => {
        // La page a encore été relue entre-temps · une autre relecture est partie, celle-ci n'entre pas.
        if (x.base !== base || x.relecture !== relecture || !fenetres) return x;
        const { pages, listes } = pagesApresRelecture(fenetres, relues);
        return { ...x, extras: relues.flatMap((r) => r.page.medias), pages, listes, relecture: null, enCours: null, erreur: null };
      });
    })();
    return () => { vivant = false; };
  }, [relecture, base, fenetres]);

  const charger = useCallback(async (suite: SuiteListe) => {
    const demande = suite.demande;
    if (!demande || vol.current || relit.current) return;
    vol.current = suite.cle;
    setEtat((x) => ({ ...x, enCours: suite.cle, erreur: null }));
    const r = await lirePage(demande);
    vol.current = null;
    setEtat((x) => {
      // La page a été relue entre-temps · cette page appartient aux données d'avant, elle n'entre pas.
      if (x.base !== base) return x;
      if ('error' in r) return { ...x, enCours: null, erreur: { cle: suite.cle, texte: r.error || MESSAGE_PAGE.echec } };
      const liste: ListeChargee = { cle: suite.cle, portee: demande.portee, filtre: demande.filtre, profondeur: profondeurApresPage(suite.affiches, r.medias.length) };
      return { ...x, enCours: null, extras: [...x.extras, ...r.medias], listes: noterListeChargee(x.listes, liste), pages: x.pages ? appliquerPage(x.pages, suite.cle, r) : x.pages };
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
  // Une seule lecture à la fois · pendant une autre (relecture après un geste comprise), le bouton attend.
  const occupe = api.enCours !== null;
  const erreur = api.erreur?.cle === suite.cle ? api.erreur.texte : null;
  const id = `suite-${suite.cle.replace(/[^\w-]/g, '_')}`;
  return (
    <div data-suite={suite.cle} style={{ display: 'grid', gap: 8, justifyItems: 'center', padding: '14px 0 4px', textAlign: 'center' }}>
      <small className="faint" id={id} role="status" aria-live="polite">{erreur ?? suite.texte}</small>
      {suite.demande && (suite.total !== null || erreur) && (
        <button className="btn" type="button" data-geste="charger-plus" aria-describedby={id} aria-busy={enCours || undefined} disabled={occupe} onClick={() => void api.charger(suite)}>
          <Ic n="down" />{enCours ? MESSAGE_PAGE.chargement : MESSAGE_PAGE.bouton}
        </button>
      )}
    </div>
  );
}
