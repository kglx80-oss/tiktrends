'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { InspoAd } from '@tiktrends/integrations';
import {
  TRIS_OUTIL_SCALE, criteresOutilsScale, ecrireOutilsScale, filtrerOutilsScale, lireOutilsScale, videoLisible,
  type DonneesOutilScale, type FiltresOutilScale, type TriOutilScale, type TypeOutilScale,
} from '@tiktrends/core';
import { useSpatial } from '../../coquille/contexte';
import { Ic, Lien } from '../../communs';
import { Vignette } from './base';
import { BoutonSauvegarde, BoutonSuivi } from './client';

/**
 * « Ce qui scale » interactif (vague 3) · les outils de l'ancien swipe file sur
 * la liste de la maquette (`.scaleL` · `.srow` · `.dbar`). Filtrer et trier se
 * jouent ici (règles du noyau `filtrerOutilsScale`), l'adresse suit sans
 * empiler d'entrée. Garder et suivre passent par les actions EXISTANTES
 * (`saveAd`, `followBrand`) · le toast ne dit « c'est fait » qu'au oui du serveur.
 */

export interface LigneScaleOutil {
  cle: string; rang: number; image: string | null; accroche: string; detail: string; part: number; jours: string; cloner: string;
  o: DonneesOutilScale;
  ad: InspoAd; sauvee: boolean; suivie: boolean;
  site: { href: string; libelle: string } | null;
  biblio: { href: string; libelle: string } | null;
}

const SEGMENTS: ReadonlyArray<[TypeOutilScale, string]> = [['all', 'Tout'], ['static', 'Statiques'], ['video', 'Vidéos']];

