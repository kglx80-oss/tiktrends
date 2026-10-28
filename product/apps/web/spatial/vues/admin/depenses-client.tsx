'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import {
  DEVISE_RECONCILIATION_DEFAUT, confirmationReconciliation, validerSaisieReconciliation,
  type ChampReconciliation, type ErreurSaisieReconciliation,
} from '@tiktrends/core';
import { reconcilierDepenseAction, type EtatReconciliationForm } from '../../../app/actions/reconciliation-depense';
import { DialogueSpatial } from '../marque/interactifs';

/**
 * R5 · réconcilier UNE ligne avec la facture du fournisseur, dans Spatial.
 * Même action que l'ancienne interface (`reconcilierDepenseAction` · porte
 * fondateur, saisie revérifiée, transaction, ajout seul) et même règle de
 * saisie (`validerSaisieReconciliation`, noyau). Deux étapes : saisie →
 * « Réservé X → facturé Y » (et l'avertissement de dépassement) → confirmer.
 * La clé d'idempotence vient du serveur au rendu de la page · une soumission
 * rejouée rend la même réconciliation, jamais deux. Le succès est une
 * redirection du serveur vers l'historique (`#reconciliees`), jamais un
 * message posé ici.
 */

const INITIAL: EtatReconciliationForm = { statut: 'initial', message: '' };
const CHAMPS = ['montant', 'devise', 'preuve', 'motif'] as const;

export function ReconcilierLigne({ ligneId, action, reserve, reserveMicros, cle }: { ligneId: string; action: string; reserve: string; reserveMicros: number; cle: string }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button className="btn sm" type="button" aria-haspopup="dialog" data-geste-reconcilier={ligneId} onClick={() => setOuvert(true)}>Réconcilier</button>
      <DialogueSpatial titre={`Réconcilier · ${action}`} ouvert={ouvert} fermer={() => setOuvert(false)}>
        <p className="muted" style={{ margin: 0, fontSize: '12.5px' }}>Réservé au plus {reserve}, compté au plafond tant que la ligne n’est pas rapprochée.</p>
        <FormulaireReconciliation ligneId={ligneId} reserveMicros={reserveMicros} cle={cle} annuler={() => setOuvert(false)} />
      </DialogueSpatial>
    </>
  );
}

