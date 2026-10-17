import type { CSSProperties, ReactNode } from 'react';
import { CIBLE_TACTILE_MIN, type CarteIterationAccueil, type EtatProchainesIterations } from '@tiktrends/core';
import { Icon } from '../Icon';
import { btn, surface, tuile, vide } from '../ui';

/**
 * UX V5 · « Prochaines itérations » (G04 à G14).
 *
 * L'état vient du noyau (`etatProchainesIterations`) · ce composant montre.
 * Seulement des gagnantes PROUVÉES (verdict arbitré, comparable au protocole),
 * avec la métrique mesurée, sa période et sa source · aucun devis (il n'en
 * existe pas avant la génération). « Itérer » mène à la préparation du projet,
 * brief d'itération repris (`lienIterationStudio`) · rien n'est généré ni
 * débité au clic.
 */

const lien: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: CIBLE_TACTILE_MIN, fontSize: 13, fontWeight: 600,
  color: 'var(--accent-strong)', textDecoration: 'none', whiteSpace: 'nowrap',
};
const puce: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, fontSize: 12.5, lineHeight: 1.35, minWidth: 0,
};

function Cadre({ children, droite }: { children: ReactNode; droite?: ReactNode }) {
  return (
    <section id="prochaines-iterations" aria-labelledby="accueil-iterations-titre" data-accueil-iterations
      style={{ ...surface, background: 'var(--surface)', padding: 'clamp(16px, 2.4vw, 22px)', marginBottom: 22, minWidth: 0, scrollMarginTop: 90 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
        {/* V5 · la tuile d'en-tête est le carré magenta PLEIN au glyphe de relance blanc (maquette Accueil et Studios · tranché sur 2.webp) · gradient + `--on-accent`, jamais le lavis `--accent-soft`. */}
        <span aria-hidden style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: 'var(--grad-accent)', color: 'var(--on-accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="refresh" size={19} />
        </span>
        <div style={{ display: 'grid', gap: 2, minWidth: 0, flex: '1 1 220px' }}>
          <h2 id="accueil-iterations-titre" style={{ margin: 0, fontSize: 19, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-.01em' }}>Prochaines itérations</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Ce que tes tests arbitrés disent de relancer</p>
        </div>
        {droite}
      </div>
      {children}
    </section>
  );
}

function Carte({ c }: { c: CarteIterationAccueil }) {
  return (
    <article data-iteration={c.adId} style={{ ...tuile, background: 'var(--bg)', padding: 18, display: 'grid', gap: 12, alignContent: 'start', minWidth: 0 }}>
      {/* Le « · » vit DANS l'élément qu'il précède · au retour à la ligne, il ne reste jamais seul en fin de ligne. */}
      <div style={{ display: 'flex', alignItems: 'center', columnGap: 8, rowGap: 4, flexWrap: 'wrap', fontSize: 12.5, fontWeight: 600 }}>
        <span data-verdict style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--ok-text)' }}><Icon name="check" size={13} />{c.verdict}</span>
        <span style={{ color: 'var(--ink-2)', whiteSpace: 'nowrap' }}><span aria-hidden style={{ color: 'var(--muted)' }}>· </span><span data-lot>{c.lot}</span></span>
        {c.apprentissageValide && <span style={{ color: 'var(--ink-2)', whiteSpace: 'nowrap' }}><span aria-hidden style={{ color: 'var(--muted)' }}>· </span>Apprentissage validé</span>}
      </div>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.35, overflowWrap: 'anywhere' }}>{c.titre}</h3>

      {c.mesure ? (
        <div data-mesure style={{ display: 'grid', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 26, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-.02em', lineHeight: 1.1 }}>{c.mesure.valeur}</b>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{c.mesure.libelle}</span>
          </div>
          <span data-periode style={{ fontSize: 12, color: 'var(--muted)' }}>{c.mesure.periode} · {c.mesure.source}</span>
        </div>
      ) : (
        <p data-mesure-absente style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>Aucune mesure synchronisée pour ce verdict · il a été arbitré sans métrique lisible.</p>
      )}

      <div style={{ display: 'grid', gap: 6 }}>
        {c.garde && (
          <span data-garde style={{ ...puce, background: 'var(--paper)', color: 'var(--ink-2)' }}>
            <span aria-hidden style={{ display: 'inline-flex', color: 'var(--muted)' }}><Icon name="lock" size={13} /></span>{c.garde}
          </span>
        )}
        <span data-change style={{ ...puce, background: 'var(--accent-soft)', color: 'var(--accent-strong)', fontWeight: 600 }}>
          <span aria-hidden style={{ display: 'inline-flex' }}><Icon name="swap" size={13} /></span>{c.change}
        </span>
      </div>

      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>{c.raison}</p>

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        {c.iterer
          ? <a href={c.iterer} data-iterer style={{ ...btn, gap: 8, textDecoration: 'none' }}><Icon name="refresh" size={14} />Itérer</a>
          : <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>Ton rôle ne permet pas de créer le projet de cette itération.</p>}
      </div>
    </article>
  );
}

export function ProchainesIterations({ etat }: { etat: EtatProchainesIterations }) {
  if (etat.etat === 'ferme') return null;

  if (etat.etat === 'offre' || etat.etat === 'sans-marque' || etat.etat === 'erreur') {
    return (
      <Cadre>
        <p role="status" data-iterations-etat={etat.etat} style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 8 }}>
          {etat.etat === 'offre' && <span aria-hidden style={{ display: 'inline-flex', color: 'var(--muted)' }}><Icon name="lock" size={14} /></span>}
          {etat.message}
        </p>
      </Cadre>
    );
  }

  if (etat.etat === 'vide') {
    return (
      <Cadre>
        <div data-iterations-etat="vide" style={{ ...vide, padding: 18, display: 'grid', gap: 6 }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)' }}>{etat.message}</p>
          <div><a href={etat.resultats} style={lien}>Voir les Résultats <span aria-hidden>→</span></a></div>
        </div>
      </Cadre>
    );
  }

  const reste = etat.total - etat.cartes.length;
  return (
    <Cadre droite={<a href={etat.boucle} data-voir-boucle style={lien}>Voir la boucle <span aria-hidden>→</span></a>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 14 }}>
        {etat.cartes.map((c) => <Carte key={c.adId} c={c} />)}
      </div>
      <a href={etat.autres} data-autres-iterations style={{ ...vide, marginTop: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', minHeight: CIBLE_TACTILE_MIN }}>
        <span aria-hidden style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: 'var(--paper)', color: 'var(--ink-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={15} /></span>
        <span style={{ display: 'grid', gap: 1, minWidth: 0 }}>
          <b style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Itérer sur une autre créative</b>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            {reste > 0 ? `${reste} autre${reste > 1 ? 's' : ''} gagnante${reste > 1 ? 's' : ''} prouvée${reste > 1 ? 's' : ''} dans Suites` : 'Toutes les suites proposées par tes tests'}
          </span>
        </span>
      </a>
    </Cadre>
  );
}
