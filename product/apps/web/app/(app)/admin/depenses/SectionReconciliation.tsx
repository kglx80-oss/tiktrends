import type { CSSProperties } from 'react';
import type { EcranReconciliation } from '@tiktrends/core';
import { surface, tuile, cadreSignal } from '../../../../components/ui';

/**
 * R4 · « À réconcilier » sur l'écran des dépenses du propriétaire.
 *
 * Affiche ce que R3 a rendu lisible (`ai_spend.reconcile_reason`) : chaque
 * appel dont l'issue est incertaine, gardé au MAXIMUM réservé en attendant la
 * facture. Rendu pur d'un modèle décidé dans le noyau (`ecranReconciliation`) ·
 * aucune écriture, aucun bouton qui modifie une ligne.
 *
 * Trois états : vide (le silence, le plus fréquent), rempli, lecture
 * impossible. Liste par défaut à toutes les largeurs (une carte par ligne,
 * jamais un tableau à défiler de côté à 390 px) ; le statut est dit en
 * toutes lettres, jamais par la seule couleur.
 */

const discret: CSSProperties = { margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, overflowWrap: 'anywhere' };
const etiquette: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)' };
const titre: CSSProperties = { margin: 0, fontSize: 19, fontWeight: 500, color: 'var(--ink)' };

export function SectionReconciliation({ ecran, erreur }: { ecran: EcranReconciliation | null; erreur?: string | null }) {
  const etat = erreur || !ecran ? 'erreur' : ecran.etat;
  const attention = etat === 'rempli';
  return (
    <section
      id="a-reconcilier" aria-labelledby="dep-reconcilier-titre" data-reconciliation={etat}
      style={{ marginTop: 26, padding: '16px 18px', display: 'grid', gap: 12, minWidth: 0, ...(attention || etat === 'erreur' ? cadreSignal('rgba(245,166,35,.55)') : surface), background: 'var(--surface)' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 id="dep-reconcilier-titre" style={titre}>À réconcilier avec la facture</h2>
        <span style={{ flex: 1 }} />
        <span data-statut style={{ padding: '3px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: attention || etat === 'erreur' ? '#f5b043' : 'var(--ink-2)', border: `1px solid ${attention || etat === 'erreur' ? 'rgba(245,166,35,.5)' : 'var(--line)'}` }}>
          {etat === 'erreur' ? 'Lecture impossible' : attention ? `${ecran!.nombre} à rapprocher` : 'Rien à rapprocher'}
        </span>
      </div>

      {etat === 'erreur' ? (
        <p role="alert" style={{ ...discret, color: '#f5b043' }}>
          Les lignes à réconcilier n’ont pas pu être lues · {erreur || 'base indisponible'}. Le plafond, lui, continue de les compter au maximum.
        </p>
      ) : (
        <p role="status" style={{ ...discret, color: attention ? 'var(--ink)' : 'var(--ink-2)' }}>{ecran!.resume}</p>
      )}

      {etat === 'rempli' && ecran && (
        <>
          <p style={discret}><b style={{ fontWeight: 600, color: 'var(--ink)' }}>À faire · </b>{ecran.consigne}</p>
          {ecran.parFournisseur.length > 0 && (
            <ul aria-label="Par fournisseur" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ecran.parFournisseur.map((f) => (
                <li key={f} style={{ ...tuile, padding: '6px 11px', fontSize: 12.5, color: 'var(--ink-2)' }}>{f}</li>
              ))}
            </ul>
          )}
          <ol aria-label="Lignes à réconcilier" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {ecran.lignes.map((l) => (
              <li key={l.id} data-ligne-reconcilier={l.id} style={{ ...tuile, padding: '10px 14px', display: 'grid', gap: 6, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 600, overflowWrap: 'anywhere' }}>{l.action}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 600, whiteSpace: 'nowrap' }}>{l.reserve}</span>
                </div>
                <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(84px, max-content) minmax(0, 1fr)', columnGap: 12, rowGap: 3 }}>
                  <dt style={etiquette}>Quand</dt><dd style={{ ...discret, margin: 0 }}>{l.quand}</dd>
                  <dt style={etiquette}>Fournisseur</dt><dd style={{ ...discret, margin: 0 }}>{l.fournisseur}{l.modele ? ` · ${l.modele}` : ''}</dd>
                  <dt style={etiquette}>Cause</dt><dd style={{ ...discret, margin: 0 }}>{l.cause}</dd>
                  <dt style={etiquette}>Réservé</dt><dd style={{ ...discret, margin: 0 }}>{l.reserve} au maximum, compté au plafond</dd>
                </dl>
                <p style={{ ...discret, color: 'var(--ink)' }}>{l.aFaire}</p>
              </li>
            ))}
          </ol>
          <p style={{ ...discret, fontSize: 11.5, color: 'var(--muted)' }}>
            Le rapprochement se fait sur la facture du fournisseur · cet écran ne modifie aucune ligne et ne libère aucun montant.
          </p>
        </>
      )}
    </section>
  );
}
