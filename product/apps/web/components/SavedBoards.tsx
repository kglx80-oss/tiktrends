'use client';

import { useEffect, useId, useMemo, useRef, useState, useTransition, type CSSProperties } from 'react';
import { correspondSauvegarde, lireCriteresSauvegardes, ecrireCriteresSauvegardes, BOARD_TOUS, BOARD_SANS, cibleSelonPointeur } from '@tiktrends/core';
import { useIsMobile } from './useIsMobile';
import { Icon } from './Icon';
import { trackSavedAdAction } from '../app/actions/adsmap-bridge';
import type { InspoAd } from '@tiktrends/integrations';
import type { LectureFormat } from '@tiktrends/core';
import { FormatChoix } from '../app/(app)/saved/FormatChoix';
import { AdCard } from './AdCard';
import { setSavedAdFolder } from '../app/actions/inspo';
import { Empty } from './Empty';
import { useToast } from './Toast';
import { remplacerRecherche } from '../lib/url-client';

export interface SavedItem { id: string; ad: InspoAd; folder: string | null; externalId: string; platform: string; format?: LectureFormat }

/**
 * Boards / dossiers de rangement pour les créas sauvegardées (façon Foreplay/Atria).
 * Onglets par board + rangement d'une créa dans un board (existant ou nouveau), en direct.
 */
