'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  FILTRES_LOCAUX_VIDES, affichageCookieString, ecrireFiltresLocaux, lireFiltresLocaux, pucesLocales, retirerFiltreLocal, voisinsDetail,
  type AffichageVeille, type ControleLocal, type FiltresLocaux, type VoisinsDetail,
} from '@tiktrends/core';
import { FERME } from '../projet/focus';
import { Ic } from '../../communs';
import { rendreFocusPub } from './focus-pub';

export { ATTR_OUVRIR_DETAIL } from './focus-pub';

/**
 * Lot 7 V5 · les briques des filtres LOCAUX et du détail parcouru, partagées
 * par « Pubs du moment », « Ce qui scale » et la page d'un style. Aucune
 * action serveur ici · ce module s'importe sans tirer la Veille entière.
 * Les règles sont au noyau (`spatial/veille/filtres-locaux`).
 */

/** Précédente / suivante dans la liste COURANTE (`voisinsDetail`, noyau) · `aller` ouvre la pub voisine dans le même détail. */
export interface NavigationDetail { voisins: VoisinsDetail; aller: (cle: string) => void }

/* ───────────────────────── état des filtres, dans l'adresse ───────────────────────── */

export function useFiltresLocauxAdresse(initial: FiltresLocaux = FILTRES_LOCAUX_VIDES) {
  const [f, setF] = useState<FiltresLocaux>(initial);
  const premier = useRef(true);
  useEffect(() => {
    if (premier.current) { premier.current = false; return; }
    const suite = ecrireFiltresLocaux(window.location.search, f);
    window.history.replaceState(null, '', `${window.location.pathname}${suite}${window.location.hash}`);
  }, [f]);
  // Revenu par le Retour, le routeur peut restaurer le rendu serveur d'avant · l'adresse fait foi au montage.
  useEffect(() => {
    const lu = lireFiltresLocaux(Object.fromEntries(new URLSearchParams(window.location.search)));
    setF((x) => (JSON.stringify(x) === JSON.stringify(lu) ? x : lu));
  }, []);
  return [f, setF] as const;
}

/* ───────────────────────── le détail tenu par la liste ───────────────────────── */

/**
 * Le détail ouvert depuis une liste · `voisins` est calculé sur la liste
 * COURANTE (filtrée, dans l'ordre affiché) · à la fermeture, le focus revient
 * au bouton de la pub d'ORIGINE (celle qui a ouvert le détail).
 */
export function useDetailListe(cles: readonly string[]) {
  const [ouverte, setOuverte] = useState<string | null>(null);
  const origine = useRef<string | null>(null);
  const ouvrir = useCallback((cle: string) => { origine.current = cle; setOuverte(cle); }, []);
  const fermer = useCallback(() => { setOuverte(null); if (origine.current) rendreFocusPub(origine.current); }, []);
  const nav: NavigationDetail | null = ouverte ? { voisins: voisinsDetail(cles, ouverte), aller: setOuverte } : null;
  return { ouverte, ouvrir, fermer, nav };
}

/* ───────────────────────── contrôles de la barre ───────────────────────── */

const CIBLE = { minHeight: 44 } as const;

/** Un filtre à choix · fermé, le menu reste visible et sa raison est écrite à côté. */
export function ChoixLocal({ libelle, controle, valeur, changer, tous }: { libelle: string; controle: ControleLocal; valeur: string | null; changer: (v: string | null) => void; tous: string }) {
  const id = useId();
  const ferme = !controle.ouvert && valeur === null;
  return (
    <label className="field" style={{ flex: '1 1 170px', maxWidth: 300, minWidth: 0 }} data-filtre-local={libelle}>
      {libelle}
      <select value={valeur ?? ''} disabled={ferme} aria-describedby={ferme ? `${id}-r` : undefined} onChange={(e) => changer(e.target.value || null)} style={ferme ? FERME : undefined}>
        <option value="">{tous}</option>
        {controle.options.map((o) => <option key={o.valeur} value={o.valeur}>{`${o.libelle} · ${o.n}`}</option>)}
      </select>
      {ferme && controle.raison && <small id={`${id}-r`} className="faint" style={{ fontWeight: 500 }}>{controle.raison}</small>}
    </label>
  );
}

