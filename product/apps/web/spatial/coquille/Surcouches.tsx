'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { ATTRIBUT_PREFERENCE_THEME, COULEUR_BARRE_SPATIALE, PREFERENCES_THEME, filtrerPalette, selectionVoisine, typeEntreePalette, type EntreePalette, type GroupePalette, type PreferenceTheme } from '@tiktrends/core';
import { appliquerTheme, preferenceCourante } from '../../lib/theme-preference';
import { Ic, Lien } from '../communs/base';

/**
 * Les surcouches simples de la coquille, au DOM de la maquette :
 *  · `MenuProfil` · `#memenu` (`renderMe`, fragment `_profil.html`) ;
 *  · `Palette` · `#pal` (`openPal` / `palFill`, fragments `_palette*.html`) ;
 *  · `FeuilleMarques`, `FeuilleModules` · `#sheet` (`openSheet`, fragments
 *    `_feuille-*.html`).
 * Données et décisions viennent de la coquille (réelles) et du noyau.
 */

/* ───────────── Menu profil ───────────── */

export interface MenuProfilProps {
  utilisateur: { nom: string; initiales: string; email: string; role: string };
  /** Liens réels, chacun selon l'accès · `null` = absent. */
  equipe: string | null;
  forfaits: string | null;
  /** Reprise volontaire du parcours d'accueil (`/onboarding?redo=1`). */
  demarrage: string | null;
  deconnexion: () => Promise<void>;
}

/**
 * Le menu profil · vrai nom, vrai e-mail, vrai rôle, vraie déconnexion.
 * L'« Aperçu du rôle » de la maquette (changer de rôle pour voir) est une
 * simulation · absent. « Mon profil » (page réelle `/profile`) et « Support »
 * (les tickets de l'espace, `/support`, ouverts à toute session) s'ajoutent aux
 * boutons de la maquette. À la place de l'aperçu, le choix du THÈME (`ChoixTheme`).
 */
export function MenuProfil({ utilisateur, equipe, forfaits, demarrage, deconnexion }: MenuProfilProps) {
  const [enCours, demarrer] = useTransition();
  return (
    <>
      <header className="nhd">
        <span className="me" style={{ width: 44, height: 44 }}>{utilisateur.initiales}</span>
        <div style={{ display: 'grid' }}>
          <strong style={{ font: '600 15px var(--sfd)' }}>{utilisateur.nom || utilisateur.email}</strong>
          <small className="faint">{utilisateur.email} · {utilisateur.role}</small>
        </div>
      </header>
      <ChoixTheme />
      <div className="nact" style={{ marginTop: 2 }}>
        {equipe && <Lien className="btn sm" href={equipe}><Ic n="users" />Équipe</Lien>}
        {forfaits && <Lien className="btn sm" href={forfaits}><Ic n="spark" />Forfaits</Lien>}
        <Lien className="btn sm" href="/profile">Mon profil</Lien>
        <Lien className="btn sm" href="/support">Support</Lien>
        {demarrage && <Lien className="btn sm" href={demarrage} data-obopen="1">Démarrage</Lien>}
        <button className="btn sm" type="button" style={{ marginLeft: 'auto' }} disabled={enCours} onClick={() => demarrer(() => deconnexion())}>
          {enCours ? 'Déconnexion…' : 'Se déconnecter'}
        </button>
      </div>
    </>
  );
}

const THEME_LIBELLE: Record<PreferenceTheme, { titre: string; detail: string }> = {
  sombre: { titre: 'Sombre', detail: 'Verre sombre sur ta créa' },
  clair: { titre: 'Clair', detail: 'Verre clair, encre nuit' },
  auto: { titre: 'Auto', detail: 'Suit le réglage de ton appareil' },
};

/** L'annonce d'un thème appliqué · lue par la pop-up, la palette, les Réglages. */
function annonceTheme(p: PreferenceTheme): string {
  return p === 'auto' ? 'Thème auto appliqué · il suit ton appareil' : `Thème ${THEME_LIBELLE[p].titre.toLowerCase()} appliqué`;
}

