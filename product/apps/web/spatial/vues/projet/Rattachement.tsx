'use client';

import { useId, useRef, useState, useTransition } from 'react';
import {
  AIDE_ESSAI, ESSAI_LABEL, TEXTES_HORS_LIGNE, ESSAI_VARIABLES, LIBELLE_METRIQUE, LIBELLE_PROTOCOLE, METRIQUES_TEST, PROTOCOLES_TEST, libelleVariable, raisonFermeture, variablesRattachement,
  type ErreurStudio, type EssaiVariable, type LigneEssai, type PlanLotEssai, type ValeursRattachement,
} from '@tiktrends/core';
import { preparerLotEssai } from '../../../app/actions/studios/tests';
import { Ic, Lien } from '../../communs';
import { boutonAction, replacerFocus } from './action-serveur';
import { CIBLE, Message, RaisonFermee } from './briques';
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
 *
 * Les deux envois passent par la brique `boutonAction` · le bouton
 * pressé garde le focus et dit qu'il travaille, fermé il dit pourquoi à côté
 * de lui, un échec réseau est un `<Message horsLigne>`, et le formulaire qui
 * se ferme (envoyé ou « Fermer ») rend le focus à « Rattacher au test » de la
 * variante (`replacerFocus`), jamais à `<body>`.
 */

export type Saisie = NonNullable<LigneEssai['saisie']>;

