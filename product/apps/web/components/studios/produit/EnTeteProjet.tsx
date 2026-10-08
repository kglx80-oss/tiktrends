import Link from 'next/link';
import { CIBLE_TACTILE_MIN, type ErreurStudio } from '@tiktrends/core';
import { h1, surface } from '../../ui';
import { Icon } from '../../Icon';

/**
 * En-tête commun des sous-pages d'un projet (Produit, Textes) · retour au
 * projet, titre, projet · marque · version. Et l'état de refus neutre
 * (introuvable hors portée, accès réservé, erreur avec identifiant support).
 */

export function EnTeteProjet({ projet, version, titre, sousTitre }: { projet: { id: string; title: string; marque: string }; version: { n: number }; titre: string; sousTitre: string }) {
  return (
    <header style={{ display: 'grid', gap: 8 }}>
      <Link href={`/studio/projets/${projet.id}`} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none', minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center' }}>‹ {projet.title}</Link>
      <h1 style={{ ...h1, overflowWrap: 'anywhere' }}>{titre}</h1>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', overflowWrap: 'anywhere' }}>{projet.marque} · version {version.n} · {sousTitre}</p>
    </header>
  );
}

export function RefusProjet({ r, plan }: { r: ErreurStudio; plan: boolean }) {
  const refuse = r.code === 'FORBIDDEN' || r.code === 'AUTH_REQUIRED';
  return (
    <>
      <Link href="/studio/projets" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none', minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center' }}>‹ Projets</Link>
      <h1 style={h1}>{refuse ? 'Accès réservé' : r.code === 'NOT_FOUND' ? 'Projet introuvable' : 'Projet indisponible'}</h1>
      <div data-etat={refuse ? 'acces-refuse' : r.code === 'NOT_FOUND' ? 'introuvable' : 'erreur'} style={{ marginTop: 18, padding: 24, ...surface, background: 'var(--surface)', display: 'grid', gap: 8, maxWidth: 640 }}>
        <div style={{ color: 'var(--muted)' }}><Icon name={refuse ? 'lock' : 'search'} size={28} /></div>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>
          {refuse
            ? (plan ? 'Les projets du Studio sont disponibles à partir du plan Core.' : 'Ton rôle ne permet pas d’ouvrir les projets du Studio · demande un rôle Membre.')
            : r.message}
        </p>
        {!refuse && r.code !== 'NOT_FOUND' && <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Identifiant support : {r.traceId}</p>}
      </div>
    </>
  );
}