export function ScaleInteractif({ lignes, initial, annonceurs, angles }: {
  lignes: ReadonlyArray<LigneScaleOutil>; initial: FiltresOutilScale;
  annonceurs: readonly string[]; angles: ReadonlyArray<{ cle: string; libelle: string }>;
}) {
  const [f, setF] = useState<FiltresOutilScale>(initial);
  const premier = useRef(true);
  useEffect(() => {
    if (premier.current) { premier.current = false; return; }
    const suite = ecrireOutilsScale(window.location.search, f);
    window.history.replaceState(null, '', `${window.location.pathname}${suite}${window.location.hash}`);
  }, [f]);
  // Revenu par le Retour, le routeur peut restaurer la page telle que le serveur l'a rendue (sans
  // critères) alors que l'adresse les porte · on relit l'adresse au montage (comme l'ancien swipe file).
  useEffect(() => {
    const lu = lireOutilsScale(Object.fromEntries(new URLSearchParams(window.location.search)), { annonceurs, angles: angles.map((a) => a.cle) });
    setF((x) => (JSON.stringify(x) === JSON.stringify(lu) ? x : lu));
    // Au montage seulement · ensuite l'état fait foi et l'adresse le suit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const visibles = useMemo(() => filtrerOutilsScale(lignes, f), [lignes, f]);
  const criteres = criteresOutilsScale(f);
  const maj = (p: Partial<FiltresOutilScale>) => setF((x) => ({ ...x, ...p }));
  const champ = useRef<HTMLInputElement>(null);
  // Réinitialiser vide les critères PUIS rend le focus au champ (le bouton disparaît avec eux).
  const tout = () => { setF((x) => ({ ...x, type: 'all', annonceur: 'all', angle: 'all', texte: '' })); champ.current?.focus(); };
  // « / » met le focus sur la recherche · jamais quand un champ a déjà le focus (on ne vole pas la frappe).
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      const c = e.target as HTMLElement | null;
      if (c && (['INPUT', 'TEXTAREA', 'SELECT'].includes(c.tagName) || c.isContentEditable)) return;
      if (e.key === '/') { e.preventDefault(); champ.current?.focus(); }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, []);
  return (
    <>
      <div className="tile" style={{ display: 'grid', gap: 10, marginBottom: 14 }} aria-label="Filtrer et trier">
        <div className="fields" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
          <label className="field">Chercher dans le texte<input ref={champ} value={f.texte} maxLength={200} onChange={(e) => maj({ texte: e.target.value })} placeholder="Un mot du texte ou un annonceur" /></label>
          <label className="field">Annonceur<select value={f.annonceur} onChange={(e) => maj({ annonceur: e.target.value })}><option value="all">Tous les annonceurs</option>{annonceurs.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
          <label className="field">Angle<select value={f.angle} onChange={(e) => maj({ angle: e.target.value })}><option value="all">Tous les angles</option>{angles.map((a) => <option key={a.cle} value={a.cle}>{a.libelle}</option>)}</select></label>
          <label className="field">Trier par<select value={f.tri} onChange={(e) => maj({ tri: e.target.value as TriOutilScale })}>{TRIS_OUTIL_SCALE.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}</select></label>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {SEGMENTS.map(([v, l]) => <button key={v} type="button" className="chip" aria-pressed={f.type === v} onClick={() => maj({ type: v })}>{l}</button>)}
          {criteres.map((c) => (
            <button key={c.cle} type="button" className="chip" aria-label={`Retirer le critère · ${c.libelle}`}
              onClick={() => maj(c.cle === 'texte' ? { texte: '' } : { [c.cle]: 'all' } as Partial<FiltresOutilScale>)}>{c.libelle}<Ic n="x" /></button>
          ))}
          <small className="faint" style={{ marginLeft: 'auto' }} data-compte>{criteres.length ? `${visibles.length} sur ${lignes.length}` : `${lignes.length} créa${lignes.length > 1 ? 's' : ''}`}</small>
          {criteres.length > 0 && <button type="button" className="btn sm" onClick={tout}>Réinitialiser</button>}
        </div>
      </div>
      {visibles.length > 0 ? (
        <div className="scaleL">
          {visibles.map((l, i) => (
            <div className="srow" key={l.cle} data-ligne={l.cle}>
              <span className="faint num">{f.tri === 'duration' ? l.rang : i + 1}</span>
              <Vignette image={l.image} />
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.accroche}</strong>
                <span className="faint" style={{ fontSize: '11.5px' }}>{l.detail}</span>
              </div>
              {/* `.dbar` est redéfinie plus loin dans la feuille (barre du Drive · flex,
                  marge basse) · la jauge de durée y tombait à 0 px. Elle reprend la place
                  libre (`flex:1`), sans toucher à `display` (masquée sous 1100 px). */}
              <div className="dbar" style={{ marginBottom: 0 }}><i style={{ flex: 1 }}><b style={{ width: `${l.part}%` }} /></i><span>{l.jours}</span></div>
              {/* Les actions passent sous la ligne (colonnes 3 → fin) · dans la colonne
                  `auto` de la maquette, elles réclamaient leur largeur d'une ligne et
                  écrasaient le nom de l'annonceur sous la durée (G7, 1280 px). */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', gridColumn: '3 / -1' }}>
                <Lien className="btn sm" href={l.cloner}><Ic n="copy" />Cloner</Lien>
                {videoLisible(l.ad) && <a className="btn sm" href={videoLisible(l.ad)!} target="_blank" rel="noopener noreferrer"><Ic n="arrow" />Lire la vidéo</a>}
                <BoutonSauvegarde ad={l.ad} initial={l.sauvee} />
                {l.o.annonceur && <BoutonSuivi plateforme={l.ad.platform} nom={l.o.annonceur} ad={l.ad} initial={l.suivie} />}
                {l.site && <a className="btn sm" href={l.site.href} target="_blank" rel="noopener noreferrer">{l.site.libelle}</a>}
                {l.biblio && <a className="btn sm" href={l.biblio.href} target="_blank" rel="noopener noreferrer" title="Ouvre une recherche par nom d’annonceur · pas l’annonce exacte">{l.biblio.libelle}</a>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="tile"><div className="dempty">
          <h3>Aucune créa ne passe ces critères</h3>
          <p className="muted">{lignes.length} créa{lignes.length > 1 ? 's' : ''} dans la niche · retire un critère pour en voir plus.</p>
          <button type="button" className="btn sm" onClick={tout}>Réinitialiser les critères</button>
        </div></div>
      )}
    </>
  );
}

/** Une requête à copier · le presse-papiers seulement, rien n'est envoyé. */
export function RequeteACopier({ n, texte }: { n: number; texte: string }) {
  const { toast } = useSpatial();
  return (
    <div className="tile" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span className="faint num">{String(n).padStart(2, '0')}</span>
      <span style={{ flex: 1, fontSize: '12.5px' }}>{texte}</span>
      <button type="button" className="btn sm" onClick={() => {
        const presse = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
        if (!presse) { toast('Copie impossible ici'); return; }
        presse.writeText(texte).then(() => toast('Requête copiée'), () => toast('Copie impossible ici'));
      }}><Ic n="copy" />Copier</button>
    </div>
  );
}