export function FormulaireRattachement({ idVariante, initial, adsmap, aUnParent, envoyer, fermer, horsLigne = false }: {
  idVariante: string;
  initial: ValeursRattachement;
  adsmap: AdsmapRattachement;
  aUnParent: boolean;
  envoyer: (v: ValeursRattachement) => Promise<{ ok: true } | ErreurStudio>;
  fermer: () => void;
  /** Hors ligne · l'envoi est suspendu, la saisie reste (mode hors ligne du panneau V5). */
  horsLigne?: boolean;
}) {
  const [v, setV] = useState<ValeursRattachement>(initial);
  const [erreur, setErreur] = useState<ErreurStudio | null>(null);
  const [reseau, setReseau] = useState(false);
  const [enCours, demarrer] = useTransition();
  const id = useId();
  /** Le bouton qui a ouvert le formulaire · il reprend le focus quand le formulaire se ferme. */
  const rendreFocus = () => replacerFocus('si-perdu', `[data-variante="${idVariante}"] [data-geste="rattacher"]`);
  const raisonEnvoi = raisonFermeture(horsLigne);
  const fautes = new Map((erreur?.violations ?? []).map((x) => [x.chemin, x.raison]));
  const maj = (k: keyof ValeursRattachement) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const faute = (k: string) => (fautes.has(k) ? <small className="faint" role="alert" data-faute={k} style={{ fontSize: '11.5px', fontWeight: 500 }}>{fautes.get(k)}</small> : null);
  const invalide = (k: string) => (fautes.has(k) ? { 'aria-invalid': true as const } : {});

  const soumettre = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (enCours || horsLigne) return;
    demarrer(async () => {
      try {
        const r = await envoyer(v);
        setReseau(false);
        setErreur(r.ok ? null : r);
        if (r.ok) rendreFocus();
      } catch {
        setReseau(true);
      }
    });
  };

  return (
    <form className="sugg" onSubmit={soumettre} data-formulaire-test={idVariante} style={{ display: 'grid', gap: 10, flex: '1 1 100%', marginTop: 8 }}>
      <strong style={{ fontSize: 13 }}>Rattacher cette variante à un test Adsmap</strong>
      {(erreur || reseau) && (
        <div data-refus-rattachement={reseau ? 'reseau' : 'serveur'}>
          <Message ton="err" horsLigne={reseau}>{reseau ? 'Le serveur ne répond pas · rien n’est confirmé, réessaie quand la connexion est rétablie' : `${erreur!.message}${erreur!.traceId ? ` · identifiant support ${erreur!.traceId}` : ''}`} · tes saisies sont conservées.</Message>
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
      <div className="kc" style={{ alignItems: 'center' }}>
        <button className="btn sm pri" type="submit" data-geste="envoyer-rattachement" style={CIBLE} aria-describedby={raisonEnvoi ? `${id}-envoi` : undefined}
          {...boutonAction({ presse: enCours, occupe: enCours, ferme: !!raisonEnvoi })}><Ic n="flask" />{enCours ? 'Rattachement…' : 'Rattacher au test'}</button>
        <button className="btn sm" type="button" style={CIBLE} {...boutonAction({ occupe: enCours })} onClick={() => { fermer(); rendreFocus(); }}>Fermer le formulaire</button>
        {raisonEnvoi && <span role="status"><RaisonFermee id={`${id}-envoi`} cle="rattacher">{TEXTES_HORS_LIGNE.formulaire}</RaisonFermee></span>}
      </div>
    </form>
  );
}

export function LotEssai({ projectId, variantes, ouvrirRattachement, horsLigne = false, initial }: {
  projectId: string;
  /** Lot 5 quater · « Tester » depuis Jarvis · la variante désignée présélectionnée (et l'accroche si Jarvis la désigne) · rien n'est préparé sans le clic. */
  initial?: { selection: readonly string[]; variable: EssaiVariable | null };
  /** Hors ligne · la préparation et le rattachement depuis un plan sont suspendus. */
  horsLigne?: boolean;
  variantes: ReadonlyArray<{ id: string; libelle: string; version: string }>;
  ouvrirRattachement: (variantId: string, saisie: Saisie) => void;
}) {
  const [variable, setVariable] = useState<EssaiVariable | null>(initial?.variable ?? null);
  const [selection, setSelection] = useState<string[]>(() => (initial?.selection ?? []).filter((x) => variantes.some((v) => v.id === x)));
  const [plan, setPlan] = useState<PlanLotEssai | null>(null);
  const [erreur, setErreur] = useState<{ message: string; traceId?: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const [reseau, setReseau] = useState(false);
  const id = useId();
  // Un plan ne vaut que pour les paramètres qui l'ont produit · changer la sélection l'efface, une réponse tardive est ignorée.
  const revision = useRef(0);
  const invalider = () => { revision.current += 1; setPlan(null); setErreur(null); setReseau(false); };
  // La raison écrite à côté de « Préparer » · hors ligne d'abord, puis ce qui manque au lot.
  const manque = variable === null || selection.length < 2
    ? `${variable === null ? 'Choisis ce qui varie' : 'Choisis au moins deux variantes'}${variable === null && selection.length < 2 ? ' et au moins deux variantes' : ''}.`
    : null;
  const raisonPreparer = raisonFermeture(horsLigne, manque);
  const pret = !raisonPreparer && !enCours;

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
        setReseau(true);
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
      <div className="kc" style={{ alignItems: 'center' }}>
        <button className="btn sm pri" type="button" data-geste="preparer-lot" style={CIBLE} aria-describedby={raisonPreparer ? `${id}-preparer` : undefined}
          {...boutonAction({ presse: enCours, occupe: enCours, ferme: !!raisonPreparer, surClic: preparer })}><Ic n="flask" />{enCours ? 'Préparation…' : 'Préparer le lot d’essai'}</button>
        {raisonPreparer && <RaisonFermee id={`${id}-preparer`} cle="preparer-lot">{raisonPreparer}</RaisonFermee>}
      </div>
      {erreur && <div data-refus-essai={reseau ? 'reseau' : 'serveur'}><Message ton="err" horsLigne={reseau}>{erreur.message}{erreur.traceId ? ` · identifiant support ${erreur.traceId}` : ''}</Message></div>}
      {plan && <PlanEssai plan={plan} ouvrirRattachement={ouvrirRattachement} horsLigne={horsLigne} />}
    </section>
  );
}

function PlanEssai({ plan, ouvrirRattachement, horsLigne }: { plan: PlanLotEssai; ouvrirRattachement: (variantId: string, saisie: Saisie) => void; horsLigne: boolean }) {
  const ok = plan.constat.ok;
  const idPlan = useId();
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
            {l.saisie && <button className="btn sm" type="button" style={CIBLE} data-geste="rattacher-plan" aria-describedby={horsLigne ? `${idPlan}-hors-ligne` : undefined}
              {...boutonAction({ ferme: horsLigne, surClic: () => { ouvrirRattachement(l.variantId, l.saisie!); replacerFocus('toujours', `[data-formulaire-test="${l.variantId}"] textarea`); } })}>Rattacher avec ce plan</button>}
            {l.adsmapHref && <Lien className="btn sm" href={l.adsmapHref}><Ic n="chart" />Résultats</Lien>}
          </div>
        </div>
      ))}
      {horsLigne && plan.lignes.some((l) => l.saisie) && <RaisonFermee id={`${idPlan}-hors-ligne`} cle="rattacher-plan">{raisonFermeture(true)}</RaisonFermee>}
      <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 2, fontSize: '12.5px' }}>{plan.suite.map((s) => <li key={s}>{s}</li>)}</ol>
      {plan.lienLots && <small className="faint" style={{ fontSize: '11.5px' }}><Lien href={plan.lienLots}>Ouvrir les lots de test</Lien> · réservé aux administrateurs de l’espace.</small>}
    </div>
  );
}
