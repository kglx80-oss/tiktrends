'use client';

import { useRef, useState, useTransition } from 'react';
import {
  AIDE_ESSAI, ESSAI_LABEL, ESSAI_VARIABLES, LIBELLE_METRIQUE, LIBELLE_PROTOCOLE, METRIQUES_TEST, PROTOCOLES_TEST, libelleVariable, variablesRattachement,
  type ErreurStudio, type EssaiVariable, type LigneEssai, type PlanLotEssai, type ValeursRattachement,
} from '@tiktrends/core';
import { preparerLotEssai } from '../../../app/actions/studios/tests';
import { Ic, Lien } from '../../communs';
import type { AdsmapRattachement } from './types';

/**
 * Les deux gestes Adsmap de l'onglet « Créations » que la maquette ne
 * dessinait pas, portés depuis le panneau V5 « Variantes et tests »
 * (`FormulaireTest`, `PreparerEssai`) dans les tuiles Spatial :
 *
 *  · « Rattacher au test » · hypothèse, variable, objectif, protocole, période,
 *    métrique (offre et page quand la variable l'exige). Envoi par l'action
 *    EXISTANTE `rattacherVarianteAuTest` (le parent la passe). Les saisies
 *    survivent à un refus · chaque champ fautif porte son message, l'identifiant
 *    support est affiché. Aucun coût · la fiche entre dans Adsmap en brouillon.
 *  · « Préparer un lot d'essai » · des variantes DÉJÀ produites, une seule
 *    variable. Le serveur (`preparerLotEssai`, règle `planLotEssai`) décide si
 *    le lot mérite le nom d'essai · aucune génération, aucun coût, aucune
 *    écriture. « Rattacher avec ce plan » ouvre le formulaire prérempli.
 */

export type Saisie = NonNullable<LigneEssai['saisie']>;

export function FormulaireRattachement({ idVariante, initial, adsmap, aUnParent, envoyer, fermer }: {
  idVariante: string;
  initial: ValeursRattachement;
  adsmap: AdsmapRattachement;
  aUnParent: boolean;
  envoyer: (v: ValeursRattachement) => Promise<{ ok: true } | ErreurStudio>;
  fermer: () => void;
}) {
  const [v, setV] = useState<ValeursRattachement>(initial);
  const [erreur, setErreur] = useState<ErreurStudio | null>(null);
  const [reseau, setReseau] = useState(false);
  const [enCours, demarrer] = useTransition();
  const fautes = new Map((erreur?.violations ?? []).map((x) => [x.chemin, x.raison]));
  const maj = (k: keyof ValeursRattachement) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const faute = (k: string) => (fautes.has(k) ? <small className="faint" role="alert" data-faute={k} style={{ fontSize: '11.5px', fontWeight: 500 }}>{fautes.get(k)}</small> : null);
  const invalide = (k: string) => (fautes.has(k) ? { 'aria-invalid': true as const } : {});

  const soumettre = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (enCours) return;
    demarrer(async () => {
      try {
        const r = await envoyer(v);
        setReseau(false);
        setErreur(r.ok ? null : r);
      } catch {
        setReseau(true);
      }
    });
  };

  return (
    <form className="sugg" onSubmit={soumettre} data-formulaire-test={idVariante} style={{ display: 'grid', gap: 10, flex: '1 1 100%', marginTop: 8 }}>
      <strong style={{ fontSize: 13 }}>Rattacher cette variante à un test Adsmap</strong>
      {(erreur || reseau) && (
        <div className="banner" role="alert" style={{ margin: 0 }}>
          <Ic n="x" /><span>{reseau ? 'Le serveur ne répond pas · rien n’est confirmé, réessaie quand la connexion est rétablie' : `${erreur!.message}${erreur!.traceId ? ` · identifiant support ${erreur!.traceId}` : ''}`} · tes saisies sont conservées.</span>
        </div>
      )}
      <label className="field">Hypothèse
        <textarea className="ta" name="hypothese" rows={3} required value={v.hypothese} onChange={maj('hypothese')} {...invalide('hypothese')} placeholder="Quel effet, sur quelle métrique, et pourquoi" />
        {faute('hypothese')}
      </label>
      <div className="fields">
        <label className="field">Variable testée
          <select name="variable" required value={v.variable} onChange={maj('variable')} {...invalide('variable')}>
            <option value="">Choisir…</option>
            {variablesRattachement(aUnParent).map((x) => <option key={x} value={x}>{libelleVariable(x)}</option>)}
          </select>
          {faute('variable')}
        </label>
        <label className="field">Valeur testée (facultatif)
          <input name="valeurVariable" value={v.valeurVariable} onChange={maj('valeurVariable')} {...invalide('valeurVariable')} placeholder="Ex. « Marre des boutons ? »" />
          {faute('valeurVariable')}
        </label>
        <label className="field">Objectif
          <input name="objectif" required value={v.objectif} onChange={maj('objectif')} {...invalide('objectif')} placeholder="Ex. baisser le CPA sous 30 €" />
          {faute('objectif')}
        </label>
        <label className="field">Protocole
          <select name="protocole" value={v.protocole} onChange={maj('protocole')} {...invalide('protocole')}>
            {PROTOCOLES_TEST.map((x) => <option key={x} value={x}>{LIBELLE_PROTOCOLE[x]}</option>)}
          </select>
          {faute('protocole')}
        </label>
        <label className="field">Métrique qui tranche
          <select name="metrique" value={v.metrique} onChange={maj('metrique')} {...invalide('metrique')}>
            {METRIQUES_TEST.map((x) => <option key={x} value={x}>{LIBELLE_METRIQUE[x]}</option>)}
          </select>
          {faute('metrique')}
        </label>
        <label className="field">Début de la période
          <input type="date" name="periodeDebut" required value={v.periodeDebut} onChange={maj('periodeDebut')} {...invalide('periodeDebut')} />
          {faute('periodeDebut')}
        </label>
        <label className="field">Fin de la période
          <input type="date" name="periodeFin" required value={v.periodeFin} onChange={maj('periodeFin')} {...invalide('periodeFin')} />
          {faute('periodeFin')}
        </label>
        {(adsmap.offres.length > 0 || v.variable === 'offer') && (
          <label className="field">Offre{v.variable === 'offer' ? '' : ' (facultatif)'}
            <select name="offreId" value={v.offreId} onChange={maj('offreId')} {...invalide('offreId')}>
              <option value="">{adsmap.offres.length ? 'À compléter dans Adsmap' : 'Aucune offre dans Adsmap'}</option>
              {adsmap.offres.map((o) => <option key={o.id} value={o.id}>{o.libelle}</option>)}
            </select>
            {faute('offreId')}
          </label>
        )}
        {(adsmap.pages.length > 0 || v.variable === 'landing') && (
          <label className="field">Page de destination{v.variable === 'landing' ? '' : ' (facultatif)'}
            <select name="pageId" value={v.pageId} onChange={maj('pageId')} {...invalide('pageId')}>
              <option value="">{adsmap.pages.length ? 'À compléter dans Adsmap' : 'Aucune page dans Adsmap'}</option>
              {adsmap.pages.map((o) => <option key={o.id} value={o.id}>{o.libelle}</option>)}
            </select>
            {faute('pageId')}
          </label>
        )}
      </div>
      <small className="faint" style={{ fontSize: '11.5px' }}>Aucun coût · la fiche entre dans Adsmap en brouillon, l’offre et la page se confirment avant le lancement.</small>
      <div className="kc">
        <button className="btn sm pri" type="submit" disabled={enCours} aria-busy={enCours}><Ic n="flask" />{enCours ? 'Rattachement…' : 'Rattacher au test'}</button>
        <button className="btn sm" type="button" onClick={fermer}>Fermer</button>
      </div>
    </form>
  );
}

