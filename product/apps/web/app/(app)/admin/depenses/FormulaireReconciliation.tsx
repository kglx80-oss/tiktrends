'use client';

import { useActionState, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  CIBLE_TACTILE_MIN, DEVISE_RECONCILIATION_DEFAUT, validerSaisieReconciliation, confirmationReconciliation,
  type ChampReconciliation, type ErreurSaisieReconciliation,
} from '@tiktrends/core';
import { reconcilierDepenseAction, type EtatReconciliationForm } from '../../../actions/reconciliation-depense';

/**
 * R5 · réconcilier UNE ligne avec la facture · deux étapes :
 *
 *  1. saisie · montant facturé, devise (USD par défaut), identifiant de la
 *     preuve fournisseur, motif ; « Vérifier » contrôle la saisie avec la
 *     MÊME règle que le serveur (`validerSaisieReconciliation`) ;
 *  2. confirmation · « Réservé X → facturé Y » et, si le facturé dépasse,
 *     l'avertissement ; « Confirmer » envoie au serveur, qui revérifie tout
 *     (porte fondateur, saisie, état de la ligne) et AJOUTE la réconciliation.
 *
 * La clé d'idempotence vient du serveur au rendu de la page : un double clic
 * ou une soumission rejouée rend la même réconciliation, jamais deux.
 * Clavier : focus porté sur la confirmation, rendu au champ montant sur
 * « Modifier », au premier champ fautif sur erreur. Champs à 16 px, cibles
 * de 44 px, libellés persistants, erreurs dites en texte.
 */

const INITIAL: EtatReconciliationForm = { statut: 'initial', message: '' };

const etiquette: CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 };
const aide: CSSProperties = { margin: '4px 0 0', fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 };
const erreurTexte: CSSProperties = { margin: '4px 0 0', fontSize: 12.5, color: '#ff8095', lineHeight: 1.45 };
const champ = (fautif: boolean): CSSProperties => ({
  width: '100%', boxSizing: 'border-box', minHeight: CIBLE_TACTILE_MIN, padding: '10px 12px', borderRadius: 12,
  border: `1px solid ${fautif ? 'rgba(254,44,85,.65)' : 'var(--line-2)'}`, background: 'var(--paper)', color: 'var(--ink)', fontSize: 16,
});
const bouton: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, padding: '10px 18px',
  borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
};
const boutonSecondaire: CSSProperties = { ...bouton, background: 'transparent', color: 'var(--ink-2)', border: '1px solid var(--line-2)', fontWeight: 600 };

