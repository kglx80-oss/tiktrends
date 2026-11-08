'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  COLONNES_LISTE_VEILLE, FILTRES_LOCAUX_VIDES, LARGEUR_MIN_LISTE_VEILLE, compteLocal, controlesLocaux, filtrerLocal, ligneListeVeille,
  pucesLocales, styleTableDefilante, type AffichageVeille, type FiltresLocaux, type PubLocale,
} from '@tiktrends/core';
import { CarteVeille, DetailVeille, IconeSauvegarde, Portail, type MajCarte } from './client';
import type { EtatSauvegarde } from './sauvegarde-client';
import {
  ATTR_OUVRIR_DETAIL, BasculeAffichage, BasculeLocale, ChoixLocal, EtatFiltresLocaux, VideLocal, useDetailListe, useFiltresLocauxAdresse,
} from './filtres-locaux-client';
import { Vignette } from './base';
import type { CarteVeilleDonnees } from './types';

/**
 * Lot 7 V5 · Veille · filtres LOCAUX, vue liste, précédente / suivante dans le
 * détail. Tout se joue sur ce que l'écran a DÉJÀ lu · aucune requête à la
 * source, aucun appel payant (les règles sont au noyau, `filtres-locaux`).
 * L'adresse garde les filtres (`history.replaceState`, comme « Ce qui
 * scale ») · un rechargement ou un Retour retrouve la même vue, sans relancer
 * la recherche.
 */

/* ───────────────────────── vue liste ───────────────────────── */

const COLONNES = 'minmax(150px,1.4fr) .7fr .7fr .9fr .9fr minmax(160px,2fr) 112px';

