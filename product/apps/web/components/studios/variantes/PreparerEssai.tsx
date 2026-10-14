'use client';

import { useId, useState, useTransition } from 'react';
import {
  ESSAI_VARIABLES, ESSAI_LABEL, AIDE_ESSAI, CIBLE_TACTILE_MIN, libelleVariable,
  type EssaiVariable, type PlanLotEssai, type LigneEssai,
} from '@tiktrends/core';
import { preparerLotEssai } from '../../../app/actions/studios/tests';
import { bloc, sousBloc, titre3, texte, petit, rangee, boutonPrimaire, boutonSecondaire, desactive, pastille, point } from './styles';

/**
 * « Préparer un lot d'essai » · lot 3b. Des variantes DÉJÀ produites, une seule
 * variable (accroche, mise en page ou ambiance). Le serveur relit tout dans la
 * portée de la session et la règle du noyau (`planLotEssai`) décide · ce
 * composant ne fait qu'afficher le plan. Aucune génération, aucun coût,
 * aucune écriture : la suite passe par le rattachement existant.
 *
 * Changer la sélection ou la variable efface le plan affiché · il ne vaut que
 * pour les paramètres qui l'ont produit.
 */

export interface EtatEssaiRecette {
  variable?: EssaiVariable | null;
  selection?: string[];
  plan?: PlanLotEssai | null;
  erreur?: { message: string; traceId?: string } | null;
}

type Saisie = NonNullable<LigneEssai['saisie']>;

const etiquetteChoix = { display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: CIBLE_TACTILE_MIN, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--surface)', cursor: 'pointer', boxSizing: 'border-box' as const, minWidth: 0 };
const caseACocher = { width: 20, height: 20, margin: '2px 0 0', flex: '0 0 auto', accentColor: 'var(--accent)' };

