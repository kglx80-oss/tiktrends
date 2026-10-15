import type { CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN, cheminProjetStudio, dateCourteUtc, rangEtapeProjet, ORDRE_ETAPES_PROJET, type EtapeProjet, type EtatAccueilProjets } from '@tiktrends/core';
import type { CarteProjet as Carte } from '../../lib/studios/sources/projet';
import { ApercuReprise } from './ApercuReprise';
import { Icon } from '../Icon';
import { btn, surface, tuile, vide } from '../ui';

/**
 * La tête de l'Accueil · reprendre un projet · mise en forme V5 (« Reprendre »).
 *
 * L'état vient du noyau (`resoudreAccueilProjets`) · ce composant ne décide
 * rien, il montre. Données RÉELLES uniquement : titre, marque, étape, date et
 * manques viennent de la carte serveur ; l'aperçu est une sortie livrée servie
 * par la route gardée, sinon il n'y a pas d'image (une vignette neutre au
 * pictogramme du type, jamais une image inventée). Rôle fermé ⇒ rien n'est
 * rendu.
 *
 * V5 · « Nouveau projet » vit dans les tuiles d'action (même règle,
 * `etat.nouveau`) · la liste ne le double plus. Le premier usage le garde ·
 * c'est le geste de cet état.
 */

const sectionH: CSSProperties = { margin: 0, fontSize: 19, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-.01em' };
const lienDiscret: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: CIBLE_TACTILE_MIN, fontSize: 13, fontWeight: 600,
  color: 'var(--accent-strong)', textDecoration: 'none', whiteSpace: 'nowrap',
};
const note: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 };

const ICONE_TYPE: Readonly<Record<string, string>> = { image: 'image', video: 'film', ads: 'sparkles', text: 'file', campaign: 'layers' };

/** La barre d'étapes V5 · trois segments, le mot de l'étape à côté (jamais la couleur seule). */
function BarreEtapes({ etape, libelle }: { etape: EtapeProjet; libelle: string }) {
  const rang = rangEtapeProjet(etape);
  return (
    <span data-etape={etape} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink-2)', minWidth: 0 }}>
      <span aria-hidden style={{ display: 'inline-flex', gap: 3, flexShrink: 0 }}>
        {ORDRE_ETAPES_PROJET.map((e, i) => (
          <span key={e} style={{ width: 18, height: 4, borderRadius: 2, background: i < rang ? 'var(--accent-strong)' : 'var(--line-2)' }} />
        ))}
      </span>
      {libelle}
    </span>
  );
}

function VignetteType({ kind }: { kind: string }) {
  return (
    <span aria-hidden style={{ width: 56, height: 56, borderRadius: 10, flexShrink: 0, background: 'var(--paper)', color: 'var(--ink-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={ICONE_TYPE[kind] ?? 'folder'} size={20} />
    </span>
  );
}

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
    <section aria-labelledby="accueil-reprendre" data-accueil-projets="liste" style={{ ...surface, background: 'var(--surface)', padding: 'clamp(16px, 2.4vw, 22px)', marginBottom: 26, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 id="accueil-reprendre" style={sectionH}>Reprendre</h2>
        <a href={etat.tous.href} style={lienDiscret}>{etat.tous.libelle} <span aria-hidden>→</span></a>
      </div>

      <article data-reprendre={r.id} style={{ ...tuile, background: 'var(--bg)', padding: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, minWidth: 0 }}>
        {apercu ? <ApercuReprise src={apercu} titre={r.title} vignette /> : <VignetteType kind={r.kind} />}
        <div style={{ flex: '1 1 240px', minWidth: 0, display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' }}>Dernier projet modifié · {r.marque || 'Marque'}</span>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{r.title}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <BarreEtapes etape={r.etape} libelle={r.libelleEtape} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {r.libelleType} · modifié le {dateCourteUtc(r.updatedAt)}{r.versionN ? ` · version ${r.versionN}` : ''}
            </span>
          </div>
          {manques.length > 0 && (
            <p style={{ ...note, fontSize: 12.5 }}>
              <span style={{ color: 'var(--muted)' }}>Ce qui manque · </span>{manques.map((m) => m.libelle).join(' · ')}
            </p>
          )}
        </div>
        <a href={cheminProjetStudio(r.id)} data-reprendre-lien style={{ ...btn, textDecoration: 'none', flexShrink: 0 }}>Reprendre le projet</a>
      </article>

      {etat.autres.length > 0 && (
        <>
          <p style={{ margin: '18px 0 4px', fontSize: 12, fontWeight: 600, color: 'var(--muted)', letterSpacing: '.04em', textTransform: 'uppercase' }}>Tes autres projets</p>
          <ul data-autres-projets style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))', columnGap: 18 }}>
            {etat.autres.map((c) => (
              <li key={c.id} style={{ minWidth: 0, borderBottom: '1px solid var(--line)' }}>
                <a href={cheminProjetStudio(c.id)} data-projet={c.id} aria-label={`${c.title} · ${c.marque} · ${c.libelleEtape}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: CIBLE_TACTILE_MIN, padding: '10px 2px', textDecoration: 'none', color: 'inherit', minWidth: 0 }}>
                  <VignetteType kind={c.kind} />
                  <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                    <h3 title={c.title} style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</h3>
                    <span style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.marque || 'Marque'} · {c.libelleType}</span>
                    <BarreEtapes etape={c.etape} libelle={c.libelleEtape} />
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
