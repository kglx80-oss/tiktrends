import Link from 'next/link';
import type { CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN, LIBELLE_NATURE, type EtapeParcours, type NatureEtape } from '@tiktrends/core';
import { tuile, cadreSignal } from './ui';

/**
 * Le parcours de la boucle créative (UX V2 · lot 4a) · Veille (source →
 * analyse → projet) et Résultats (hypothèse → lot → mesures → apprentissage).
 *
 * Purement présentationnel · les étapes, leurs états et leurs liens viennent
 * du noyau (`parcoursVeille`, `parcoursResultats`) · aucune règle ici. Chaque
 * étape affiche sa NATURE (observation, hypothèse, organisation, résultat
 * mesuré, apprentissage) · c'est elle qui empêche de lire une piste comme un
 * résultat.
 *
 * Une bande · colonnes d'au moins 230 px qui remplissent la largeur sur
 * ordinateur et défilent horizontalement sur mobile (aucun débordement de
 * PAGE) · la grille de la Veille et la file « À décider » ne sont pas
 * repoussées d'un écran entier au téléphone.
 */
export function ParcoursBoucle({ etapes, titre, prochaine = null, variant = 'riche' }: {
  etapes: EtapeParcours[];
  /** Nom accessible de la liste (« Parcours de la Veille »…). */
  titre: string;
  /** La première étape sans donnée · signalée « à faire ensuite ». */
  prochaine?: string | null;
  /**
   * `riche` (défaut, la Veille) · chaque étape porte son aide et ses liens.
   * `bande` (Résultats V5) · une bande compacte · l'étape garde sa donnée réelle
   * (titre, nature, état mesuré) et devient cliquable vers sa destination
   * principale · l'aide et les liens secondaires, redondants avec les onglets et
   * les ancres de la page, sont retirés de la PRÉSENTATION (la fonction demeure).
   */
  variant?: 'riche' | 'bande';
}) {
  if (variant === 'bande') {
    return (
      <ol aria-label={titre} data-zone="parcours-boucle" data-variante="bande" style={bande}>
        {etapes.map((e) => {
          const estProchaine = prochaine === e.cle;
          const atteinte = e.etat?.atteinte ?? null;
          const href = e.liens[0]?.href ?? null;
          const dedans = (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px 8px', flexWrap: 'wrap', minWidth: 0 }}>
                <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 999, flexShrink: 0, fontSize: 11, fontWeight: 800,
                  background: atteinte ? 'var(--accent-soft)' : 'transparent', border: '1px solid ' + (atteinte ? 'var(--accent-strong)' : 'var(--line-2)'), color: atteinte ? 'var(--ink)' : 'var(--muted)' }}>{e.numero}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{e.titre}</span>
                <span data-nature-libelle style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.02em', padding: '1px 7px', ...couleurNature(e.nature) }}>
                  {LIBELLE_NATURE[e.nature]}
                </span>
                {estProchaine && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-strong)' }}>· à faire ensuite</span>}
              </div>
              {e.etat && (
                <p data-etat style={{ margin: 0, fontSize: 12, lineHeight: 1.4, color: e.etat.atteinte ? 'var(--ink-2)' : 'var(--muted)', fontWeight: e.etat.atteinte ? 600 : 500 }}>
                  {e.etat.texte}
                </p>
              )}
            </>
          );
          const styleTuile: CSSProperties = {
            ...tuile, background: 'var(--surface)', padding: '10px 12px', display: 'grid', gap: 4, alignContent: 'start', minWidth: 0,
            flex: '1 0 220px', scrollSnapAlign: 'start', color: 'var(--ink)', textDecoration: 'none',
            ...(estProchaine ? cadreSignal('var(--accent-strong)', 'tuile') : null),
          };
          return (
            <li key={e.cle} data-etape={e.cle} data-nature={e.nature}
              data-atteinte={atteinte == null ? 'inconnu' : atteinte ? 'oui' : 'non'} style={{ display: 'flex', minWidth: 0, flex: '1 0 220px', scrollSnapAlign: 'start' }}>
              {href
                ? (href.startsWith('#')
                  ? <a href={href} style={{ ...styleTuile, flex: '1 1 auto', minHeight: CIBLE_TACTILE_MIN }}>{dedans}</a>
                  : <Link href={href} style={{ ...styleTuile, flex: '1 1 auto', minHeight: CIBLE_TACTILE_MIN }}>{dedans}</Link>)
                : <div style={{ ...styleTuile, flex: '1 1 auto' }}>{dedans}</div>}
            </li>
          );
        })}
      </ol>
    );
  }
  return (
    <ol aria-label={titre} data-zone="parcours-boucle" style={liste}>
      {etapes.map((e) => {
        const estProchaine = prochaine === e.cle;
        const atteinte = e.etat?.atteinte ?? null;
        return (
          <li key={e.cle} data-etape={e.cle} data-nature={e.nature}
            data-atteinte={atteinte == null ? 'inconnu' : atteinte ? 'oui' : 'non'}
            style={{
              ...tuile, background: 'var(--surface)', padding: '9px 12px', display: 'grid', gap: 4, alignContent: 'start', minWidth: 0,
              flex: '1 0 230px', scrollSnapAlign: 'start',
              ...(estProchaine ? cadreSignal('var(--accent-strong)', 'tuile') : null),
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px 8px', flexWrap: 'wrap', minWidth: 0 }}>
              <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 999, flexShrink: 0, fontSize: 11.5, fontWeight: 800,
                background: atteinte ? 'var(--accent-soft)' : 'transparent', border: '1px solid ' + (atteinte ? 'var(--accent-strong)' : 'var(--line-2)'), color: atteinte ? 'var(--ink)' : 'var(--muted)' }}>{e.numero}</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{e.titre}</span>
              <span data-nature-libelle style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.02em', padding: '1px 8px', ...couleurNature(e.nature) }}>
                {LIBELLE_NATURE[e.nature]}
              </span>
              {estProchaine && <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-strong)' }}>· à faire ensuite</span>}
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.45 }}>{e.aide}</p>
            {e.etat && (
              <p data-etat style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: e.etat.atteinte ? 'var(--ink)' : 'var(--muted)', fontWeight: e.etat.atteinte ? 600 : 500 }}>
                {e.etat.texte}
              </p>
            )}
            {e.liens.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                {e.liens.map((l) => l.href.startsWith('#')
                  ? <a key={l.href} href={l.href} style={lien}>{l.libelle}</a>
                  : <Link key={l.href} href={l.href} style={lien}>{l.libelle}</Link>)}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** La pastille de nature (une pilule, pas un cadre). */
function couleurNature(n: NatureEtape): CSSProperties {
  // La mesure seule porte l'accent · c'est le seul RÉSULTAT de la boucle.
  if (n === 'mesure') return { color: 'var(--ink)', borderRadius: 999, border: '1px solid var(--accent-strong)' };
  if (n === 'apprentissage') return { color: 'var(--ink)', borderRadius: 999, border: '1px solid var(--line-2)' };
  return { color: 'var(--muted)', borderRadius: 999, border: '1px solid var(--line-2)' };
}

const liste: CSSProperties = {
  display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollSnapType: 'x proximity',
  listStyle: 'none', margin: 0, padding: '0 0 2px',
};

/** La bande compacte (Résultats V5) · même file horizontale, tuiles resserrées. */
const bande: CSSProperties = {
  display: 'flex', gap: 10, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollSnapType: 'x proximity',
  listStyle: 'none', margin: 0, padding: '0 0 2px', alignItems: 'stretch',
};

const lien: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, padding: '0 12px', borderRadius: 999,
  border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink)', fontSize: 12, fontWeight: 700,
  textDecoration: 'none', whiteSpace: 'nowrap', boxSizing: 'border-box',
};
