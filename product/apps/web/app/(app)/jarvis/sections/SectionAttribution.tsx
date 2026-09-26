import { getSession } from '../../../../lib/auth';
import { canAccess, FEATURES } from '../../../../lib/rbac';
import { effectiveAccess } from '../../../../lib/access';
import { getActiveBrand } from '../../../../lib/brands';
import { attributionViewAction, creativeTrendAction } from '../../../actions/adsmap-attribution';

/**
 * Bilan avancé de Jarvis · l'attribution et la tendance, à leur destination.
 *
 * ── Pourquoi ici ─────────────────────────────────────────────────────────────
 *
 * « Est-ce que ça marche mieux qu'avant ? » et « est-ce que la mémoire fait
 * bouger le taux ? » sont des questions d'ANALYSE · elles vivent dans Analytics,
 * à côté des KPI, plutôt que reléguées sous la conversation. Le détail de Jarvis
 * n'a pas disparu : il a déménagé à sa destination (direction validée).
 *
 * ── Ce qui ne bouge pas ──────────────────────────────────────────────────────
 *
 * La PORTÉE est identique à l'ancienne page : ces deux lectures restent derrière
 * l'offre Plus (`adsmap`), marque par marque. Sans accès, sans marque, ou hors
 * session, la section ne rend RIEN · elle ne s'impose jamais à un compte qui n'y
 * avait pas droit. La provenance des données est inchangée · mêmes actions.
 */
const adsmap = FEATURES.find((f) => f.key === 'adsmap')!;