export function FormulaireReconciliation({ ligneId, reserveMicros, cle }: { ligneId: string; reserveMicros: number; cle: string }) {
  const [etatServeur, envoyer, enCours] = useActionState(reconcilierDepenseAction, INITIAL);
  const [valeurs, setValeurs] = useState({ montant: '', devise: DEVISE_RECONCILIATION_DEFAUT as string, preuve: '', motif: '' });
  const [erreurs, setErreurs] = useState<ErreurSaisieReconciliation[]>([]);
  const [etape, setEtape] = useState<'saisie' | 'confirmation'>('saisie');
  const confirmationRef = useRef<HTMLDivElement>(null);
  const montantRef = useRef<HTMLInputElement>(null);
  const id = (c: string) => `rec-${ligneId}-${c}`;

  // Les erreurs renvoyées par le serveur (revérification) reviennent à la saisie.
  useEffect(() => {
    if (etatServeur.statut === 'refus' && etatServeur.erreurs?.length) { setErreurs(etatServeur.erreurs); setEtape('saisie'); }
  }, [etatServeur]);
  useEffect(() => { if (etape === 'confirmation') confirmationRef.current?.focus(); }, [etape]);
  useEffect(() => {
    if (etape !== 'saisie' || !erreurs.length) return;
    const premier = erreurs.find((e) => ['montant', 'devise', 'preuve', 'motif'].includes(e.champ));
    if (premier) document.getElementById(id(premier.champ))?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [erreurs, etape]);

  const erreurDe = (c: ChampReconciliation) => erreurs.find((e) => e.champ === c)?.message ?? null;
  const verifier = () => {
    const v = validerSaisieReconciliation({ ligne: ligneId, cle, ...valeurs });
    if (!v.ok) { setErreurs(v.erreurs); return; }
    setErreurs([]);
    setEtape('confirmation');
  };
  const billed = validerSaisieReconciliation({ ligne: ligneId, cle, ...valeurs });
  const conf = billed.ok ? confirmationReconciliation(reserveMicros, billed.saisie.billedMicros) : null;
  const general = erreurs.filter((e) => e.champ === 'ligne' || e.champ === 'cle');

  const champTexte = (c: 'montant' | 'devise' | 'preuve', libelle: string, indication: string, extra: Record<string, unknown> = {}) => {
    const err = erreurDe(c);
    return (
      <div style={{ minWidth: 0 }}>
        <label htmlFor={id(c)} style={etiquette}>{libelle}</label>
        <input
          id={id(c)} name={c} value={valeurs[c]} onChange={(e) => setValeurs((v) => ({ ...v, [c]: e.target.value }))}
          aria-invalid={err ? true : undefined} aria-describedby={`${id(c)}-aide${err ? ` ${id(c)}-err` : ''}`}
          style={champ(Boolean(err))} {...extra}
        />
        <p id={`${id(c)}-aide`} style={aide}>{indication}</p>
        {err && <p id={`${id(c)}-err`} style={erreurTexte}>{err}</p>}
      </div>
    );
  };

  return (
    <form action={envoyer} data-formulaire-reconciliation={ligneId} style={{ display: 'grid', gap: 12, minWidth: 0 }} noValidate>
      <input type="hidden" name="ligne" value={ligneId} />
      <input type="hidden" name="cle" value={cle} />
      {etape === 'saisie' ? (
        <>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
            {champTexte('montant', 'Montant facturé', 'Tel que sur la facture (ex. 0,0912) · 0 si rien n’a été facturé.', { inputMode: 'decimal', autoComplete: 'off', ref: montantRef })}
            {champTexte('devise', 'Devise de la facture', 'USD seulement · aucune conversion.', { autoComplete: 'off', maxLength: 12, style: { ...champ(Boolean(erreurDe('devise'))), textTransform: 'uppercase' } })}
          </div>
          {champTexte('preuve', 'Identifiant de la preuve fournisseur', 'Numéro de facture, de ligne de facture ou de requête chez le fournisseur.', { autoComplete: 'off', maxLength: 200 })}
          <div style={{ minWidth: 0 }}>
            <label htmlFor={id('motif')} style={etiquette}>Motif</label>
            <textarea
              id={id('motif')} name="motif" value={valeurs.motif} rows={2} maxLength={500}
              onChange={(e) => setValeurs((v) => ({ ...v, motif: e.target.value }))}
              aria-invalid={erreurDe('motif') ? true : undefined} aria-describedby={`${id('motif')}-aide${erreurDe('motif') ? ` ${id('motif')}-err` : ''}`}
              style={{ ...champ(Boolean(erreurDe('motif'))), resize: 'vertical', fontFamily: 'inherit' }}
            />
            <p id={`${id('motif')}-aide`} style={aide}>Ce que montre la facture et pourquoi ce montant.</p>
            {erreurDe('motif') && <p id={`${id('motif')}-err`} style={erreurTexte}>{erreurDe('motif')}</p>}
          </div>
          {general.length > 0 && <p role="alert" style={erreurTexte}>{general.map((e) => e.message).join(' ')}</p>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={verifier} style={bouton}>Vérifier avant d’enregistrer</button>
          </div>
        </>
      ) : (
        <div ref={confirmationRef} tabIndex={-1} role="group" aria-labelledby={id('conf-titre')} data-confirmation-reconciliation style={{ display: 'grid', gap: 10, outlineOffset: 4 }}>
          {/* Les valeurs vérifiées partent avec la confirmation. */}
          <input type="hidden" name="montant" value={valeurs.montant} />
          <input type="hidden" name="devise" value={valeurs.devise} />
          <input type="hidden" name="preuve" value={valeurs.preuve} />
          <input type="hidden" name="motif" value={valeurs.motif} />
          <p id={id('conf-titre')} style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Confirmer la réconciliation</p>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)', lineHeight: 1.55 }}>{conf?.texte}</p>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(84px, max-content) minmax(0, 1fr)', columnGap: 12, rowGap: 3, fontSize: 13 }}>
            <dt style={{ color: 'var(--muted)' }}>Preuve</dt><dd style={{ margin: 0, color: 'var(--ink-2)', overflowWrap: 'anywhere' }}>{valeurs.preuve.trim()}</dd>
            <dt style={{ color: 'var(--muted)' }}>Motif</dt><dd style={{ margin: 0, color: 'var(--ink-2)', overflowWrap: 'anywhere' }}>{valeurs.motif.trim()}</dd>
          </dl>
          {conf?.avertissement && (
            <p data-avertissement-depassement style={{ margin: 0, padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(245,166,35,.55)', fontSize: 13, color: '#f5b043', lineHeight: 1.5 }}>
              {conf.avertissement}
            </p>
          )}
          <p style={aide}>La ligne garde son montant réservé et sa cause ; la réconciliation s’ajoute à l’historique et ne se remplace pas.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="submit" disabled={enCours} style={{ ...bouton, opacity: enCours ? 0.7 : 1 }}>
              {enCours ? 'Enregistrement…' : 'Confirmer la réconciliation'}
            </button>
            <button type="button" disabled={enCours} onClick={() => { setEtape('saisie'); setTimeout(() => montantRef.current?.focus(), 0); }} style={boutonSecondaire}>Modifier</button>
          </div>
        </div>
      )}
      <p role="status" aria-live="polite" style={{ ...erreurTexte, margin: 0, minHeight: 0 }}>
        {etatServeur.statut !== 'initial' && !etatServeur.erreurs?.length ? etatServeur.message : ''}
      </p>
    </form>
  );
}
