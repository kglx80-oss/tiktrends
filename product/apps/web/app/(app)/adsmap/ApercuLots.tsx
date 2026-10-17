import Link from 'next/link';
import type { CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN, apercuLotsResultats, type FaitsLotApercu, type TonStatutLot } from '@tiktrends/core';
import { surface, tuile } from '../../../components/ui';

/**
 * La couleur de la pastille de statut (maquette V5) · un rôle sémantique par
 * ton, jamais un littéral. La pastille RENFORCE le libellé en clair posé juste à
 * côté · elle n'est pas le seul porteur du sens.
 */
const COULEUR_TON: Record<TonStatutLot, string> = {
  diffusion: 'var(--accent)',
  termine: 'var(--ok)',
  importe: 'var(--warn)',
  attente: 'var(--muted)',
};

/**
 * V5 · Résultats · la bande « Lots de test » de la vue d'ensemble.
 *
 * Calquée sur la maquette V5 · un en-tête de section avec « Tous les lots → »,
 * puis des cartes de lot. Les cartes sont bâties sur les lots RÉELS de la marque
 * active (`apercuLotsResultats`, noyau pur) · statut, nature, but, nombre de
 * variantes, et un lien vers le lot réel. AUCUNE performance n'y figure · un
 * aperçu de lot n'est pas une mesure.
 *
 * Ce que la maquette montre en plus (vignettes de variantes, barre « X / 14
 * jours », boutons Analyser / Préparer / Importer par statut) n'est pas rendu
 * ici · ces éléments demandent des données qui ne sont pas dans la liste des
 * lots (médias, durée de protocole) ou un service encore à créer (L08). On ne
 * les simule pas · chaque carte mène au lot, où l'action réelle vit.
 */

export function ApercuLots({ lots, peutVoirLots }: {
  lots: readonly FaitsLotApercu[];
  /** Vrai si l'onglet « Lots de test » est ouvert au rôle courant (admin). */
  peutVoirLots: boolean;
}) {
  const cartes = apercuLotsResultats(lots);
  return (
    <section aria-label="Lots de test" data-bloc="apercu-lots" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>Lots de test</h2>
        <span style={{ flex: 1 }} />
        {peutVoirLots && (
          <Link href="/adsmap/lots" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none' }}>
            Tous les lots →
          </Link>
        )}
      </div>

      {cartes.length === 0 ? (
        <div style={{ ...surface, background: 'var(--surface)', padding: '16px 18px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55 }}>
          Aucun lot pour cette marque · un lot regroupe des variantes sous une même fenêtre et un même
          protocole, pour les rendre comparables.
          {peutVoirLots && (
            <> <Link href="/adsmap/lots" style={{ color: 'var(--accent-strong)', fontWeight: 700, textDecoration: 'none' }}>Préparer un lot ›</Link></>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {cartes.map((c) => (
            <Link key={c.id} href={c.href} data-carte-lot style={carte}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: COULEUR_TON[c.ton] }} />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>{c.statut}</span>
                {c.importe && <span style={badgeImporte}>Importé</span>}
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{c.variantes} variante{c.variantes > 1 ? 's' : ''}</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{c.titre}</div>
              {c.but && <div style={{ marginTop: 2, fontSize: 12, color: 'var(--muted)', lineHeight: 1.45, overflowWrap: 'anywhere' }}>{c.but}</div>}
              <span style={ouvrir}>Ouvrir le lot →</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

const carte: CSSProperties = {
  ...surface, display: 'flex', flexDirection: 'column', minHeight: CIBLE_TACTILE_MIN,
  padding: '14px 16px', background: 'var(--surface)', color: 'var(--ink)', textDecoration: 'none',
};

const badgeImporte: CSSProperties = {
  ...tuile, padding: '1px 8px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', background: 'var(--paper)',
};

const ouvrir: CSSProperties = {
  marginTop: 'auto', paddingTop: 12, fontSize: 12, fontWeight: 700, color: 'var(--accent-strong)',
};
