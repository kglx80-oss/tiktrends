import Link from 'next/link';
import type { CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN, DEFINITIONS_CAPACITES, type CapaciteStudio } from '@tiktrends/core';
import { ALTERNATIVE_HISTORIQUE } from '../../lib/navigation';
import { Icon } from '../Icon';
import { h1, surface } from '../ui';

/**
 * F1 · l'écran « non activé pour cet espace » (cahier 01 §14).
 *
 * Rendu quand une capacité Studios est coupée par un interrupteur (refus
 * `UNSUPPORTED_CAPABILITY` qui nomme ses capacités). Il dit QUOI est coupé,
 * POURQUOI (recette en cours), que rien n'a été écrit ni débité, et propose
 * des portes qui existent : le projet, l'écran historique équivalent (jamais
 * coupé). Statut porté par le texte, pas par la couleur ; cibles de 44 px.
 */

const lien: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, minWidth: CIBLE_TACTILE_MIN, padding: '0 16px',
  borderRadius: 999, border: '1px solid var(--line-2)', color: 'var(--ink)', fontSize: 13.5, fontWeight: 700, textDecoration: 'none',
};

export function CapaciteNonActive({ capacites, projectId }: { capacites: readonly CapaciteStudio[]; projectId?: string | null }) {
  const premieres = capacites.length ? capacites : (['projets'] as const);
  const defs = premieres.map((c) => DEFINITIONS_CAPACITES[c]);
  const versProjet = projectId && !premieres.includes('projets') ? `/studio/projets/${encodeURIComponent(projectId)}` : null;
  const alternative = premieres.map((c) => ALTERNATIVE_HISTORIQUE[c]).find(Boolean) ?? null;
  return (
    <section data-etat="non-active" data-capacites={premieres.join(' ')} aria-labelledby="titre-non-active" style={{ display: 'grid', gap: 14, maxWidth: 680 }}>
      <Link href={versProjet ?? '/studio'} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none', minHeight: CIBLE_TACTILE_MIN, minWidth: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center', width: 'fit-content' }}>
        ‹ {versProjet ? 'Projet' : 'Studio IA'}
      </Link>
      <h1 id="titre-non-active" style={{ ...h1, overflowWrap: 'anywhere' }}>{defs.map((d) => d.libelle).join(' · ')}</h1>
      <div role="status" style={{ ...surface, background: 'var(--surface)', padding: 22, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink)' }}>
          <span aria-hidden style={{ color: 'var(--muted)', display: 'inline-flex' }}><Icon name="lock" size={22} /></span>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Non activé pour cet espace</p>
        </div>
        {defs.map((d) => (
          <p key={d.libelle} style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55, overflowWrap: 'anywhere' }}>
            {d.libelle} · {d.couvre}.{d.raison ? ` En recette : ${d.raison}.` : ' Coupé par l’équipe de la plateforme.'}
          </p>
        ))}
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55 }}>
          Rien n’a été écrit ni débité. Tes projets, leurs versions et leurs médias restent intacts et réapparaissent dès l’activation.
        </p>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          L’ouverture se fait d’abord pour des espaces pilotes, puis pour tous après recette. Pour en faire partie, écris à l’équipe depuis le support.
        </p>
      </div>
      <nav aria-label="Continuer ailleurs" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {versProjet && <Link href={versProjet} style={lien}>Revenir au projet</Link>}
        {alternative && <Link href={alternative.href} style={lien}>Ouvrir {alternative.label}</Link>}
        <Link href="/support" style={lien}>Écrire au support</Link>
      </nav>
    </section>
  );
}
