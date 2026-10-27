'use client';

import { useState } from 'react';
import { traceMrr } from '@tiktrends/core';
import { Ic } from '../../communs';
import { Vide } from './base';

/**
 * Les composants INTERACTIFS du Tour de contrôle · filtres et recherche sur des
 * listes déjà lues en base (aucune donnée n'est fabriquée ici). Un module client
 * n'exporte que des composants ou des types (garde `spatial-fondation`).
 */

export interface LigneRisque {
  id: string;
  nom: string;
  /** Clés de filtre auxquelles la ligne répond (forfait, `critique`, `essai`). */
  cles: readonly string[];
  forfait: { libelle: string; classe: '' | 'c' };
  risque: { libelle: string; classe: 'r' | 'w' };
  prix: string;
  signal: string;
  autres: string;
}

function Puces({ filtres, actif, choisir, attr }: { filtres: ReadonlyArray<{ cle: string; libelle: string }>; actif: string; choisir: (c: string) => void; attr: string }) {
  return (
    <div className="kc" style={{ marginBottom: 12 }}>
      {filtres.map((f) => (
        <button key={f.cle} type="button" className="chip" {...{ [attr]: f.cle }} aria-pressed={actif === f.cle} onClick={() => choisir(f.cle)}>{f.libelle}</button>
      ))}
    </div>
  );
}

/** « Comptes à risque » · puces de filtre (Tous, Critiques, par forfait, Essais). */
export function ComptesARisqueListe({ filtres, comptes }: { filtres: ReadonlyArray<{ cle: string; libelle: string }>; comptes: readonly LigneRisque[] }) {
  const [f, setF] = useState('tous');
  const vus = f === 'tous' ? comptes : comptes.filter((c) => c.cles.includes(f));
  return (
    <>
      <Puces filtres={filtres} actif={f} choisir={setF} attr="data-acf" />
      <div className="atable">
        {vus.map((c) => (
          <div className="atr" key={c.id} style={{ gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12 }}>
            <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 8px', alignItems: 'center' }}>
                <b>{c.nom}</b><span className={`pill ${c.forfait.classe}`}>{c.forfait.libelle}</span><span className={`pill ${c.risque.classe}`}>{c.risque.libelle}</span><span className="faint" style={{ fontSize: 12 }}>{c.prix}</span>
              </div>
              <span className="csig"><span>{c.signal}</span><small>{c.autres}</small></span>
            </div>
            {/* Les gestes de la maquette (crédits offerts, pause, appel) n'ont aucune action réelle · absents. */}
            <span className="cacts" />
          </div>
        ))}
        {vus.length === 0 && <Vide>{comptes.length ? 'Aucun compte dans ce filtre.' : 'Aucun compte payant ou en essai ne présente de signal de risque.'}</Vide>}
      </div>
    </>
  );
}

export interface LigneCompte {
  id: string;
  nom: string;
  cles: readonly string[];
  forfait: { libelle: string; classe: '' | 'c' };
  mrr: string;
  credits: { part: number; texte: string; over: boolean };
  sante: { libelle: string; classe: 'g' | 'w' | 'r' };
  profil: string;
  inscrit: string;
}

/** « Comptes » · recherche par nom et puces de filtre, sur la liste lue en base. */
export function ComptesListe({ filtres, comptes, colonnes }: { filtres: ReadonlyArray<{ cle: string; libelle: string }>; comptes: readonly LigneCompte[]; colonnes: string }) {
  const [f, setF] = useState('tous');
  const [q, setQ] = useState('');
  const n = q.trim().toLowerCase();
  const vus = comptes.filter((c) => (f === 'tous' || c.cles.includes(f)) && (!n || c.nom.toLowerCase().includes(n)));
  return (
    <>
      <div className="sech"><h2>Comptes</h2><label className="jsearch" style={{ marginLeft: 'auto', minWidth: 220 }}><Ic n="search" /><input id="auq" type="search" placeholder="Rechercher un compte" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" /></label></div>
      <Puces filtres={filtres} actif={f} choisir={setF} attr="data-auf" />
      <div className="atable">
        <div className="atr ath" style={{ gridTemplateColumns: colonnes }}><span>Compte</span><span>Forfait</span><span>MRR</span><span>Crédits utilisés</span><span>Santé</span><span>Profil</span><span>Inscrit le</span><span /></div>
        <div id="accrows">
          {vus.map((c) => (
            <div className="atr" key={c.id} style={{ gridTemplateColumns: colonnes }}>
              <span><b>{c.nom}</b></span><span><span className={`pill ${c.forfait.classe}`}>{c.forfait.libelle}</span></span><span>{c.mrr}</span>
              <span><i className={c.credits.over ? 'amar over' : 'amar'}><b style={{ width: `${Math.max(0, Math.min(100, c.credits.part))}%` }} /></i>{c.credits.texte}</span>
              <span><span className={`pill ${c.sante.classe}`}>{c.sante.libelle}</span></span><span className="faint">{c.profil}</span><span className="faint">{c.inscrit}</span>
              {/* « Se connecter en tant que » et « offrir des crédits » n'existent pas pour un autre espace · absents. */}
              <span className="aacts" />
            </div>
          ))}
          {vus.length === 0 && <Vide>{comptes.length ? 'Aucun compte ne correspond.' : 'Aucun espace inscrit.'}</Vide>}
        </div>
      </div>
    </>
  );
}

/**
 * Le héros « MRR » de Revenus · la période (6 ou 12 mois) recadre le tracé et
 * les mois affichés. Un mois sans relevé reste vide · aucune valeur n'est
 * interpolée (noyau `traceMrr`).
 */
export function RevenusHero({ titre, valeur, variation, detail, serie }: {
  titre: string; valeur: string; variation: string | null; detail: string;
  serie: ReadonlyArray<{ libelle: string; valeur: number | null; enCours: boolean }>;
}) {
  const [n, setN] = useState(12);
  const vue = serie.slice(-n);
  const t = traceMrr(vue.map((m) => m.valeur));
  return (
    <section className="tile rvhero">
      <div className="rvh">
        <div><span className="lbl" style={{ margin: 0 }}>{titre}</span><div className="rvbig"><b>{valeur}</b>{variation != null && <span className="pill g">{variation}</span>}</div><small className="faint">{detail}</small></div>
        <div className="seg" role="group" aria-label="Période">
          {[6, 12].map((k) => <button key={k} type="button" aria-pressed={n === k} onClick={() => setN(k)}>{k} mois</button>)}
        </div>
      </div>
      <svg className="rvchart" viewBox="0 0 600 190" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="rvg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--acc)" stopOpacity=".45" /><stop offset="1" stopColor="var(--acc)" stopOpacity="0" /></linearGradient></defs>
        {[18, 68, 118, 168].map((y) => <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="#ffffff14" strokeDasharray="3 5" />)}
        {t && <path d={t.aire} fill="url(#rvg)" />}
        {t && <path d={t.ligne} fill="none" stroke="var(--acc)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="rvmo">{vue.map((m, i) => <span key={i} className={m.enCours ? 'on' : ''}>{m.libelle}</span>)}</div>
    </section>
  );
}
