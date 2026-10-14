import type { CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN, cheminProjetStudio, dateCourteUtc, type EtatAccueilProjets } from '@tiktrends/core';
import type { CarteProjet as Carte } from '../../lib/studios/sources/projet';
import { CarteProjet, PastilleEtape } from '../studios/projet/CarteProjet';
import { ApercuReprise } from './ApercuReprise';
import { Icon } from '../Icon';
import { btn, btnGhost, surface, vide } from '../ui';

/**
 * UX V2 · lot 5 · la tête de l'Accueil · reprendre ou créer un projet.
 *
 * L'état vient du noyau (`resoudreAccueilProjets`) · ce composant ne décide
 * rien, il montre. Données RÉELLES uniquement : titre, marque, étape, date et
 * manques viennent de la carte serveur ; l'aperçu est une sortie livrée servie
 * par la route gardée, sinon il n'y a pas d'image. Rôle fermé ⇒ rien n'est
 * rendu, l'Accueil d'avant reste.
 */

const sectionH: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-.01em' };
const lienDiscret: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: CIBLE_TACTILE_MIN, fontSize: 13, fontWeight: 600,
  color: 'var(--accent-strong)', textDecoration: 'none', whiteSpace: 'nowrap',
};
const note: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 };

export function TeteProjets({ etat, apercu }: { etat: EtatAccueilProjets<Carte>; apercu: string | null }) {
  if (etat.etat === 'ferme') return null;

  if (etat.etat === 'coupee') {
    return (
      <p role="status" data-accueil-projets="coupee" style={{ ...note, display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 22px' }}>
        <span aria-hidden style={{ color: 'var(--muted)', display: 'inline-flex', flexShrink: 0 }}><Icon name="lock" size={15} /></span>
        <span>{etat.message}</span>
      </p>
    );
  }

  if (etat.etat === 'erreur') {
    return (
      <p role="status" data-accueil-projets="erreur" style={{ ...note, margin: '0 0 22px' }}>
        Tes projets n’ont pas pu être lus pour l’instant · le reste de l’accueil reste disponible, recharge la page pour réessayer.
        {etat.traceId && <span style={{ color: 'var(--muted)' }}> Identifiant support : {etat.traceId}.</span>}{' '}
        <a href={etat.tous.href} style={lienDiscret}>{etat.tous.libelle}</a>
      </p>
    );
  }

  if (etat.etat === 'premier-usage') {
    return (
      <section aria-label="Projets" data-accueil-projets="premier-usage" style={{ ...vide, padding: 22, display: 'grid', gap: 10, marginBottom: 26 }}>
        <h2 style={sectionH}>Aucun projet pour l’instant</h2>
        <p style={note}>Un projet garde ses sources, son hypothèse, son produit et son brief · le créer ne génère rien et ne débite rien.</p>
        {(etat.nouveau || etat.veille) ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {etat.nouveau && <a href={etat.nouveau.href} style={{ ...btn, textDecoration: 'none' }}>{etat.nouveau.libelle}</a>}
            {etat.veille && <a href={etat.veille.href} style={lienDiscret}>{etat.veille.libelle}</a>}
          </div>
        ) : (
          <p style={{ ...note, color: 'var(--muted)' }}>Ton rôle permet de consulter les projets, pas d’en créer.</p>
        )}
      </section>
    );
  }

  const r = etat.reprendre;
  const bloquants = r.manques.filter((m) => m.bloquant);
  const manques = (bloquants.length ? bloquants : r.manques).slice(0, 3);
  return (
    <section aria-label="Reprendre ou créer un projet" data-accueil-projets="liste" style={{ marginBottom: 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 style={sectionH}>Reprendre là où tu en étais</h2>
        {/* Secondaire ici · le geste PRIMAIRE de la carte est « Reprendre le projet » (un seul aplat rose). */}
        {etat.nouveau && <a href={etat.nouveau.href} data-nouveau-projet-accueil style={{ ...btnGhost, fontSize: 13, color: 'var(--ink)', textDecoration: 'none' }}>{etat.nouveau.libelle}</a>}
      </div>

      <article data-reprendre={r.id} style={{ ...surface, background: 'var(--surface)', overflow: 'hidden', display: 'flex', flexWrap: 'wrap', alignItems: 'stretch' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0, padding: 'clamp(18px, 3vw, 28px)', display: 'grid', gap: 12, alignContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
            <span style={{ fontSize: 12, color: 'var(--ink-2)', overflowWrap: 'anywhere' }}>Dernier projet modifié · {r.marque || 'Marque'}</span>
          </div>
          <h3 style={{ margin: 0, fontSize: 'clamp(18px, 2.4vw, 21px)', fontWeight: 500, color: 'var(--ink)', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{r.title}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <PastilleEtape etape={r.etape} libelle={r.libelleEtape} />
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              {r.libelleType} · modifié le {dateCourteUtc(r.updatedAt)}{r.versionN ? ` · version ${r.versionN}` : ''}
            </span>
          </div>
          {manques.length > 0 && (
            <p style={{ ...note, fontSize: 12.5 }}>
              <span style={{ color: 'var(--muted)' }}>Ce qui manque · </span>{manques.map((m) => m.libelle).join(' · ')}
            </p>
          )}
          <div>
            <a href={cheminProjetStudio(r.id)} data-reprendre-lien style={{ ...btn, textDecoration: 'none' }}>Reprendre le projet</a>
          </div>
        </div>
        {apercu && <ApercuReprise src={apercu} titre={r.title} />}
      </article>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: etat.autres.length > 0 ? '22px 0 10px' : '6px 0 0' }}>
        {etat.autres.length > 0 ? <h2 style={sectionH}>Tes autres projets</h2> : <span />}
        <a href={etat.tous.href} style={lienDiscret}>{etat.tous.libelle} <span aria-hidden>›</span></a>
      </div>
      {etat.autres.length > 0 && (
        <div data-autres-projets style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 14 }}>
          {etat.autres.map((c) => <CarteProjet key={c.id} carte={c} />)}
        </div>
      )}
    </section>
  );
}