/**
 * Le thème de l'interface (« Sombre » · « Clair » · « Auto »), comme dans
 * l'ancienne pop-up profil (`BasculeTheme`), au DOM de la maquette · l'« Aperçu
 * du rôle » (`.ngrp` + `.nprefs` de boutons `.npr.rolebtn` à `aria-pressed`).
 * Le choix passe par le mécanisme EXISTANT, `appliquerTheme` · cookie
 * `tt_theme` relu au rendu serveur suivant (`<html data-theme>` posé dès le
 * premier octet, aucun flash ; « auto » résolu par le script de `<head>`),
 * attribut sur `<html>` tout de suite (la feuille `spatial-clair.css`
 * s'applique sans rechargement) et barre du navigateur (`COULEUR_BARRE_SPATIALE`).
 *
 * Servi à deux endroits · la pop-up profil (montée à l'ouverture, côté client ·
 * la préférence se lit sur `<html>`) et la section « Apparence » des Réglages
 * et de « Mon profil » (rendue au serveur · `initiale` vient du cookie, même
 * HTML à l'hydratation). Un choix fait ailleurs (palette, autre instance) est
 * suivi · l'état relit `data-theme-pref` quand il change.
 */
export function ChoixTheme({ initiale, idGroupe = 'ngrp-theme' }: { initiale?: PreferenceTheme; idGroupe?: string } = {}) {
  const [pref, setPref] = useState<PreferenceTheme>(() => initiale ?? (typeof document === 'undefined' ? 'sombre' : preferenceCourante()));
  const [annonce, setAnnonce] = useState('');
  useEffect(() => {
    const suivre = () => setPref(preferenceCourante());
    suivre();
    const o = new MutationObserver(suivre);
    o.observe(document.documentElement, { attributes: true, attributeFilter: [ATTRIBUT_PREFERENCE_THEME] });
    return () => o.disconnect();
  }, []);
  const choisir = (t: PreferenceTheme) => {
    setPref(appliquerTheme(t, document, COULEUR_BARRE_SPATIALE));
    setAnnonce(annonceTheme(t));
  };
  return (
    <>
      <div className="ngrp" id={idGroupe}>Thème</div>
      <div className="nprefs" role="group" aria-labelledby={idGroupe} data-zone="choix-theme">
        {PREFERENCES_THEME.map((t) => (
          <button key={t} type="button" className="npr rolebtn" data-theme-choix={t} aria-pressed={pref === t} onClick={() => choisir(t)}>
            <div><strong>{THEME_LIBELLE[t].titre}</strong><small>{THEME_LIBELLE[t].detail}</small></div>
            <span className="pk-r"><i></i></span>
          </button>
        ))}
      </div>
      <span className="sr" role="status" aria-live="polite">{annonce}</span>
    </>
  );
}

/* ───────────── Palette ⌘K ───────────── */

export interface PaletteProps {
  groupes: GroupePalette[];
  onNaviguer: (href: string) => void;
  onFermer: () => void;
  /** Requête initiale (tests) · vide par défaut. */
  requeteInitiale?: string;
  /** Après une commande de thème appliquée (groupe « Apparence ») · son annonce. */
  onTheme?: (annonce: string) => void;
}

/**
 * La palette `#pal` · groupes de la maquette (Pages, Projets, Actions), vraies
 * destinations (`groupesPalette`, noyau). Flèches haut/bas déplacent la
 * sélection `.on`, Entrée l'ouvre, Échap ferme, un clic sur le voile ferme.
 * Une commande de thème (`theme`) s'applique sur place (`appliquerTheme`) puis
 * ferme la palette · la préférence courante porte « · actif ».
 */
