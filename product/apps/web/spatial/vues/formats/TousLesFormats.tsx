'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  FAMILLES_STYLES, NIVEAUX_CONSCIENCE, STYLES_CREA, TRIS_STYLES, chiffresStyle, consigneStyle, ecartTendance, filtrerFamille,
  lienNouveauProjet, pastilleStyle, styleCorrespond, styleCrea, trierStyles, visiblesRecherche,
  type CarteStyle, type CleStyle, type FamilleStyle, type StatsStyle, type TriStyles,
} from '@tiktrends/core';
import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { Composition } from './Composition';

/**
 * « Tous les formats » · `docs/spatial/reference/formats.html`, balisage à
 * l'identique (vue `vFormatsS` de la maquette). Les 28 styles viennent du
 * catalogue du noyau ; leurs CHIFFRES viennent des sauvegardes classées de
 * l'espace (page serveur) · rien n'est haché ni inventé.
 *
 * Ce qui n'est pas repris · les menus « Occasion » et « Secteur » (ils triaient
 * des compteurs fictifs, aucune annonce ne porte de secteur), le choix de
 * « gagnant B » (aucun lien réel). Le tri, la famille, la recherche et le choix
 * d'un style sont des états d'écran · le choix mène à la préparation RÉELLE
 * d'un projet, consigne du format passée en `angle`.
 */
export interface PropsTousLesFormats {
  sousNav: ReadonlyArray<{ href: string; libelle: ReactNode }>;
  styles: ReadonlyArray<{ cle: CleStyle; stats: StatsStyle; hausse: number | null }>;
  /** Image et nom de la marque active · les miniatures en sont faites. */
  image: string | null;
  marque: string | null;
  /** La ligne sous le compteur · le périmètre réel des chiffres. */
  perimetre: string;
}

type Menu = 'fam' | 'sort';