export function SavedBoards({ items, followKeys, adsmap = false, refusAdsmap = null, formatIndisponible = null }: { items: SavedItem[]; followKeys: string[]; adsmap?: boolean;
  /**
   * Lot 20B · pont Adsmap fermé · l'explication calculée côté serveur (raison
   * réelle, texte du noyau) affichée à la place du bouton · jamais recalculée
   * ici. Ignorée quand `adsmap` est ouvert.
   */
  refusAdsmap?: string | null;
  /** Lot 19C · raison calculée côté serveur quand le classement par format n'est pas ouvert (sans Veille) · `null` = ouvert. */
  formatIndisponible?: string | null }) {
  const [list, setList] = useState<SavedItem[]>(items);
  const [tab, setTab] = useState<string>(BOARD_TOUS);
  // 44 px au doigt, densité gardée à la souris (recette #106, point 6).
  const tactile = useIsMobile('(pointer: coarse), (max-width: 768px)');
  const cible = cibleSelonPointeur(tactile);
  const [, start] = useTransition();
  const { toast } = useToast();
  const following = useMemo(() => new Set(followKeys), [followKeys]);

  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const it of list) if (it.folder) set.add(it.folder);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [list]);

  const [q, setQ] = useState('');
  // Board et recherche vivent dans l'URL (`filtres-url`) · relus au montage,
  // REMPLACÉS à chaque changement · revenir du Studio les retrouve.
  useEffect(() => {
    const c = lireCriteresSauvegardes(window.location.search);
    setTab(c.board); setQ(c.recherche);
  }, []);
  const garderDansUrl = (board: string, recherche: string) => {
    remplacerRecherche(ecrireCriteresSauvegardes(window.location.search, { board, recherche }));
  };
  const choisirBoard = (b: string) => { setTab(b); garderDansUrl(b, q); };
  const chercher = (v: string) => { setQ(v); garderDansUrl(tab, v); };
  const countIn = (f: string) => f === '__all' ? list.length : f === '__none' ? list.filter((i) => !i.folder).length : list.filter((i) => i.folder === f).length;
  const dansBoard = list.filter((it) => tab === '__all' ? true : tab === '__none' ? !it.folder : it.folder === tab);
  // La recherche s'applique APRÈS le board · on cherche dans ce qu'on regarde.
  const shown = dansBoard.filter((it) => correspondSauvegarde(
    { advertiserName: it.ad.advertiserName, body: it.ad.body, callToAction: it.ad.callToAction, landingDomain: it.ad.landingDomain, folder: it.folder },
    q,
  ));
  const filtre = q.trim().length > 0;

  // Veille → ADSMAP : une pub concurrente devient un concept « imitation ».
  const [suivi, setSuivi] = useState<Record<string, 'busy' | 'done' | string>>({});
  const suivre = async (it: SavedItem) => {
    const cle = `${it.platform}:${it.externalId}`;
    if (suivi[cle]) return;
    setSuivi((x) => ({ ...x, [cle]: 'busy' }));
    const r = await trackSavedAdAction({ platform: it.platform, externalId: it.externalId });
    setSuivi((x) => ({ ...x, [cle]: r.error ?? 'done' }));
  };

  const barreRef = useRef<HTMLDivElement>(null);
  const focusOngletActif = () => barreRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus();
  // L'onglet AFFICHÉ, lu après la réponse du serveur (la fermeture de `move`
  // garde celui du clic) · et le focus rendu APRÈS le rendu de la restauration
  // (l'onglet rendu n'est pressé qu'une fois le rendu appliqué).
  const tabRef = useRef(tab);
  const focusApresRendu = useRef(false);
  useEffect(() => {
    tabRef.current = tab;
    if (focusApresRendu.current) { focusApresRendu.current = false; focusOngletActif(); }
  }, [tab, list]);
  const move = (it: SavedItem, folder: string | null) => {
    // Même troncature que côté serveur, pour que l'affichage corresponde après rechargement.
    const value = folder?.trim().slice(0, 60) || null;
    // Rangée ailleurs, la créa QUITTE le board regardé, et son sélecteur avec
    // elle · le focus tombait en haut de page (mesuré, recette #106 point 6).
    // Il revient au board courant.
    const quitteLaVue = tab !== BOARD_TOUS && (tab === BOARD_SANS ? value !== null : value !== tab);
    if (quitteLaVue) setTimeout(focusOngletActif, 0);
    const ongletAvant = tab;
    setList((l) => {
      const next = l.map((x) => (x.externalId === it.externalId && x.platform === it.platform ? { ...x, folder: value } : x));
      // Board vidé de sa dernière créa : on revient sur « Toutes » (l'onglet disparaît).
      // « Sans dossier » vidé aussi · l'onglet disparaissait et la vue restait
      // bloquée sur « Aucune créa pour cette recherche » sans recherche.
      const vide = tab === BOARD_SANS ? !next.some((x) => !x.folder) : tab !== BOARD_TOUS && !next.some((x) => x.folder === tab);
      if (vide) { setTab(BOARD_TOUS); garderDansUrl(BOARD_TOUS, q); }
      return next;
    });
    const avant = it.folder;
    // Remet la créa dans son board d'origine (l'onglet de ce board réapparaît
    // avec elle) · même geste pour un refus et pour une exception.
    // Lot 20B · l'onglet vidé par le déplacement optimiste avait basculé sur
    // « Toutes » · la créa revenait, pas l'onglet (ni l'URL, ni le focus). On
    // rend l'onglet d'avant le geste, s'il est encore celui de la bascule (un
    // autre onglet choisi entre-temps est respecté) · la recherche en cours est
    // relue dans l'URL, pas dans la fermeture.
    const restaurer = () => {
      setList((l) => l.map((x) => (x.externalId === it.externalId && x.platform === it.platform ? { ...x, folder: avant } : x)));
      if (ongletAvant !== BOARD_TOUS && tabRef.current === BOARD_TOUS) {
        setTab(ongletAvant);
        garderDansUrl(ongletAvant, lireCriteresSauvegardes(window.location.search).recherche);
      }
      const dansLaBarre = !document.activeElement || document.activeElement === document.body || !!barreRef.current?.contains(document.activeElement);
      if (quitteLaVue && dansLaBarre) focusApresRendu.current = true;
    };
    start(async () => {
      let r: Awaited<ReturnType<typeof setSavedAdFolder>>;
      try {
        r = await setSavedAdFolder({ platform: it.platform, externalId: it.externalId, folder: value });
      } catch {
        // Message 60 · une exception (réseau, serveur) laissait la créa affichée
        // dans le nouveau board, sans retour (et l'erreur remontait de la
        // transition) · même traitement qu'un refus, avec la raison générique.
        restaurer();
        toast('Rangement non enregistré · vérifie ta connexion puis réessaie.', 'err');
        return;
      }
      // Message 56 · un refus du serveur (rôle, autre marque) remet la créa dans
      // son board et se dit · jamais de « Rangé dans… » sur un non.
      if (r && r.ok === false) {
        restaurer();
        toast(r.error, 'err');
        return;
      }
      // Le rangement se voit à l'onglet, mais le geste vaut sa confirmation là où on
      // a cliqué · sans elle, ranger une créa dans un board est une action muette.
      toast(value ? `Rangé dans « ${value} ».` : 'Retiré du board.');
    });
  };

  if (!list.length) {
    return (
      <Empty
        tone="todo" icon="bookmark" title="Aucune créa sauvegardée."
        why="Dans la Veille, clique ★ sur une annonce pour la ranger ici · c'est ton swipe file, trié par board."
        action={{ label: 'Ouvrir la veille', href: '/veille' }}
      />
    );
  }

  // Une piste par élément de la cellule · la carte, « Ranger », « Format », et
  // le pont Adsmap quand il est rendu (bouton, ou raison du refus).
  const pontRefuse = !adsmap && !!refusAdsmap;
  const pistes = 3 + (adsmap || pontRefuse ? 1 : 0);

  const tabBtn = (key: string): CSSProperties => ({
    // Un nom de board long reste dans la largeur (ellipse, nom complet au survol).
    maxWidth: '100%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', minHeight: cible,
    display: 'inline-flex', alignItems: 'center',
    padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
    border: '1px solid ' + (tab === key ? 'transparent' : 'var(--line-2)'),
    background: tab === key ? 'var(--grad-accent)' : 'var(--surface)',
    color: tab === key ? 'var(--on-accent)' : 'var(--ink-2)',
  });

  return (
    <>
      {/* Recherche · cohérente avec les autres bibliothèques · marque, texte, board. */}
      <div style={{ position: 'relative', marginBottom: 12, maxWidth: 420 }}>
        <span aria-hidden style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', display: 'inline-flex' }}><Icon name="search" size={15} /></span>
        <input value={q} onChange={(e) => chercher(e.target.value)} aria-label="Rechercher dans les créas gardées" placeholder="Rechercher · marque, texte, board…"
          style={{ width: '100%', minHeight: Math.max(40, cible), padding: '9px 32px 9px 34px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink)', fontSize: 13, outline: 'none' }} />
        {filtre && <button type="button" onClick={() => chercher('')} aria-label="Effacer la recherche" style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: Math.max(28, cible), height: Math.max(28, cible), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>}
      </div>

      {/* Onglets des boards */}
      <div ref={barreRef} role="group" aria-label="Boards" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <button type="button" aria-pressed={tab === BOARD_TOUS} onClick={() => choisirBoard(BOARD_TOUS)} style={tabBtn(BOARD_TOUS)}>Toutes · {countIn(BOARD_TOUS)}</button>
        {folders.map((f) => (
          <button key={f} type="button" aria-pressed={tab === f} title={f} onClick={() => choisirBoard(f)} style={tabBtn(f)}><Icon name="folder" size={13} /><span style={{ marginLeft: 5, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f}</span><span style={{ flexShrink: 0 }}>&nbsp;· {countIn(f)}</span></button>
        ))}
        {list.some((i) => !i.folder) && <button type="button" aria-pressed={tab === BOARD_SANS} onClick={() => choisirBoard(BOARD_SANS)} style={tabBtn(BOARD_SANS)}>Sans dossier · {countIn(BOARD_SANS)}</button>}
      </div>

      {shown.length === 0 ? (
        <Empty
          tone="todo" icon="search" title="Aucune créa pour cette recherche."
          why={`Rien ne correspond à « ${q.trim()} » dans cet espace · élargis ta recherche ou remets tout.`}
        >
          <button type="button" onClick={() => chercher('')} style={{ minHeight: cible, padding: '9px 16px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Réinitialiser la recherche</button>
        </Empty>
      ) : (
      /* Grille */
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', columnGap: 16, rowGap: 16 }}>
        {shown.map((it) => (
          // Lot 20B · une SOUS-GRILLE par carte · elle occupe une piste par
          // élément (carte, ranger, format, pont) et ces pistes sont partagées
          // par toute la rangée · chaque commande commence à la même hauteur
          // d'une carte à l'autre, quel que soit le nom ou le texte de la carte
          // (mesuré · jusqu'à 64,6 px d'écart à 1440 avant). La carte commune
          // `AdCard` n'est pas touchée · elle s'étire à la hauteur de sa piste.
          // Sa colonne unique est bornée (`minmax(0, 1fr)`) · en `auto`, un nom
          // de board ou un lien sans retour à la ligne l'élargissait au-delà de
          // la colonne de la grille et la carte chevauchait sa voisine (vu).
          <div key={it.platform + it.externalId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gridTemplateRows: 'subgrid', gridRow: `span ${pistes}`, rowGap: 6, minWidth: 0 }}>
            {/* La pub est sauvegardée · on connaît son identifiant, donc « Génère
                ta version » ouvre le mode CLONE avec elle en référence · l'angle
                ET la structure, pas seulement l'angle. */}
            <AdCard ad={it.ad} saved following={following.has(it.ad.platform + ':' + (it.ad.advertiserName || ''))} cloneRef={it.id} cibles44={tactile} />
            <FolderPicker current={it.folder} folders={folders} onPick={(f) => move(it, f)} cible={cible} />
            {/* Formats créatifs v1 (lot 19C) · qualification manuelle, persistante.
                Enveloppé · le choix est lui-même une grille · étiré à la hauteur
                de sa piste, il répartissait l'excédent entre ses lignes et son
                champ descendait (mesuré · 4 px à 1440 et 1280). */}
            <div><FormatChoix platform={it.platform} externalId={it.externalId} mediaType={it.ad.mediaType} initial={it.format?.id ?? null} versionAncienne={it.format?.versionAncienne} indisponible={formatIndisponible} /></div>
            {adsmap && <TrackButton state={suivi[`${it.platform}:${it.externalId}`]} onClick={() => suivre(it)} cible={cible} />}
            {pontRefuse && <p data-pont-refus style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.45 }}>{refusAdsmap}</p>}
          </div>
        ))}
      </div>
      )}
    </>
  );
}