export function Palette({ groupes, onNaviguer, onFermer, requeteInitiale = '', onTheme }: PaletteProps) {
  const [requete, setRequete] = useState(requeteInitiale);
  const [sel, setSel] = useState(0);
  const champ = useRef<HTMLInputElement>(null);
  const filtres = useMemo(() => filtrerPalette(groupes, requete), [groupes, requete]);
  const plats: EntreePalette[] = useMemo(() => filtres.flatMap((g) => g.entrees), [filtres]);
  useEffect(() => { champ.current?.focus(); }, []);
  useEffect(() => { setSel(0); }, [requete]);
  const [actif, setActif] = useState<PreferenceTheme | null>(null);
  useEffect(() => { setActif(preferenceCourante()); }, []);
  const ouvrir = (e: EntreePalette) => {
    if (!e.theme) { onNaviguer(e.href); return; }
    appliquerTheme(e.theme, document, COULEUR_BARRE_SPATIALE);
    onTheme?.(annonceTheme(e.theme));
    onFermer();
  };
  let k = -1;
  return (
    <div className="pal" id="pal" onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className="box glass" role="dialog" aria-label="Rechercher">
        <input id="palin" ref={champ} placeholder="Rechercher une page, un projet, une action…" autoComplete="off" aria-label="Rechercher"
          value={requete} onChange={(e) => setRequete(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => selectionVoisine(i, plats.length, e.key === 'ArrowDown' ? 1 : -1)); }
            else if (e.key === 'Enter') { const a = plats[sel]; if (a) { e.preventDefault(); ouvrir(a); } }
          }} />
        <div className="res" id="palres">
          {plats.length ? filtres.map((g) => (
            <GroupeRendu key={g.titre} g={g} sel={sel} index={() => ++k} ouvrir={ouvrir} actif={actif} />
          )) : <p className="faint" style={{ padding: 12 }}>Aucun résultat pour « {requete} »</p>}
        </div>
      </div>
    </div>
  );
}

function GroupeRendu({ g, sel, index, ouvrir, actif }: { g: GroupePalette; sel: number; index: () => number; ouvrir: (e: EntreePalette) => void; actif: PreferenceTheme | null }) {
  return (
    <>
      <span className="g">{g.titre}</span>
      {g.entrees.map((e) => {
        const i = index();
        return (
          <a key={e.cle} href={e.href} data-palgo="" className={i === sel ? 'on' : undefined} aria-current={i === sel ? 'true' : undefined}
            data-theme-commande={e.theme}
            onClick={(ev) => { if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return; ev.preventDefault(); ouvrir(e); }}>
            <Ic n={e.theme && e.theme === actif ? 'check' : e.icone} />{e.titre}<small>{typeEntreePalette(g.titre)}{e.theme && e.theme === actif ? ' · actif' : ''}</small>
          </a>
        );
      })}
    </>
  );
}

/* ───────────── Feuilles (#sheet) ───────────── */

export function FeuilleMarques({ marques, active, ajouter, onChoisir }: {
  marques: Array<{ id: string; nom: string }>;
  active: string | null;
  /** « Ajouter une marque » · page réelle, pour qui peut créer une marque. */
  ajouter: string | null;
  onChoisir: (id: string) => void;
}) {
  return (
    <>
      <strong>Changer de marque</strong>
      {marques.map((m) => (
        <a key={m.id} href="/dashboard" aria-current={m.id === active ? 'true' : undefined} onClick={(ev) => { ev.preventDefault(); onChoisir(m.id); }}>
          <Ic n={m.id === active ? 'check' : 'tag'} />{m.nom}
        </a>
      ))}
      {ajouter && <Lien href={ajouter}><Ic n="plus" />Ajouter une marque</Lien>}
    </>
  );
}

export function FeuilleModules({ modules }: { modules: EntreePalette[] }) {
  return (
    <>
      <strong>Tous les modules</strong>
      {modules.map((m) => <Lien key={m.cle} href={m.href}><Ic n={m.icone} />{m.titre}</Lien>)}
    </>
  );
}