/** La vue liste · mêmes pubs, même ordre que la grille · le tableau défile dans son cadre au téléphone. */
export function ListeVeille({ cartes, ouvrir, maj }: { cartes: ReadonlyArray<CarteVeilleDonnees>; ouvrir: (cle: string) => void; maj?: MajCarte }) {
  return (
    <div className="tile" data-vue-liste>
      <div className="atable" data-table="veille-liste" style={styleTableDefilante(LARGEUR_MIN_LISTE_VEILLE)} role="table" aria-label="Pubs chargées">
        <div className="atr ath" role="row" style={{ gridTemplateColumns: COLONNES }}>{COLONNES_LISTE_VEILLE.map((t, i) => <span key={i} role="columnheader">{t}</span>)}</div>
        {cartes.map((c) => {
          const l = ligneListeVeille(c.ad);
          return (
            <div className="atr" role="row" key={c.cle} data-ligne-liste={c.cle} style={{ gridTemplateColumns: COLONNES }}>
              <span role="cell" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 40, flex: '0 0 40px' }}><Vignette image={c.image} /></span>
                <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.marque.nom}</b>
              </span>
              <span role="cell">{l.plateforme}</span>
              <span role="cell">{l.format}</span>
              <span role="cell">{l.diffusion}</span>
              <span role="cell">{c.cta ?? <span className="faint">Aucun</span>}</span>
              <span role="cell" title={c.texte ?? undefined} style={{ whiteSpace: 'nowrap' }}>{c.texte ?? <span className="faint">Texte non fourni</span>}</span>
              <span role="cell" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <IconeSauvegarde ad={c.ad} initial={c.sauvee} apercu={{ image: c.image, marque: c.marque, texte: c.texte }} changer={(e) => maj?.(c.cle, e)} />
                <button type="button" className="btn sm" {...{ [ATTR_OUVRIR_DETAIL]: c.cle }} aria-label={`Voir le détail de la pub ${c.marque.nom}`} style={{ minHeight: 44 }} onClick={() => ouvrir(c.cle)}>Voir</button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── « Pubs du moment » ───────────────────────── */

/** Ce que les filtres locaux de « Pubs du moment » regardent d'une carte · appel à l'action (V19) et sauvegarde (V21). */
const pubLocaleCarte = (c: CarteVeilleDonnees): PubLocale => ({ cta: c.cta, sauvee: c.sauvee, plateforme: c.ad.platform, pays: c.pays, jours: c.ad.daysRunning ?? null, suivie: c.suivie, tags: c.tags ?? [] });

export interface PropsResultatsVeille {
  cartes: ReadonlyArray<CarteVeilleDonnees>;
  coutJarvis: string;
  /** Les filtres locaux lus dans l'adresse par la page (`lireFiltresLocaux`). */
  initial?: FiltresLocaux;
  /** La préférence de l'appareil (`affichageDepuisCookie`), lue au rendu serveur. */
  affichage?: AffichageVeille;
}

export function ResultatsVeille({ cartes: lues, coutJarvis, initial, affichage: affichageInitial = 'grille' }: PropsResultatsVeille) {
  // Lot 6 · ce que la pop-up « Sauvegarder » a fait accepter au serveur, carte par carte · le filtre « Tags »
  // et « Masquer déjà sauvegardées » le voient aussitôt, sans relancer la recherche.
  const [majs, setMajs] = useState<Record<string, EtatSauvegarde>>({});
  const maj: MajCarte = (cle, e) => setMajs((m) => ({ ...m, [cle]: e }));
  const cartes = useMemo(() => lues.map((c) => (majs[c.cle] ? { ...c, sauvee: majs[c.cle]!.sauvee, tags: majs[c.cle]!.tags } : c)), [lues, majs]);
  const [f, setF] = useFiltresLocauxAdresse(initial);
  const [affichage, setAffichage] = useState<AffichageVeille>(affichageInitial);
  const ctl = useMemo(() => controlesLocaux(cartes.map(pubLocaleCarte)), [cartes]);
  const visibles = useMemo(() => filtrerLocal(cartes, f, pubLocaleCarte), [cartes, f]);
  const cles = useMemo(() => visibles.map((c) => c.cle), [visibles]);
  const d = useDetailListe(cles);
  const ouverte = d.ouverte ? cartes.find((c) => c.cle === d.ouverte) ?? null : null;
  const actifs = pucesLocales(f).length;
  const tagsCtl = ctl.tags;
  const reinitialiser = () => setF({ ...FILTRES_LOCAUX_VIDES });
  let contenu: ReactNode;
  if (visibles.length === 0) contenu = <VideLocal chargees={cartes.length} reinitialiser={reinitialiser} />;
  else if (affichage === 'liste') contenu = <ListeVeille cartes={visibles} ouvrir={d.ouvrir} maj={maj} />;
  else contenu = <div className="xgrid">{visibles.map((c) => <CarteVeille key={c.cle} c={c} coutJarvis={coutJarvis} ouvrir={() => d.ouvrir(c.cle)} maj={maj} />)}</div>;
  const nomsTags = useMemo(() => new Map(cartes.flatMap((c) => (c.tags ?? []).map((t) => [t.cle, t.nom] as const))), [cartes]);
  return (
    <>
      <section className="tile" data-filtres-locaux aria-label="Filtrer les pubs chargées" style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <ChoixLocal libelle="Appel à l’action" controle={ctl.cta} valeur={f.cta} tous="Tous les appels à l’action" changer={(v) => setF((x) => ({ ...x, cta: v }))} />
          <BasculeLocale libelle="Masquer déjà sauvegardées" controle={ctl.sauvees} actif={f.masquerSauvees} changer={(v) => setF((x) => ({ ...x, masquerSauvees: v }))} />
          <ChoixLocal libelle="Tags" controle={tagsCtl} valeur={f.tag ?? null} tous="Tous les tags" changer={(v) => setF((x) => ({ ...x, tag: v }))} />
          <span style={{ marginLeft: 'auto' }}><BasculeAffichage affichage={affichage} changer={setAffichage} /></span>
        </div>
        <EtatFiltresLocaux f={f} changer={setF} nomsTags={nomsTags} compte={`${compteLocal(visibles.length, cartes.length, actifs)} · filtre sur cette page, la recherche n’est pas relancée`} />
      </section>
      {contenu}
      {ouverte && d.nav && <Portail><DetailVeille c={ouverte} coutJarvis={coutJarvis} fermer={d.fermer} nav={d.nav} maj={maj} /></Portail>}
    </>
  );
}