function FormulaireReconciliation({ ligneId, reserveMicros, cle, annuler }: { ligneId: string; reserveMicros: number; cle: string; annuler: () => void }) {
  const [etatServeur, envoyer, enCours] = useActionState(reconcilierDepenseAction, INITIAL);
  const [valeurs, setValeurs] = useState({ montant: '', devise: DEVISE_RECONCILIATION_DEFAUT as string, preuve: '', motif: '' });
  const [erreurs, setErreurs] = useState<ErreurSaisieReconciliation[]>([]);
  const [etape, setEtape] = useState<'saisie' | 'confirmation'>('saisie');
  const confirmationRef = useRef<HTMLDivElement>(null);
  const base = useId();
  const id = (c: string) => `${base}-${c}`;

  // Le serveur revérifie · ses refus de saisie reviennent à la première étape.
  useEffect(() => {
    if (etatServeur.statut === 'refus' && etatServeur.erreurs?.length) { setErreurs(etatServeur.erreurs); setEtape('saisie'); }
  }, [etatServeur]);
  useEffect(() => { if (etape === 'confirmation') confirmationRef.current?.focus(); }, [etape]);

  const erreurDe = (c: ChampReconciliation) => erreurs.find((e) => e.champ === c)?.message ?? null;
  const verifier = () => {
    const v = validerSaisieReconciliation({ ligne: ligneId, cle, ...valeurs });
    if (!v.ok) {
      setErreurs(v.erreurs);
      const premier = v.erreurs.find((e) => (CHAMPS as readonly string[]).includes(e.champ));
      if (premier) document.getElementById(id(premier.champ))?.focus();
      return;
    }
    setErreurs([]);
    setEtape('confirmation');
  };
  const v = validerSaisieReconciliation({ ligne: ligneId, cle, ...valeurs });
  const conf = v.ok ? confirmationReconciliation(reserveMicros, v.saisie.billedMicros) : null;
  const general = erreurs.filter((e) => e.champ === 'ligne' || e.champ === 'cle');

  const champ = (c: 'montant' | 'devise' | 'preuve', libelle: string, aide: string, extra: Record<string, unknown> = {}) => {
    const err = erreurDe(c);
    return (
      <label className="field" htmlFor={id(c)}>
        {libelle}
        <input id={id(c)} name={c} value={valeurs[c]} autoComplete="off" onChange={(e) => setValeurs((x) => ({ ...x, [c]: e.target.value }))}
          aria-invalid={err ? true : undefined} aria-describedby={`${id(c)}-aide`} {...extra} />
        <small id={`${id(c)}-aide`} className="faint" style={{ fontWeight: 400 }}>{err ?? aide}</small>
      </label>
    );
  };

  return (
    <form action={envoyer} data-formulaire-reconciliation={ligneId} style={{ display: 'grid', gap: 12 }} noValidate>
      <input type="hidden" name="ligne" value={ligneId} />
      <input type="hidden" name="cle" value={cle} />
      {etape === 'saisie' ? (
        <>
          {champ('montant', 'Montant facturé', 'Tel que sur la facture (ex. 0,0912) · 0 si rien n’a été facturé.', { inputMode: 'decimal' })}
          {champ('devise', 'Devise de la facture', 'USD seulement · aucune conversion.', { maxLength: 12 })}
          {champ('preuve', 'Identifiant de la preuve fournisseur', 'Numéro de facture, de ligne ou de requête chez le fournisseur.', { maxLength: 200 })}
          <label className="field" htmlFor={id('motif')}>
            Motif
            <textarea id={id('motif')} name="motif" rows={2} maxLength={500} value={valeurs.motif} onChange={(e) => setValeurs((x) => ({ ...x, motif: e.target.value }))} aria-invalid={erreurDe('motif') ? true : undefined} style={{ font: '14px/1.5 var(--sf)' }} />
            <small className="faint" style={{ fontWeight: 400 }}>{erreurDe('motif') ?? 'Ce que montre la facture et pourquoi ce montant.'}</small>
          </label>
          {general.length > 0 && <p role="alert" className="pill r" style={{ whiteSpace: 'normal' }}>{general.map((e) => e.message).join(' ')}</p>}
          <div className="kc">
            <button className="btn sm pri" type="button" onClick={verifier}>Vérifier avant d’enregistrer</button>
            <button className="btn sm" type="button" onClick={annuler}>Annuler</button>
          </div>
        </>
      ) : (
        <div ref={confirmationRef} tabIndex={-1} role="group" aria-label="Confirmer la réconciliation" data-confirmation-reconciliation style={{ display: 'grid', gap: 10, outline: 0 }}>
          {CHAMPS.map((c) => <input key={c} type="hidden" name={c} value={valeurs[c]} />)}
          <b style={{ fontSize: 14 }}>{conf?.texte}</b>
          <span className="muted" style={{ fontSize: '12.5px', overflowWrap: 'anywhere' }}>Preuve · {valeurs.preuve.trim()}</span>
          <span className="muted" style={{ fontSize: '12.5px', overflowWrap: 'anywhere' }}>Motif · {valeurs.motif.trim()}</span>
          {conf?.avertissement && <p className="pill w" data-avertissement-depassement style={{ whiteSpace: 'normal', margin: 0 }}>{conf.avertissement}</p>}
          <small className="faint">La ligne garde son montant réservé et sa cause · la réconciliation s’ajoute à l’historique, elle ne remplace rien.</small>
          <div className="kc">
            <button className="btn sm pri" type="submit" disabled={enCours}>{enCours ? 'Enregistrement…' : 'Confirmer la réconciliation'}</button>
            <button className="btn sm" type="button" disabled={enCours} onClick={() => setEtape('saisie')}>Modifier</button>
          </div>
        </div>
      )}
      <p role="status" aria-live="polite" className="faint" style={{ margin: 0, fontSize: 12 }}>
        {etatServeur.statut !== 'initial' && !etatServeur.erreurs?.length ? etatServeur.message : ''}
      </p>
    </form>
  );
}
