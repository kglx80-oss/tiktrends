import Link from 'next/link';
import type { CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN, apercuLotsResultats, type FaitsLotApercu, type TonStatutLot } from '@tiktrends/core';
import { surface, tuile } from '../../../components/ui';
import { Icon } from '../../../components/Icon';

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
 * La VIGNETTE est le média RÉEL d'une variante du lot (`thumbUrl`, issu de la
 * créa persistée ou de l'asset) · jamais une image fabriquée. Un lot sans aucun
 * média pose une vignette vide honnête (l'icône d'image sur un fond neutre), pas
 * un faux visuel. Ce que la maquette montre en plus (barre « X / 14 jours »,
 * boutons Analyser / Préparer / Importer par statut) n'est pas rendu ici · la
 * progression demande la durée du protocole et une horloge, les actions un
 * service encore à créer (L08) · on ne les simule pas · chaque carte mène au lot,
 * où l'action réelle vit.
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
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(236px, 1fr))' }}>
          {cartes.map((c) => (
            <Link key={c.id} href={c.href} data-carte-lot style={carte}>
              {/* La vignette · média RÉEL d'une variante (thumbUrl), ou une
                  vignette vide honnête · aucune image fabriquée. Décorative ·
                  le lot est déjà nommé par son titre et son but juste dessous. */}
              <div data-vignette-lot style={vignette}>
                {c.thumbUrl
                  ? <img src={c.thumbUrl} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : <span aria-hidden style={{ color: 'var(--muted)', display: 'inline-flex' }}><Icon name="image" size={26} /></span>}
              </div>
              <div style={corps}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: COULEUR_TON[c.ton] }} />
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>{c.statut}</span>
                  {c.importe && <span style={badgeImporte}>Importé</span>}
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{c.variantes} variante{c.variantes > 1 ? 's' : ''}</span>
                </div>
                <div style={{ marginTop: 6, fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{c.titre}</div>
                {c.but && <div style={{ marginTop: 2, fontSize: 12, color: 'var(--muted)', lineHeight: 1.45, overflowWrap: 'anywhere' }}>{c.but}</div>}
                <span style={ouvrir}>Ouvrir le lot →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

const carte: CSSProperties = {
  ...surface, display: 'flex', flexDirection: 'column', minHeight: CIBLE_TACTILE_MIN,
  padding: 0, overflow: 'hidden', background: 'var(--surface)', color: 'var(--ink)', textDecoration: 'none',
};

/**
 * La vignette · une fenêtre média en tête de carte (maquette V5). Fond neutre au
 * jeton · quand aucune image réelle n'existe, l'icône d'image signale une
 * vignette vide, sans jamais fabriquer de visuel. `aspectRatio` fige la hauteur
 * sans horloge ni mesure.
 */
const vignette: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  aspectRatio: '16 / 9', width: '100%', background: 'var(--paper)',
  borderBottom: '1px solid var(--line-2)', overflow: 'hidden',
};

const corps: CSSProperties = {
  display: 'flex', flexDirection: 'column', flex: 1, padding: '12px 16px 14px',
};

const badgeImporte: CSSProperties = {
  ...tuile, padding: '1px 8px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', background: 'var(--paper)',
};

const ouvrir: CSSProperties = {
  marginTop: 'auto', paddingTop: 12, fontSize: 12, fontWeight: 700, color: 'var(--accent-strong)',
};
