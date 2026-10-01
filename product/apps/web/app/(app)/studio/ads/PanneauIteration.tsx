import Link from 'next/link';
import type { CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN, type BriefDepuisTest } from '@tiktrends/core';
import { Icon } from '../../../../components/Icon';
import { ModifierBrief } from './ModifierBrief';

/**
 * Le brief d'itération, en tête du Studio (lot I2) · ouvert depuis le panneau
 * d'un test arbitré gagnant. Il MONTRE d'où vient le brief et ce qu'il reprend ·
 * rien n'est généré ni enregistré à l'ouverture. L'angle et l'audience sont
 * préremplis dans le formulaire, modifiables · « Créer des pubs » reste le geste.
 *
 * Quatre natures, jamais confondues · mesuré (le test source · verdict arbitré,
 * chiffres, ce qu'il faisait varier), appris (consigné), prérempli initial (les DEUX seuls
 * champs préremplis · angle, audience), suggéré (hypothèse, à valider).
 */
export type EtatIteration =
  | { etat: 'refuse' }
  | { etat: 'non_eligible'; adId: string; motif: string }
  | ({ etat: 'ok'; adId: string } & Extract<BriefDepuisTest, { eligible: true }>);

const retourTest = (adId: string) => `/adsmap?ad=${encodeURIComponent(adId)}&depuis=studio`;

export function PanneauIteration({ it, marque }: { it: EtatIteration; marque: string | null }) {
  if (it.etat === 'refuse') {
    // Ni détail ni lien · un test supprimé, d'une autre marque ou hors droits ne
    // se distingue pas (aucune divulgation).
    return (
      <div role="status" style={{ ...cadre, borderStyle: 'dashed' }}>
        <span style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          Ce test n’est pas disponible{marque ? <> pour <b>{marque}</b></> : ''} · le Studio s’ouvre sans brief d’itération.
        </span>
      </div>
    );
  }
  if (it.etat === 'non_eligible') {
    return (
      <div role="status" style={{ ...cadre, borderStyle: 'dashed' }}>
        <span style={{ flex: 1, minWidth: 220, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          Pas de brief d’itération · {it.motif}
        </span>
        <Link href={retourTest(it.adId)} style={lienSecondaire}>‹ Retour au test</Link>
      </div>
    );
  }

  const { provenance, apprentissages, champs } = it;
  // Grille, pas flex en colonne · `cadre` enroule (`flexWrap: wrap`) et, en
  // colonne, Chrome dimensionne alors la grille des blocs sur une largeur
  // intrinsèque · mesuré à 1440 · 269 px de haut pour 128 px de contenu.
  return (
    <section aria-labelledby="brief-iteration-titre" style={{ ...cadre, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', color: 'var(--accent-strong)' }}><Icon name="map" size={16} /></span>
        {/* Base 260 · à 390 le lien ne tient plus à côté, il passe DESSOUS et le
            titre garde toute la largeur (il s'empilait sur une colonne étroite). */}
        <h2 id="brief-iteration-titre" style={{ margin: 0, flex: '1 1 260px', minWidth: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)', overflowWrap: 'anywhere' }}>
          Brief d’itération · {provenance.titre}
        </h2>
        <Link href={retourTest(it.adId)} style={lienSecondaire}>‹ Retour au test</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 10 }}>
        <Bloc titre="Mesuré" note="le test source, tranché par la régie">
          <p style={texte}><b>{provenance.verdict}</b>{provenance.chiffres.length ? <> · {provenance.chiffres.join(' · ')}</> : null}</p>
          {/* Historique du test source · ni prérempli ni transmis à la génération. */}
          {provenance.variableTestee && <p style={{ ...texte, color: 'var(--muted)', overflowWrap: 'anywhere' }}>Ce test faisait varier · {provenance.variableTestee}</p>}
        </Bloc>
        <Bloc titre="Appris" note="consigné par l’équipe à l’arbitrage">
          {apprentissages.map((a, i) => (
            <p key={i} style={{ ...texte, overflowWrap: 'anywhere' }}>« {a.texte} » <span style={{ color: 'var(--muted)' }}>· confiance {a.confiance}/5</span></p>
          ))}
        </Bloc>
        {/* Les valeurs de DÉPART, venues du test · une saisie reprise peut les
            avoir remplacées dans les réglages (recette I2 · « Sportifs pressés »
            ici, « Parents fatigués » dans le formulaire, sans le dire). */}
        <Bloc titre="Prérempli initial du test" note="angle et audience de départ, modifiables dans les réglages">
          <p style={{ ...texte, overflowWrap: 'anywhere' }}>Angle · « {champs.angle.valeur} »</p>
          <p style={texte}>Audience · {champs.audience ? champs.audience.valeur : <span style={{ color: 'var(--muted)' }}>non renseignée sur le test</span>}</p>
          <ModifierBrief />
        </Bloc>
        <Bloc titre="Suggéré" note="à valider, rien n’est mesuré ici">
          <p style={{ ...texte, overflowWrap: 'anywhere' }}>{champs.hypothese.valeur}</p>
          <p style={texte}>Variable suivante · <b>{champs.variableSuivante.valeur}</b></p>
        </Bloc>
      </div>

      <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
        Rien n’est généré ni enregistré à l’ouverture · « Créer des pubs » reste ton geste. L’hypothèse et la variable ne sont pas transmises à la génération : garde-les en tête en ajustant l’angle.
      </p>
    </section>
  );
}

function Bloc({ titre, note, children }: { titre: string; note: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 5, alignContent: 'start', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--paper)', minWidth: 0 }}>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>
        {titre} <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>· {note}</span>
      </span>
      {children}
    </div>
  );
}

const cadre: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 18px', padding: '12px 14px',
  borderRadius: 14, border: '1px solid var(--line-2)', background: 'var(--surface)', minWidth: 0,
};
const texte: CSSProperties = { margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 };
const lienSecondaire: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, padding: '0 13px', borderRadius: 999,
  border: '1px solid var(--line-2)', color: 'var(--ink-2)', fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap',
};