/** Un filtre à bascule (puce) · fermé, `aria-disabled` (focalisable) et sa raison à côté. */
export function BasculeLocale({ libelle, controle, actif, changer }: { libelle: string; controle: ControleLocal; actif: boolean; changer: (v: boolean) => void }) {
  const id = useId();
  const ferme = !controle.ouvert && !actif;
  const n = controle.options[0]?.n;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }} data-filtre-local={libelle}>
      <button type="button" className={`chip ${actif ? 'on' : ''}`.trim()} aria-pressed={actif} aria-disabled={ferme || undefined}
        aria-describedby={ferme ? `${id}-r` : undefined} style={{ ...CIBLE, ...(ferme ? FERME : {}) }}
        onClick={() => { if (!ferme) changer(!actif); }}>
        {libelle}{n != null && !ferme ? ` · ${n}` : ''}
      </button>
      {ferme && controle.raison && <small id={`${id}-r`} className="faint">{controle.raison}</small>}
    </span>
  );
}

/** La bascule Grille / Liste · le choix reste sur l'appareil (cookie d'ergonomie, comme le rail et le thème). */
export function BasculeAffichage({ affichage, changer }: { affichage: AffichageVeille; changer: (a: AffichageVeille) => void }) {
  const choisir = (a: AffichageVeille) => {
    changer(a);
    try { document.cookie = affichageCookieString(a); } catch { /* cookie refusé · le choix vaut pour cette page */ }
  };
  return (
    <span role="group" aria-label="Affichage" style={{ display: 'inline-flex', gap: 6 }} data-bascule-affichage>
      <button type="button" className="chip" aria-pressed={affichage === 'grille'} style={CIBLE} onClick={() => choisir('grille')}><Ic n="grid" />Grille</button>
      <button type="button" className="chip" aria-pressed={affichage === 'liste'} style={CIBLE} onClick={() => choisir('liste')}><Ic n="text" />Liste</button>
    </span>
  );
}

/** L'état visible des filtres · une puce retirable par filtre posé, et « Réinitialiser ». */
export function EtatFiltresLocaux({ f, changer, compte }: { f: FiltresLocaux; changer: (f: FiltresLocaux) => void; compte: string }) {
  const puces = pucesLocales(f);
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {puces.map((p) => (
        <button key={p.cle} type="button" className="chip on" style={CIBLE} aria-label={`Retirer le filtre · ${p.libelle}`} onClick={() => changer(retirerFiltreLocal(f, p.cle))}>{p.libelle}<Ic n="x" /></button>
      ))}
      <small className="faint" data-compte-local role="status" style={{ marginLeft: 'auto', fontSize: '12.5px' }}>{compte}</small>
      {puces.length > 0 && <button type="button" className="btn sm" data-reinitialiser-local style={CIBLE} onClick={() => changer({ ...FILTRES_LOCAUX_VIDES })}>Réinitialiser</button>}
    </div>
  );
}

export function VideLocal({ chargees, reinitialiser }: { chargees: number; reinitialiser: () => void }) {
  return (
    <div className="tile" data-vide-local><div className="dempty">
      <h3>Aucune pub chargée ne passe ces filtres</h3>
      <p className="muted">{chargees} pub{chargees > 1 ? 's' : ''} chargée{chargees > 1 ? 's' : ''} sur cet écran · retire un filtre pour en revoir.</p>
      <button type="button" className="btn sm" style={CIBLE} onClick={reinitialiser}>Réinitialiser les filtres</button>
    </div></div>
  );
}

