import type { CSSProperties } from 'react';
import type { EcranReconciliees } from '@tiktrends/core';
import { surface, tuile, cadreSignal } from '../../../../components/ui';

/**
 * R5 · l'historique « Réconciliées » · chaque réconciliation ajoutée, avec le
 * montant réservé (gardé sur la ligne), le facturé retenu au plafond, l'écart,
 * la preuve fournisseur, le motif, l'auteur et la date. Lecture seule : une
 * réconciliation ne se modifie ni ne se supprime (table en ajout seul).
 *
 * `vientDe` · la réconciliation que le geste vient d'enregistrer (ou de
 * retrouver sous la même clé) : dite dans une région d'état, et marquée sur sa
 * carte par un texte, jamais par la seule couleur.
 */

const discret: CSSProperties = { margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, overflowWrap: 'anywhere' };
const etiquette: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)' };

export function SectionReconciliees({ ecran, erreur, vientDe, deja }: { ecran: EcranReconciliees | null; erreur?: string | null; vientDe?: string | null; deja?: boolean }) {
  const etat = erreur || !ecran ? 'erreur' : ecran.etat;
  const recente = ecran && vientDe ? ecran.lignes.find((l) => l.id === vientDe) ?? null : null;
  return (
    <section
      id="reconciliees" aria-labelledby="dep-reconciliees-titre" data-reconciliees={etat}
      style={{ marginTop: 18, padding: '16px 18px', display: 'grid', gap: 12, minWidth: 0, scrollMarginTop: 80, ...surface, background: 'var(--surface)' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 id="dep-reconciliees-titre" style={{ margin: 0, fontSize: 19, fontWeight: 500, color: 'var(--ink)' }}>Réconciliées</h2>
        <span style={{ flex: 1 }} />
        <span style={{ padding: '3px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)', border: '1px solid var(--line)' }}>
          {etat === 'erreur' ? 'Lecture impossible' : `${ecran!.lignes.length} au total`}
        </span>
      </div>
      <p role="status" data-reconciliation-recente={recente ? recente.id : undefined} style={{ ...discret, color: 'var(--ink)', fontWeight: recente ? 600 : 400 }}>
        {recente ? `${deja ? 'Déjà enregistrée sous ce formulaire, aucun doublon' : 'Réconciliation enregistrée'} · ${recente.action}, réservé ${recente.reserve} → facturé ${recente.facture}.` : ''}
      </p>
      {etat === 'erreur' ? (
        <p role="alert" style={{ ...discret, color: '#f5b043' }}>L’historique n’a pas pu être lu · {erreur || 'base indisponible'}.</p>
      ) : (
        <p style={discret}>{ecran!.resume}</p>
      )}
      {etat === 'rempli' && ecran && (
        <ol aria-label="Dépenses réconciliées" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
          {ecran.lignes.map((l) => (
            <li
              key={l.id} data-ligne-reconciliee={l.id}
              style={{ ...(l.id === vientDe ? cadreSignal('rgba(76,201,140,.6)', 'tuile') : tuile), padding: '10px 14px', display: 'grid', gap: 6, minWidth: 0 }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 600, overflowWrap: 'anywhere' }}>{l.action}</span>
                {l.id === vientDe && <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)' }}>· à l’instant</span>}
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 600, whiteSpace: 'nowrap' }}>{l.reserve} → {l.facture}</span>
              </div>
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(84px, max-content) minmax(0, 1fr)', columnGap: 12, rowGap: 3 }}>
                <dt style={etiquette}>Appel</dt><dd style={{ ...discret, margin: 0 }}>{l.appel} · {l.fournisseur}{l.modele ? ` · ${l.modele}` : ''}</dd>
                <dt style={etiquette}>Réservé</dt><dd style={{ ...discret, margin: 0 }}>{l.reserve}, gardé sur la ligne</dd>
                <dt style={etiquette}>Facturé</dt><dd style={{ ...discret, margin: 0 }}>{l.facture}, retenu au plafond</dd>
                <dt style={etiquette}>Écart</dt><dd style={{ ...discret, margin: 0, color: l.depasse ? '#f5b043' : discret.color }}>{l.depasse ? 'Dépassement · ' : ''}{l.ecart}</dd>
                <dt style={etiquette}>Preuve</dt><dd style={{ ...discret, margin: 0 }}>{l.preuve}</dd>
                <dt style={etiquette}>Motif</dt><dd style={{ ...discret, margin: 0 }}>{l.motif}</dd>
                <dt style={etiquette}>Par</dt><dd style={{ ...discret, margin: 0 }}>{l.auteur}, le {l.le}</dd>
              </dl>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