/**
 * « Suivre dans ADSMAP » · la pub concurrente devient un concept `imitation`.
 *
 * Le libellé dit ce qui se passe vraiment : rien n'est lancé, un brouillon entre
 * dans la carte. C'est important, parce qu'un bouton qui promet plus que ça se
 * traduit par des ads fantômes que personne n'assume.
 */
function TrackButton({ state, onClick, cible }: { state: string | undefined; onClick: () => void; cible: number }) {
  const done = state === 'done';
  const busy = state === 'busy';
  const err = state && !done && !busy ? state : null;
  return (
    <div>
      <button type="button" onClick={onClick} disabled={busy || done} title="Créer un concept « imitation » dans Adsmap" style={{
        width: '100%', minHeight: cible, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 10px', borderRadius: 9,
        border: '1px solid ' + (done ? 'transparent' : 'var(--line-2)'),
        background: done ? 'var(--accent-soft)' : 'var(--paper)',
        color: done ? 'var(--accent-strong)' : 'var(--ink-2)',
        cursor: busy || done ? 'default' : 'pointer', fontSize: 12, fontWeight: 600, opacity: busy ? 0.6 : 1,
      }}>
        <span style={{ display: "inline-flex" }}><Icon name="map" size={15} /></span>
        <span>{done ? 'Dans Adsmap' : busy ? 'Ajout…' : 'Suivre dans Adsmap'}</span>
      </button>
      {err && <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--danger, #e5484d)', lineHeight: 1.4 }}>{err}</p>}
    </div>
  );
}

/**
 * Petit sélecteur « ranger dans un board » : dossiers existants + création à la volée.
 * Son ouverture est annoncée (`aria-expanded`) · Échap le referme et rend le
 * focus au bouton (recette #106, point 6 · il restait ouvert, sans état dit).
 */
function FolderPicker({ current, folders, onPick, cible }: { current: string | null; folders: string[]; onPick: (f: string | null) => void; cible: number }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const boutonRef = useRef<HTMLButtonElement>(null);
  const panneauId = useId();

  const fermer = (rendreFocus: boolean) => { setOpen(false); if (rendreFocus) boutonRef.current?.focus(); };
  const create = () => { const v = draft.trim(); if (v) { onPick(v); setDraft(''); fermer(true); } };

  return (
    <div style={{ position: 'relative' }} onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); fermer(true); } }}>
      <button ref={boutonRef} type="button" aria-expanded={open} aria-controls={open ? panneauId : undefined} onClick={() => setOpen((o) => !o)} style={{
        width: '100%', minHeight: cible, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 9,
        border: '1px solid var(--line-2)', background: 'var(--paper)', color: current ? 'var(--ink)' : 'var(--muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
      }}>
        <span style={{ display: "inline-flex" }}><Icon name="folder" size={15} /></span>
        <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{current || 'Ranger dans un board'}</span>
        <span style={{ color: 'var(--muted)', fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
          <div id={panneauId} style={{ position: 'absolute', bottom: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 12, boxShadow: '0 14px 34px -10px rgba(0,0,0,.5)', overflow: 'hidden', padding: 6 }}>
            {folders.map((f) => (
              <button key={f} type="button" onClick={() => { onPick(f); fermer(true); }} style={{ ...row(f === current), minHeight: cible }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="folder" size={13} /> {f}</span>{f === current && <span style={{ marginLeft: 'auto', color: 'var(--accent-strong)' }}>✓</span>}</button>
            ))}
            {current && <button type="button" onClick={() => { onPick(null); fermer(true); }} style={{ ...row(false), minHeight: cible }}>✕ Retirer du board</button>}
            <div style={{ display: 'flex', gap: 6, padding: '6px 4px 2px', borderTop: folders.length ? '1px solid var(--line)' : 'none', marginTop: folders.length ? 4 : 0 }}>
              <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} placeholder="Nouveau board…" aria-label="Nom du nouveau board"
                style={{ flex: 1, minWidth: 0, minHeight: cible, padding: '6px 9px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink)', fontSize: 12, outline: 'none' }} />
              <button type="button" onClick={create} aria-label="Créer ce board" style={{ minWidth: cible, minHeight: cible, padding: '6px 10px', borderRadius: 8, border: 'none', background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>+</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const row = (active: boolean): CSSProperties => ({
  width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8,
  border: 'none', background: active ? 'var(--accent-soft)' : 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, textAlign: 'left',
});