export function LotEssai({ projectId, variantes, ouvrirRattachement }: {
  projectId: string;
  variantes: ReadonlyArray<{ id: string; libelle: string; version: string }>;
  ouvrirRattachement: (variantId: string, saisie: Saisie) => void;
}) {
  const [variable, setVariable] = useState<EssaiVariable | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [plan, setPlan] = useState<PlanLotEssai | null>(null);
  const [erreur, setErreur] = useState<{ message: string; traceId?: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  // Un plan ne vaut que pour les paramètres qui l'ont produit · changer la sélection l'efface, une réponse tardive est ignorée.
  const revision = useRef(0);
  const invalider = () => { revision.current += 1; setPlan(null); setErreur(null); };
  const pret = variable !== null && selection.length >= 2 && !enCours;

  if (variantes.length < 2) {
    return (
      <section className="tile sec" data-essai="indisponible">
        <div className="sech" style={{ margin: 0 }}><h2>Préparer un lot d’essai</h2></div>
        <p className="muted" style={{ fontSize: '12.5px', marginTop: 10 }}>Un essai compare au moins deux variantes · {variantes.length === 0 ? 'aucune n’est encore retenue' : 'une seule est retenue pour l’instant'}. Retiens d’autres sorties, puis reviens ici.</p>
      </section>
    );
  }

  const preparer = () => {
    if (!pret) return;
    invalider();
    const demande = revision.current;
    demarrer(async () => {
      try {
        const r = await preparerLotEssai({ projectId, variable, variantIds: selection });
        if (demande !== revision.current) return;
        if (r.ok) setPlan(r.plan); else setErreur({ message: r.message, traceId: r.traceId });
      } catch {
        if (demande !== revision.current) return;
        setErreur({ message: 'Le plan n’a pas pu être récupéré · tes choix sont conservés. Réessaie quand la connexion est rétablie.' });
      }
    });
  };

  return (
    <section className="tile sec" data-essai="formulaire" style={{ display: 'grid', gap: 12 }}>
      <div className="sech" style={{ margin: 0 }}><h2>Préparer un lot d’essai</h2><span className="faint" style={{ fontSize: '12.5px' }}>Des variantes déjà produites, une seule chose qui varie · sans génération, sans coût</span></div>
      <div>
        <div className="lbl">Ce que l’essai fait varier</div>
        <div className="cards3">
          {ESSAI_VARIABLES.map((x) => (
            <button key={x} type="button" className="pickc" data-essai-variable={x} aria-pressed={variable === x} onClick={() => { invalider(); setVariable(x); }}>
              <strong>{ESSAI_LABEL[x]}</strong><small>{AIDE_ESSAI[x]}</small>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="lbl">Variantes du lot · {selection.length} choisie{selection.length > 1 ? 's' : ''}</div>
        <div className="kc">
          {variantes.map((c) => (
            <button key={c.id} type="button" className="chip" data-essai-variante={c.id} aria-pressed={selection.includes(c.id)}
              onClick={() => { invalider(); setSelection((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id])); }}>
              {c.libelle} · {c.version}
            </button>
          ))}
        </div>
      </div>
      <div className="kc">
        <button className="btn sm pri" type="button" disabled={!pret} aria-busy={enCours} onClick={preparer}><Ic n="flask" />{enCours ? 'Préparation…' : 'Préparer le lot d’essai'}</button>
        {(variable === null || selection.length < 2) && <small className="faint" style={{ fontSize: '11.5px' }}>{variable === null ? 'Choisis ce qui varie' : 'Choisis au moins deux variantes'}{variable === null && selection.length < 2 ? ' et au moins deux variantes' : ''}.</small>}
      </div>
      {erreur && <div className="banner" role="alert" style={{ margin: 0 }}><Ic n="x" /><span>{erreur.message}{erreur.traceId ? ` · identifiant support ${erreur.traceId}` : ''}</span></div>}
      {plan && <PlanEssai plan={plan} ouvrirRattachement={ouvrirRattachement} />}
    </section>
  );
}

function PlanEssai({ plan, ouvrirRattachement }: { plan: PlanLotEssai; ouvrirRattachement: (variantId: string, saisie: Saisie) => void }) {
  const ok = plan.constat.ok;
  return (
    <div className="sugg" role="status" data-plan-essai={ok ? 'essai' : 'refus'} style={{ display: 'grid', gap: 8 }}>
      <div className="rights"><strong style={{ fontSize: 13 }}>{plan.titre}</strong><span className={`pill ${ok ? 'g' : 'w'}`}>{ok ? 'Essai réel' : 'Pas un essai'}</span></div>
      {plan.constat.ok
        ? <p style={{ fontSize: '12.5px' }}>{plan.constat.phrase}</p>
        : <p style={{ fontSize: '12.5px' }}>{plan.constat.probleme}{plan.constat.conseil ? ` ${plan.constat.conseil}` : ''}</p>}
      <div className="tl">
        <div className="ev"><span className="ico"><Ic n="bulb" /></span><span>Hypothèse<small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{plan.hypothese}</small></span></div>
        <div className="ev"><span className="ico"><Ic n="lock" /></span><span>Tenu dans tout le lot<small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{plan.tenu.join(', ')}</small></span></div>
        <div className="ev"><span className="ico"><Ic n="loop" /></span><span>Variable au rattachement<small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{libelleVariable(plan.variableAdsmap)} · modifiable dans le formulaire avant l’envoi</small></span></div>
        <div className="ev"><span className="ico"><Ic n="spark" /></span><span>Coût<small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{plan.generation}</small></span></div>
      </div>
      {plan.lignes.map((l) => (
        <div className="prow" key={l.variantId} data-ligne-essai={l.etat} style={{ flexWrap: 'wrap' }}>
          <div className="t"><strong style={{ fontSize: '12.5px' }}>{l.libelle} · {l.valeur}</strong><small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{l.etatTexte}</small></div>
          <div className="kc">
            {l.saisie && <button className="btn sm" type="button" onClick={() => ouvrirRattachement(l.variantId, l.saisie!)}>Rattacher avec ce plan</button>}
            {l.adsmapHref && <Lien className="btn sm" href={l.adsmapHref}><Ic n="chart" />Résultats</Lien>}
          </div>
        </div>
      ))}
      <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 2, fontSize: '12.5px' }}>{plan.suite.map((s) => <li key={s}>{s}</li>)}</ol>
      {plan.lienLots && <small className="faint" style={{ fontSize: '11.5px' }}><Lien href={plan.lienLots}>Ouvrir les lots de test</Lien> · réservé aux administrateurs de l’espace.</small>}
    </div>
  );
}