export async function SectionAttribution() {
  const s = await getSession();
  if (!s) return null;
  // Même garde qu'avant · la mémoire mesurée et son bilan restent Plus.
  if (!canAccess(effectiveAccess(s), adsmap)) return null;
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return null;

  const [attribution, tendance] = await Promise.all([
    attributionViewAction(),
    creativeTrendAction(),
  ]);
  const attr = attribution.view;
  const attrErreur = 'error' in attribution ? attribution.error : undefined;

  return (
    <section aria-label="Bilan avancé de Jarvis" style={{ marginTop: 30 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 500, color: 'var(--ink)' }}>Bilan avancé · Jarvis</h2>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>· {brand.name}</span>
      </div>
      <p style={{ margin: '6px 0 16px', fontSize: 12.5, color: 'var(--muted)', maxWidth: 720, lineHeight: 1.55 }}>
        Est-ce que Jarvis fait bouger tes résultats ? Deux lectures qui se vérifient elles-mêmes ·
        l’évolution dans le temps, et les créas générées avec sa mémoire comparées à celles sans.
      </p>

      {/* Est-ce que ça va mieux qu'avant ? · deux fenêtres glissantes, datées sur
          la création de la créa, pas sur un déploiement. */}
      {tendance.trend && (
        <section style={{
          marginBottom: 24, padding: '16px 18px', borderRadius: 14,
          border: `1px solid ${tendance.trend.conclusive ? ((tendance.trend.liftPoints ?? 0) > 0 ? 'rgba(126,232,191,.4)' : 'rgba(255,77,109,.4)') : 'var(--line)'}`,
          background: 'var(--surface)',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>
              Est-ce que ça marche mieux qu’avant ?
            </h3>
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--line-2)' }}>
              {tendance.trend.days} jours
            </span>
          </div>
          <p style={{
            margin: '11px 0 0', padding: '10px 13px', borderRadius: 10,
            background: 'var(--paper)', border: '1px solid var(--line)',
            fontSize: 12.5, fontWeight: 600, lineHeight: 1.55,
            color: tendance.trend.conclusive
              ? ((tendance.trend.liftPoints ?? 0) > 0 ? '#7ee8bf' : '#ff8095')
              : 'var(--ink)',
          }}>
            {tendance.trend.summary}
          </p>
          <p style={{ margin: '9px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
            Deux périodes qui se touchent, datées sur la création de la créa · pas sur son verdict, qui
            arrive des semaines plus tard. Ça répond à « est-ce que ça va mieux », pas à « grâce à quoi » :
            le produit, le marché et la saison bougent en même temps.
          </p>
        </section>
      )}

      {/* Le contrôle · un outil qui ne se vérifie pas accumule. */}
      <section id="attribution" style={{
        marginBottom: 8, padding: '16px 18px', borderRadius: 14,
        border: `1px solid ${attr?.overall.conclusive ? 'rgba(126,232,191,.4)' : 'var(--line)'}`,
        background: 'var(--surface)',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>
            Est-ce que Jarvis améliore vraiment les résultats ?
          </h3>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--line-2)' }}>
            Attribution
          </span>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: 720 }}>
          Les créas générées <b>avec</b> la mémoire, comparées à celles générées <b>sans</b>, sur les
          tests arbitrés. On ne cherche pas quelle accroche a produit quelle gagnante · c’est
          indécidable · mais si l’ensemble fait bouger le taux.
        </p>
        <p style={{
          margin: '11px 0 0', padding: '10px 13px', borderRadius: 10,
          background: 'var(--paper)', border: '1px solid var(--line)',
          fontSize: 12.5, fontWeight: 600, lineHeight: 1.55,
          color: attrErreur ? '#ff8095' : attr?.overall.conclusive
            ? (attr.overall.liftPoints ?? 0) > 0 ? '#7ee8bf' : '#ff8095'
            : 'var(--ink)',
        }}>
          {attrErreur ?? attr?.overall.summary ?? 'Lecture indisponible.'}
        </p>

        {attr && !attr.overall.conclusive && (
          <p style={{ margin: '9px 0 0', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.55 }}>
            Il faut <b>6 tests arbitrés</b> dans chacun des deux groupes · les créas nées du Studio avec
            la mémoire, et les autres. {attr.total > 0
              ? `${attr.total} test(s) arbitré(s) alimentent la comparaison pour l’instant.`
              : 'Aucun test arbitré ne l’alimente pour l’instant.'}
          </p>
        )}
        {(attr?.overall.excluded ?? 0) > 0 && (
          <p style={{ margin: '9px 0 0', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.55 }}>
            {attr!.overall.excluded} test(s) arbitré(s) sont écartés des deux groupes · plusieurs créas
            partagent leur concept et rien ne dit laquelle est née de quelle génération. Les ranger
            parmi les témoins gonflerait le témoin de créas qui ont peut-être profité de la mémoire.
            Les créas suivies depuis maintenant portent le lien sur elles.
          </p>
        )}
        {attr?.parts.some((p) => p.liftPoints !== null) && (
          <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
            {attr.parts.filter((p) => p.liftPoints !== null).map((p) => (
              <div key={p.part} style={{ display: 'flex', alignItems: 'baseline', gap: 9, fontSize: 12, flexWrap: 'wrap' }}>
                <span style={{ width: 180, color: 'var(--ink-2)' }}>{p.label}</span>
                <span style={{ fontWeight: 700, color: p.conclusive ? ((p.liftPoints ?? 0) > 0 ? '#7ee8bf' : '#ff8095') : 'var(--muted)' }}>
                  {(p.liftPoints ?? 0) > 0 ? '+' : ''}{Math.round((p.liftPoints ?? 0) * 100)} pt
                </span>
                <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>
                  {p.withIt.wins}/{p.withIt.n} contre {p.withoutIt.wins}/{p.withoutIt.n}
                  {!p.conclusive && ' · pas encore tranché'}
                </span>
              </div>
            ))}
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
              Ces trois lignes ne s’additionnent pas · une génération peut bénéficier des trois, ce
              sont trois comparaisons distinctes.
            </p>
          </div>
        )}
        <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
          Ce n’est pas une expérience contrôlée : le groupe témoin est plus ancien, et une marque qui
          progresse progresserait de toute façon. On ne conclut donc que si les intervalles de
          confiance ne se chevauchent pas.
        </p>
      </section>
    </section>
  );
}