export function PreparerEssai({ projetId, variantes, horsLigne, ouvrirRattachement, initial = {} }: {
  projetId: string;
  variantes: Array<{ id: string; libelle: string; versionTitre: string }>;
  horsLigne: boolean;
  ouvrirRattachement: (variantId: string, saisie: Saisie) => void;
  initial?: EtatEssaiRecette;
}) {
  const base = useId();
  const [variable, setVariable] = useState<EssaiVariable | null>(initial.variable ?? null);
  const [selection, setSelection] = useState<string[]>(initial.selection ?? []);
  const [plan, setPlan] = useState<PlanLotEssai | null>(initial.plan ?? null);
  const [erreur, setErreur] = useState<EtatEssaiRecette['erreur']>(initial.erreur ?? null);
  const [enCours, demarrer] = useTransition();

  const invalider = () => { setPlan(null); setErreur(null); };
  const basculer = (id: string) => { invalider(); setSelection((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); };
  const choisir = (v: EssaiVariable) => { invalider(); setVariable(v); };
  const pret = variable !== null && selection.length >= 2 && !horsLigne && !enCours;

  const preparer = () => {
    if (!pret) return;
    invalider();
    demarrer(async () => {
      const r = await preparerLotEssai({ projectId: projetId, variable, variantIds: selection });
      if (r.ok) setPlan(r.plan);
      else setErreur({ message: r.message, traceId: r.traceId });
    });
  };

  if (variantes.length < 2) {
    return (
      <section aria-labelledby={`${base}-titre`} data-essai="indisponible" style={{ ...bloc, display: 'grid', gap: 6 }}>
        <h3 id={`${base}-titre`} style={{ ...titre3, fontSize: 16 }}>Préparer un lot d’essai</h3>
        <p style={texte}>Un essai compare au moins deux variantes · {variantes.length === 0 ? 'aucune n’est encore choisie' : 'une seule est choisie pour l’instant'}. Choisis d’autres sorties comme variantes, puis reviens ici.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby={`${base}-titre`} data-essai="formulaire" style={{ ...bloc, display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <h3 id={`${base}-titre`} style={{ ...titre3, fontSize: 16 }}>Préparer un lot d’essai</h3>
        <p style={texte}>Choisis des variantes déjà produites et la seule chose qu’elles font varier. Le plan dit si le lot mérite le nom d’essai · aucune génération, aucun coût, rien n’est enregistré.</p>
      </div>

      <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 8, minWidth: 0 }}>
        <legend style={{ ...texte, color: 'var(--ink)', fontWeight: 600, marginBottom: 8 }}>Ce que l’essai fait varier</legend>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
          {ESSAI_VARIABLES.map((v) => (
            <label key={v} style={{ ...etiquetteChoix, borderColor: variable === v ? 'var(--accent)' : 'var(--line-2)' }}>
              <input type="radio" name={`${base}-variable`} value={v} checked={variable === v} onChange={() => choisir(v)} disabled={horsLigne} style={caseACocher} />
              <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                <span style={{ ...texte, color: 'var(--ink)', fontWeight: 600 }}>{ESSAI_LABEL[v]}</span>
                <span style={petit}>{AIDE_ESSAI[v]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 8, minWidth: 0 }}>
        <legend style={{ ...texte, color: 'var(--ink)', fontWeight: 600, marginBottom: 8 }}>Variantes du lot · {selection.length} choisie{selection.length > 1 ? 's' : ''}</legend>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))' }}>
          {variantes.map((c) => (
            <label key={c.id} style={{ ...etiquetteChoix, borderColor: selection.includes(c.id) ? 'var(--accent)' : 'var(--line-2)' }}>
              <input type="checkbox" value={c.id} checked={selection.includes(c.id)} onChange={() => basculer(c.id)} disabled={horsLigne} style={caseACocher} />
              <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                <span style={{ ...texte, color: 'var(--ink)', fontWeight: 600, overflowWrap: 'anywhere' }}>{c.libelle}</span>
                <span style={petit}>{c.versionTitre}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div style={rangee}>
        <button type="button" onClick={preparer} disabled={!pret} aria-busy={enCours} style={{ ...boutonPrimaire, ...(!pret ? desactive : {}) }}>
          {enCours ? 'Préparation…' : 'Préparer le lot d’essai · sans génération, sans coût'}
        </button>
        {(variable === null || selection.length < 2) && <span style={petit}>{variable === null ? 'Choisis ce qui varie' : 'Choisis au moins deux variantes'}{variable === null && selection.length < 2 ? ' et au moins deux variantes' : ''}.</span>}
      </div>

      {erreur && (
        <div role="alert" style={{ ...sousBloc, borderColor: 'var(--err)' }}>
          <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600 }}>{erreur.message}</p>
          {erreur.traceId && <p style={petit}>Identifiant support · <code style={{ fontFamily: 'var(--font-mono)' }}>{erreur.traceId}</code></p>}
        </div>
      )}

      {plan && <PlanEssai plan={plan} horsLigne={horsLigne} ouvrirRattachement={ouvrirRattachement} />}
    </section>
  );
}

function PlanEssai({ plan, horsLigne, ouvrirRattachement }: { plan: PlanLotEssai; horsLigne: boolean; ouvrirRattachement: (variantId: string, saisie: Saisie) => void }) {
  const ok = plan.constat.ok;
  const ton = ok ? 'ok' : 'warn';
  return (
    <div role="status" data-plan-essai={ok ? 'essai' : 'refus'} style={{ ...sousBloc, display: 'grid', gap: 10, borderColor: ok ? 'var(--ok)' : 'var(--warn)' }}>
      <div style={rangee}>
        <p style={{ ...texte, color: 'var(--ink)', fontWeight: 700 }}>{plan.titre}</p>
        <span style={pastille(ton)}><span aria-hidden="true" style={point(ton)} />{ok ? 'Essai réel' : 'Pas un essai'}</span>
      </div>
      {plan.constat.ok ? (
        <p style={texte}>{plan.constat.phrase}</p>
      ) : (
        <div style={{ display: 'grid', gap: 4 }}>
          <p style={{ ...texte, color: 'var(--ink)' }}>{plan.constat.probleme}</p>
          {plan.constat.conseil && <p style={texte}>{plan.constat.conseil}</p>}
        </div>
      )}
      <dl style={{ margin: 0, display: 'grid', gap: 6 }}>
        <div><dt style={{ ...petit, fontWeight: 700 }}>Hypothèse</dt><dd style={{ ...texte, margin: 0 }}>{plan.hypothese}</dd></div>
        <div><dt style={{ ...petit, fontWeight: 700 }}>Tenu dans tout le lot</dt><dd style={{ ...texte, margin: 0 }}>{plan.tenu.join(', ')}</dd></div>
        <div><dt style={{ ...petit, fontWeight: 700 }}>Variable au rattachement</dt><dd style={{ ...texte, margin: 0 }}>{libelleVariable(plan.variableAdsmap)} · modifiable dans le formulaire avant l’envoi</dd></div>
        <div><dt style={{ ...petit, fontWeight: 700 }}>Coût</dt><dd style={{ ...texte, margin: 0 }}>{plan.generation}</dd></div>
      </dl>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {plan.lignes.map((l) => (
          <li key={l.variantId} data-ligne-essai={l.etat} style={{ display: 'grid', gap: 6, padding: '10px 0', borderTop: '1px solid var(--line)', minWidth: 0 }}>
            <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600, overflowWrap: 'anywhere' }}>{l.libelle} · {l.valeur}</p>
            <p style={petit}>{l.etatTexte}</p>
            <div style={rangee}>
              {l.saisie && (
                <button type="button" onClick={() => ouvrirRattachement(l.variantId, l.saisie!)} disabled={horsLigne} style={{ ...boutonSecondaire, ...(horsLigne ? desactive : {}) }}>
                  Rattacher avec ce plan
                </button>
              )}
              {l.adsmapHref && <a href={l.adsmapHref} style={boutonSecondaire}>Voir la fiche dans Résultats</a>}
            </div>
          </li>
        ))}
      </ul>
      <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4 }}>
        {plan.suite.map((s) => <li key={s} style={texte}>{s}</li>)}
      </ol>
      {plan.lienLots && <p style={petit}><a href={plan.lienLots} style={{ color: 'var(--ink)', fontWeight: 600 }}>Ouvrir les lots de test</a> · réservé aux administrateurs de l’espace.</p>}
    </div>
  );
}