export function TousLesFormats(p: PropsTousLesFormats) {
  const [famille, setFamille] = useState<FamilleStyle | 'tous'>('tous');
  const [tri, setTri] = useState<TriStyles>('pop');
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState<Menu | null>(null);
  const [choix, setChoix] = useState<CleStyle | null>(null);

  const cartes: CarteStyle[] = useMemo(() => p.styles.map((s) => ({ style: styleCrea(s.cle), stats: s.stats, hausse: s.hausse })), [p.styles]);
  const liste = trierStyles(filtrerFamille(cartes, famille), tri);
  const visibles = visiblesRecherche(liste, q);
  const enHausse = [...cartes].filter((c) => c.hausse !== null).sort((a, b) => b.hausse! - a.hausse!).slice(0, 4);
  const tr = TRIS_STYLES.find((t) => t.id === tri)!;
  const sel = choix ? styleCrea(choix) : null;

  useEffect(() => {
    if (!menu) return;
    const fermer = (e: MouseEvent) => { if (!(e.target as Element).closest?.('.fpanel, .fdd')) setMenu(null); };
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('click', fermer);
    document.addEventListener('keydown', echap);
    return () => { document.removeEventListener('click', fermer); document.removeEventListener('keydown', echap); };
  }, [menu]);

  const dd = (k: Menu, lbl: string, val: string) => (
    <button type="button" className="fdd" aria-expanded={menu === k} onClick={() => setMenu(menu === k ? null : k)}><small>{lbl}</small><b>{val}</b><i className="chev" aria-hidden="true" /></button>
  );
  const opt = (actif: boolean, nom: string, sous: string, choisir: () => void, cle: string) => (
    <button key={cle} type="button" className="fopt" aria-pressed={actif} onClick={() => { choisir(); setMenu(null); }}><span>{nom}</span><small>{sous}</small></button>
  );

  return (
    <Vue>
      <EnTete titre="Tous les formats" sous={`${STYLES_CREA.length} styles de créa statique. Choisis-en un, le studio part de ce format pour ton produit`} />
      <SousNav items={p.sousNav} actif="/veille/formats" />
      {famille === 'tous' && !q.trim() && enHausse.length > 0 && (
        <section className="tile ftrend">
          <div className="sech" style={{ margin: '0 0 10px' }}><div className="lbl"><Ic n="chart" />En hausse dans tes sauvegardes · 30 derniers jours</div></div>
          <div className="ftr">
            {enHausse.map((c) => {
              const ch = chiffresStyle(c.stats);
              return (
                <Lien key={c.style.cle} href={`/veille/formats/${c.style.cle}`} className="ftrr">
                  <span className="ftm"><Composition cle={c.style.cle} image={p.image} marque={p.marque} /></span>
                  <span style={{ minWidth: 0 }}><strong>{c.style.nom}</strong><small className="faint">{ch.pubs.b}{ch.pubs.texte} · {ch.longue.b}{ch.longue.texte}</small></span>
                  <span className="pill g">{ecartTendance(c.hausse!)}</span>
                </Lien>
              );
            })}
          </div>
        </section>
      )}
      <div className="fbar sec">
        {dd('fam', 'Style', famille === 'tous' ? 'Tous' : famille)}
        {dd('sort', 'Trier', tr.libelle)}
        <label className="dsearch fsearch"><Ic n="search" /><input id="fq" type="search" placeholder="Rechercher un style, ex. Before & After" value={q} autoComplete="off" onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      {menu && (
        <div className={`tile fpanel ${menu === 'fam' ? 'wide' : ''}`} role="listbox">
          {menu === 'fam'
            ? [opt(famille === 'tous', 'Tous les styles', `${STYLES_CREA.length} styles`, () => setFamille('tous'), 'tous'),
              ...FAMILLES_STYLES.map((f) => opt(famille === f, f, STYLES_CREA.filter((s) => s.famille === f).map((s) => s.nom).join(' · '), () => setFamille(f), f))]
            : TRIS_STYLES.map((t) => opt(tri === t.id, t.libelle, t.sous, () => setTri(t.id), t.id))}
        </div>
      )}
      <div className="fsum">
        <span id="fcount"><b>{visibles}</b> style{visibles > 1 ? 's' : ''}</span>
        {famille !== 'tous' && <button type="button" className="chip" onClick={() => setFamille('tous')}>{famille}<Ic n="x" /></button>}
        <span className="faint">{p.perimetre}</span>
      </div>
      <div className="fgrid2">
        {liste.map((c, i) => {
          const s = c.style, on = choix === s.cle;
          const badge = pastilleStyle(c, i, { tri, famille, q });
          const ch = chiffresStyle(c.stats);
          return (
            <article key={s.cle} className={`fcard2 ${on ? 'on' : ''}`} hidden={!styleCorrespond(s, q) || undefined}>
              <Lien className="fv" href={`/veille/formats/${s.cle}`} aria-label={`Ouvrir ${s.nom}`}><Composition cle={s.cle} image={p.image} marque={p.marque} /></Lien>
              {badge && <span className={`fbadge ${badge.classe}`}>{badge.texte}</span>}
              <div className="fh"><strong>{s.nom}</strong><span className="pill">{s.famille}</span></div>
              <small className="fen">{s.enVeille.join(' · ')}</small>
              <p className="muted" style={{ fontSize: '12.5px' }}>{s.definition}</p>
              <div className="fsts"><span className="fst"><b>{ch.pubs.b}</b>{ch.pubs.texte}</span><span className="fst"><b>{ch.longue.b}</b>{ch.longue.texte}</span></div>
              <div className="aw" aria-label="Niveaux de conscience visés">{NIVEAUX_CONSCIENCE.map((a, j) => <i key={a} className={s.conscience.includes(j) ? 'on' : ''} title={a} />)}</div>
              <div className="fact">
                <button type="button" className={`btn sm ${on ? 'pri' : ''}`} aria-pressed={on} onClick={() => setChoix(on ? null : s.cle)}>{on ? <><Ic n="check" />Choisi</> : 'Choisir ce style'}</button>
                <Lien className="btn sm ghost" href={`/veille/formats/${s.cle}`}>Exemples <Ic n="arrow" /></Lien>
              </div>
            </article>
          );
        })}
      </div>
      <div className="dempty fnone" hidden={visibles > 0 || undefined}><span className="ico"><Ic n="search" s={false} /></span><h3>Aucun style ne correspond</h3><p className="muted">Essaie « avis », « comparaison » ou un nom anglais des bibliothèques publicitaires, comme « Big Logo ».</p></div>
      {sel && (
        <div className="ftray glass">
          <span className="ftv"><Composition cle={sel.cle} image={p.image} marque={p.marque} texte=" " /></span>
          <div className="fti"><small className="lbl">Ton choix</small><strong>{sel.nom}</strong><small className="faint">Le studio prépare un projet avec la consigne de ce format · rien n’est généré avant ta validation.</small></div>
          <div className="kc">
            <Lien className="btn pri" href={lienNouveauProjet({ type: 'ads', angle: consigneStyle(sel.cle) })}><Ic n="loop" />Créer avec ce style</Lien>
            <Lien className="btn" href={`/veille/formats/${sel.cle}`}>Voir les exemples</Lien>
            <button type="button" className="btn ghost ic" aria-label="Retirer le choix" onClick={() => setChoix(null)}><Ic n="x" /></button>
          </div>
        </div>
      )}
    </Vue>
  );
}
