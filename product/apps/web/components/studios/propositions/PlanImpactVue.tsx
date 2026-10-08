import { MENTION_SANS_GENERATION } from '@tiktrends/core';
import type { ImpactPresente, NoeudPresente } from '../../../lib/studios/propositions/types';
import { mini, texte } from './styles';
import { tuile } from '../../ui';

/**
 * Plan d'impact d'une proposition, calculé par le SERVEUR (graphe L1) :
 * ce qui est touché par le changement, puis l'état réel des médias de la base
 * (à refaire, réutilisés, obsolètes), le coût INDICATIF des générations
 * touchées (grille L3, non débité, devis requis) et la mention qu'appliquer ne
 * génère rien et ne débite rien.
 */

function Groupe({ titre, noeuds, vide }: { titre: string; noeuds: NoeudPresente[]; vide: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ ...mini, fontWeight: 600, color: 'var(--ink-2)' }}>{titre} · {noeuds.length}</p>
      {noeuds.length === 0
        ? <p style={mini}>{vide}</p>
        : (
          <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            {noeuds.slice(0, 12).map((n) => <li key={n.id} style={{ overflowWrap: 'anywhere' }}>{n.libelle}{n.nature === 'generation' ? ' · génération' : ''}</li>)}
            {noeuds.length > 12 && <li>… et {noeuds.length - 12} autre(s)</li>}
          </ul>
        )}
    </div>
  );
}

export function PlanImpactVue({ impact }: { impact: ImpactPresente | null }) {
  if (!impact) return <p style={mini}>Plan d’impact indisponible pour cette proposition.</p>;
  const generations = impact.touchees.filter((n) => n.nature === 'generation');
  return (
    <section aria-label="Plan d’impact" style={{ ...tuile, padding: 12, background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600 }}>Impact si tu appliques</p>
      <Groupe titre="Touché par ce changement" noeuds={impact.touchees} vide="Rien d’autre que le document." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
        <Groupe titre="À refaire" noeuds={impact.aRefaire} vide="Rien à refaire." />
        <Groupe titre="Réutilisé" noeuds={impact.reutilisees} vide="Aucun média existant réutilisé." />
        <Groupe titre="Obsolète" noeuds={impact.obsoletes} vide="Aucun média rendu obsolète." />
      </div>
      <p style={mini}>
        {generations.length === 0
          ? 'Aucune génération touchée · seule la composition ou le montage serait recalculé.'
          : `Coût indicatif si tu génères ensuite · ${impact.creditsIndicatifs} crédit${impact.creditsIndicatifs > 1 ? 's' : ''} pour ${generations.length} génération${generations.length > 1 ? 's' : ''}, non débité · un devis sera demandé.`}
        {impact.nonTarifees.length > 0 && ` Sans tarif dans l’offre · ${impact.nonTarifees.join(', ')} (le devis les refusera).`}
      </p>
      <p style={{ ...texte, color: 'var(--ink)', display: 'flex', gap: 8 }}>
        <span aria-hidden="true" style={{ color: 'var(--ok)' }}>●</span>
        <span>{MENTION_SANS_GENERATION}</span>
      </p>
    </section>
  );
}
