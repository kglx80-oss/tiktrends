'use client';

import { useId, useState, useTransition } from 'react';
import {
  VARIABLES_TEST, METRIQUES_TEST, PROTOCOLES_TEST, LIBELLE_METRIQUE, LIBELLE_PROTOCOLE, libelleVariable,
  type ProtocoleTest, type ErreurStudio,
} from '@tiktrends/core';
import { champ, etiquette, boutonPrimaire, boutonSecondaire, desactive, rangee, petit, sousBloc, texte } from './styles';

/**
 * « Rattacher au test » · hypothèse, variable, objectif, protocole, période,
 * métrique (et offre / page quand la variable l'exige). Les valeurs SURVIVENT
 * à une erreur : rien n'est vidé tant que le serveur n'a pas accepté. Chaque
 * champ fautif porte son message (`aria-describedby`), l'identifiant support
 * est affiché, sans secret.
 */

export interface ValeursTest {
  hypothese: string; variable: string; valeurVariable: string; objectif: string; protocole: string;
  periodeDebut: string; periodeFin: string; metrique: string; offreId: string; pageId: string;
}

export interface OptionsFormulaire {
  protocoleDefaut: ProtocoleTest | null;
  offres: Array<{ id: string; libelle: string }>;
  pages: Array<{ id: string; libelle: string }>;
  aUnParent: boolean;
}

type Envoi = (valeurs: ValeursTest) => Promise<{ ok: true } | ErreurStudio>;

