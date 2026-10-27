'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { filtrerPalette, selectionVoisine, typeEntreePalette, type EntreePalette, type GroupePalette } from '@tiktrends/core';
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
 * simulation · absent. « Mon profil » (page réelle `/profile`) s'ajoute aux
 * boutons de la maquette.
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
      <div className="nact" style={{ marginTop: 2 }}>
        {equipe && <Lien className="btn sm" href={equipe}><Ic n="users" />Équipe</Lien>}
        {forfaits && <Lien className="btn sm" href={forfaits}><Ic n="spark" />Forfaits</Lien>}
        <Lien className="btn sm" href="/profile">Mon profil</Lien>
        {demarrage && <Lien className="btn sm" href={demarrage} data-obopen="1">Démarrage</Lien>}
        <button className="btn sm" type="button" style={{ marginLeft: 'auto' }} disabled={enCours} onClick={() => demarrer(() => deconnexion())}>
          {enCours ? 'Déconnexion…' : 'Se déconnecter'}
        </button>
      </div>
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
}

/**
 * La palette `#pal` · groupes de la maquette (Pages, Projets, Actions), vraies
 * destinations (`groupesPalette`, noyau). Flèches haut/bas déplacent la
 * sélection `.on`, Entrée l'ouvre, Échap ferme, un clic sur le voile ferme.
 */
export function Palette({ groupes, onNaviguer, onFermer, requeteInitiale = '' }: PaletteProps) {
  const [requete, setRequete] = useState(requeteInitiale);
  const [sel, setSel] = useState(0);
  const champ = useRef<HTMLInputElement>(null);
  const filtres = useMemo(() => filtrerPalette(groupes, requete), [groupes, requete]);
  const plats: EntreePalette[] = useMemo(() => filtres.flatMap((g) => g.entrees), [filtres]);
  useEffect(() => { champ.current?.focus(); }, []);
  useEffect(() => { setSel(0); }, [requete]);
  let k = -1;
  return (
    <div className="pal" id="pal" onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className="box glass" role="dialog" aria-label="Rechercher">
        <input id="palin" ref={champ} placeholder="Rechercher une page, un projet, une action…" autoComplete="off" aria-label="Rechercher"
          value={requete} onChange={(e) => setRequete(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => selectionVoisine(i, plats.length, e.key === 'ArrowDown' ? 1 : -1)); }
            else if (e.key === 'Enter') { const a = plats[sel]; if (a) { e.preventDefault(); onNaviguer(a.href); } }
          }} />
        <div className="res" id="palres">
          {plats.length ? filtres.map((g) => (
            <GroupeRendu key={g.titre} g={g} sel={sel} index={() => ++k} onNaviguer={onNaviguer} />
          )) : <p className="faint" style={{ padding: 12 }}>Aucun résultat pour « {requete} »</p>}
        </div>
      </div>
    </div>
  );
}

function GroupeRendu({ g, sel, index, onNaviguer }: { g: GroupePalette; sel: number; index: () => number; onNaviguer: (href: string) => void }) {
  return (
    <>
      <span className="g">{g.titre}</span>
      {g.entrees.map((e) => {
        const i = index();
        return (
          <a key={e.cle} href={e.href} data-palgo="" className={i === sel ? 'on' : undefined} aria-current={i === sel ? 'true' : undefined}
            onClick={(ev) => { if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return; ev.preventDefault(); onNaviguer(e.href); }}>
            <Ic n={e.icone} />{e.titre}<small>{typeEntreePalette(g.titre)}</small>
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