export function valeursInitiales(o: { hypothese?: string | null; variable?: string | null; protocole: ProtocoleTest | null; aujourdHui: string }): ValeursTest {
  const debut = o.aujourdHui;
  const fin = new Date(Date.parse(`${debut}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  const variable = o.variable && (VARIABLES_TEST as readonly string[]).includes(o.variable) ? o.variable : '';
  return {
    hypothese: o.hypothese ?? '', variable, valeurVariable: '', objectif: '', protocole: o.protocole ?? 'abo_one_adset_per_ad',
    periodeDebut: debut, periodeFin: fin, metrique: 'cpa', offreId: '', pageId: '',
  };
}

export function FormulaireTest({ idVariante, initial, options, envoyer, annuler, horsLigne, erreurInitiale = null }: {
  idVariante: string; initial: ValeursTest; options: OptionsFormulaire; envoyer: Envoi; annuler: () => void; horsLigne: boolean;
  /** Pour la recette des états (rendu d'une erreur conservant les valeurs). */
  erreurInitiale?: ErreurStudio | null;
}) {
  const [v, setV] = useState<ValeursTest>(initial);
  const [erreur, setErreur] = useState<ErreurStudio | null>(erreurInitiale);
  const [enCours, demarrer] = useTransition();
  const base = useId();
  const id = (k: string) => `${base}-${k}`;
  const fautes = new Map((erreur?.violations ?? []).map((x) => [x.chemin, x.raison]));
  const maj = (k: keyof ValeursTest) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const decrit = (k: string) => (fautes.has(k) ? { 'aria-invalid': true as const, 'aria-describedby': id(`err-${k}`) } : {});
  const faute = (k: string) => (fautes.has(k) ? <p id={id(`err-${k}`)} style={{ ...petit, color: 'var(--err)', marginTop: 4 }}>{fautes.get(k)}</p> : null);
  const bloque = enCours || horsLigne;

  const soumettre = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (bloque) return;
    demarrer(async () => {
      const r = await envoyer(v);
      setErreur(r.ok ? null : r);
    });
  };

  const variablesPermises = VARIABLES_TEST.filter((x) => !(options.aUnParent && x === 'none_control'));
  return (
    <form onSubmit={soumettre} aria-labelledby={id('titre')} data-formulaire-test={idVariante} style={{ ...sousBloc, display: 'grid', gap: 12, marginTop: 10 }}>
      <p id={id('titre')} style={{ ...texte, fontWeight: 600, color: 'var(--ink)' }}>Rattacher cette variante précise à un test Adsmap</p>
      {erreur && (
        <div role="alert" style={{ ...sousBloc, borderColor: 'var(--err)', background: 'var(--surface)' }}>
          <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600 }}>{erreur.message}</p>
          <p style={petit}>Tes saisies sont conservées. Identifiant support · <code style={{ fontFamily: 'var(--font-mono)' }}>{erreur.traceId}</code></p>
        </div>
      )}
      <div>
        <label htmlFor={id('hypothese')} style={etiquette}>Hypothèse</label>
        <textarea id={id('hypothese')} name="hypothese" rows={3} required value={v.hypothese} onChange={maj('hypothese')} {...decrit('hypothese')} style={{ ...champ, minHeight: 88, resize: 'vertical' }} placeholder="Quel effet, sur quelle métrique, et pourquoi" />
        {faute('hypothese')}
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
        <div>
          <label htmlFor={id('variable')} style={etiquette}>Variable testée</label>
          <select id={id('variable')} name="variable" required value={v.variable} onChange={maj('variable')} {...decrit('variable')} style={champ}>
            <option value="">Choisir…</option>
            {variablesPermises.map((x) => <option key={x} value={x}>{libelleVariable(x)}</option>)}
          </select>
          {faute('variable')}
        </div>
        <div>
          <label htmlFor={id('valeur')} style={etiquette}>Valeur testée (facultatif)</label>
          <input id={id('valeur')} name="valeurVariable" value={v.valeurVariable} onChange={maj('valeurVariable')} {...decrit('valeurVariable')} style={champ} placeholder="Ex. « Marre des boutons ? »" />
          {faute('valeurVariable')}
        </div>
      </div>
      <div>
        <label htmlFor={id('objectif')} style={etiquette}>Objectif</label>
        <input id={id('objectif')} name="objectif" required value={v.objectif} onChange={maj('objectif')} {...decrit('objectif')} style={champ} placeholder="Ex. baisser le CPA sous 30 €" />
        {faute('objectif')}
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
        <div>
          <label htmlFor={id('protocole')} style={etiquette}>Protocole</label>
          <select id={id('protocole')} name="protocole" value={v.protocole} onChange={maj('protocole')} {...decrit('protocole')} style={champ}>
            {PROTOCOLES_TEST.map((x) => <option key={x} value={x}>{LIBELLE_PROTOCOLE[x]}</option>)}
          </select>
          {faute('protocole')}
        </div>
        <div>
          <label htmlFor={id('metrique')} style={etiquette}>Métrique qui tranche</label>
          <select id={id('metrique')} name="metrique" value={v.metrique} onChange={maj('metrique')} {...decrit('metrique')} style={champ}>
            {METRIQUES_TEST.map((x) => <option key={x} value={x}>{LIBELLE_METRIQUE[x]}</option>)}
          </select>
          {faute('metrique')}
        </div>
        <div>
          <label htmlFor={id('debut')} style={etiquette}>Début de la période</label>
          <input id={id('debut')} type="date" name="periodeDebut" required value={v.periodeDebut} onChange={maj('periodeDebut')} {...decrit('periodeDebut')} style={champ} />
          {faute('periodeDebut')}
        </div>
        <div>
          <label htmlFor={id('fin')} style={etiquette}>Fin de la période</label>
          <input id={id('fin')} type="date" name="periodeFin" required value={v.periodeFin} onChange={maj('periodeFin')} {...decrit('periodeFin')} style={champ} />
          {faute('periodeFin')}
        </div>
        {(options.offres.length > 0 || v.variable === 'offer') && (
          <div>
            <label htmlFor={id('offre')} style={etiquette}>Offre{v.variable === 'offer' ? '' : ' (facultatif)'}</label>
            <select id={id('offre')} name="offreId" value={v.offreId} onChange={maj('offreId')} {...decrit('offreId')} style={champ}>
              <option value="">{options.offres.length ? 'À compléter dans Adsmap' : 'Aucune offre dans Adsmap'}</option>
              {options.offres.map((o) => <option key={o.id} value={o.id}>{o.libelle}</option>)}
            </select>
            {faute('offreId')}
          </div>
        )}
        {(options.pages.length > 0 || v.variable === 'landing') && (
          <div>
            <label htmlFor={id('page')} style={etiquette}>Page de destination{v.variable === 'landing' ? '' : ' (facultatif)'}</label>
            <select id={id('page')} name="pageId" value={v.pageId} onChange={maj('pageId')} {...decrit('pageId')} style={champ}>
              <option value="">{options.pages.length ? 'À compléter dans Adsmap' : 'Aucune page dans Adsmap'}</option>
              {options.pages.map((o) => <option key={o.id} value={o.id}>{o.libelle}</option>)}
            </select>
            {faute('pageId')}
          </div>
        )}
      </div>
      <p style={petit}>Aucun coût · la fiche entre dans Adsmap en brouillon, l’offre et la page se confirment avant le lancement.</p>
      <div style={rangee}>
        <button type="submit" disabled={bloque} aria-busy={enCours} style={{ ...boutonPrimaire, ...(bloque ? desactive : {}) }}>
          {enCours ? 'Rattachement…' : 'Rattacher au test'}
        </button>
        <button type="button" onClick={annuler} style={boutonSecondaire}>Fermer</button>
        {horsLigne && <span role="status" style={petit}>Hors ligne · rien n’est envoyé, tes saisies restent ici.</span>}
      </div>
    </form>
  );
}
