'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { CIBLE_TACTILE_MIN, LIBELLE_TYPE } from '@tiktrends/core';
import type { ChatContexte } from '../../actions/jarvis-chat';
import { Icon } from '../../../components/Icon';
import { usePiegeFocus } from '../../../components/use-piege-focus';

/**
 * Le contexte de marque, à la demande · ce sur quoi Jarvis s'appuie.
 *
 * ── Pourquoi à la demande ────────────────────────────────────────────────────
 *
 * La conversation reste au premier plan · le contexte ne s'impose pas, il
 * s'ouvre quand on en a besoin, et se referme. On y montre ce que Jarvis a comme
 * appui — l'identité de la marque, ses consignes, ses sources — et surtout la
 * PORTÉE de chaque élément : ici tout est propre à la marque active, et c'est
 * dit. Une consigne sans portée laisse croire qu'elle vaut partout.
 *
 * ── Ce que ce panneau n'est pas ──────────────────────────────────────────────
 *
 * Il ne déclenche rien de payant · il montre et il renvoie vers l'écran qui
 * édite (la marque, ses données). Il n'expose rien de nouveau · c'est le contenu
 * de la marque du membre, en lecture, au même endroit que la conversation.
 */
export function JarvisContexte({ contexte, brandName, measuredAds, onClose }: {
  contexte: ChatContexte;
  brandName: string;
  /** Tests mesurés de la marque · le statut technique déplacé hors de la conversation. */
  measuredAds: number;
  onClose: () => void;
}) {
  // Le piège à focus partagé, éprouvé une fois (`use-piege-focus`) · il porte le
  // focus DANS le panneau à l'ouverture, garde le Tab piégé, ferme sur Échap, et
  // surtout REND le focus au déclencheur (« Ajouter du contexte ») à la
  // fermeture · sans ça, Échap referme mais le clavier repart sur <body> (défaut
  // relevé à la recette, Codex 30/09).
  const ref = useRef<HTMLDivElement>(null);
  usePiegeFocus(ref, { actif: true, onFermer: onClose });

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={`Contexte de marque · ${brandName}`}
      tabIndex={-1}
      style={{
        position: 'absolute', inset: 0, zIndex: 5, background: 'var(--paper)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px',
        borderBottom: '1px solid var(--line)', background: 'var(--surface)',
      }}>
        <span style={{ display: 'inline-flex', color: 'var(--accent-strong)' }}><Icon name="brain" size={16} /></span>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', flex: 1 }}>Contexte de marque · {brandName}</span>
        <button type="button" onClick={onClose} aria-label="Fermer le contexte" style={{
          width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink-2)', cursor: 'pointer',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>
          Ce sur quoi Jarvis s’appuie pour cette marque · la portée de chaque élément est indiquée.
          Il ne s’en sert pas comme d’une vérité mesurée · elle oriente, elle ne tranche pas.
        </p>

        {/* Le statut technique · déplacé ici depuis l'en-tête de la conversation,
            pour garder le fil calme (réconciliation charte). */}
        <p style={{
          margin: 0, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)',
          background: 'var(--surface)', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', lineHeight: 1.5,
        }}>
          {measuredAds > 0
            ? `Il répond avec ${measuredAds} test(s) mesuré(s) de ${brandName}.`
            : `Aucun test mesuré sur ${brandName} · il le dira plutôt que de meubler.`}
        </p>

        <Bloc titre="La marque" portee="marque">
          {contexte.identity
            ? <p style={corps}>{contexte.identity}</p>
            : <p style={{ ...corps, color: 'var(--muted)' }}>Identité pas encore renseignée · description, promesse, audience.</p>}
          <Link href={`/brands/${contexte.brandId}`} style={lien}>Modifier la marque ›</Link>
        </Bloc>

        <Bloc titre="Consignes créatives" portee="marque">
          {contexte.rules
            ? <p style={{ ...corps, whiteSpace: 'pre-wrap' }}>{contexte.rules}</p>
            : <p style={{ ...corps, color: 'var(--muted)' }}>Aucune consigne maison · Jarvis suit alors ses règles générales.</p>}
        </Bloc>

        {/* Les accroches, mot pour mot · le tableau des sources donne des
            catégories, ici on donne les phrases. Elles sont injectées telles
            quelles dans chaque génération, avec ce qu'elles ont donné. Portée
            marque, derrière l'offre Plus · absentes proprement sinon. */}
        {contexte.hooks && (
          <Bloc titre="Accroches" portee="marque">
            <p style={corps}>{contexte.hooks.summary}</p>
            {contexte.hooks.entries.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {contexte.hooks.entries.slice(0, 8).map((h, i) => {
                  const t = HOOK_TON[h.evidence] ?? HOOK_TON.untested!;
                  return (
                    <div key={`${h.evidence}-${i}`} style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: t.fg, border: `1px solid ${t.bd}`, whiteSpace: 'nowrap' }}>{t.label}</span>
                      <span style={{ flex: '1 1 200px', minWidth: 0, fontSize: 12, color: 'var(--ink)', lineHeight: 1.45 }}>« {h.text} »</span>
                    </div>
                  );
                })}
              </div>
            )}
            {contexte.hooks.counts.market > 0 && (
              <p style={{ margin: '10px 0 0', fontSize: 10.5, color: '#ffcf8f', lineHeight: 1.5 }}>
                Les accroches de concurrents ne sont jamais recopiées · Jarvis en reprend la mécanique, pas les mots.
              </p>
            )}
          </Bloc>
        )}

        {/* Les connaissances de l'équipe · ce qui entre dans le contexte des
            PROCHAINES réponses pour cette marque. Le panneau n'affiche que le
            titre et le type · ce n'est pas une protection du texte, que Jarvis
            lit et dont un client peut lui demander le contenu. Le retrait vaut
            pour la suite, pas pour le passé · et c'est dit, plutôt que promis. */}
        {contexte.connaissances && (
          <Bloc titre="Connaissances de l’équipe" portee="plateforme">
            {contexte.connaissances.inclus.length ? (
              <>
                <p style={corps}>Incluses dans le contexte de ses prochaines réponses · lues comme des données, sous ses règles et sous les consignes de la marque.</p>
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
                  {contexte.connaissances.inclus.map((k) => (
                    <li key={k.ref} style={{ ...corps, overflowWrap: 'anywhere' }}>
                      {k.titre} <span style={{ color: 'var(--muted)', fontSize: 11 }}>· {LIBELLE_TYPE[k.type]}{k.tronquee ? ' · tronquée' : ''}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p style={{ ...corps, color: 'var(--muted)' }}>Aucune connaissance publiée par l’équipe pour cette marque.</p>
            )}
            {contexte.connaissances.horsPlace > 0 && (
              <p style={{ margin: '8px 0 0', fontSize: 11, color: '#ffcf8f', lineHeight: 1.5 }}>{contexte.connaissances.horsPlace} autre(s) n’ont pas tenu dans la place réservée.</p>
            )}
            <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
              Une connaissance retirée n’entre plus dans les réponses suivantes · les réponses déjà données ne sont pas réécrites.
            </p>
          </Bloc>
        )}

        <Bloc titre="Sources de Jarvis" portee="marque">
          <p style={corps}>
            La mémoire mesurée et les apprentissages de cette marque, avec leur provenance ·
            ils vivent dans les sources détaillées, sous la conversation.
          </p>
          <Link href="/jarvis/sources" style={lien}>Voir les sources et la mémoire ›</Link>
        </Bloc>
      </div>
    </div>
  );
}

/** Une section du contexte · un titre, sa portée, son contenu. */
function Bloc({ titre, portee, children }: { titre: string; portee: 'utilisateur' | 'espace' | 'marque' | 'plateforme'; children: React.ReactNode }) {
  const PORTEE_LABEL = { utilisateur: 'portée · utilisateur', espace: 'portée · espace', marque: 'portée · marque', plateforme: 'portée · équipe plateforme' } as const;
  return (
    <section style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--ink)', flex: 1 }}>{titre}</h3>
        <span style={{
          fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em',
          color: 'var(--muted)', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--line-2)', whiteSpace: 'nowrap',
        }}>
          {PORTEE_LABEL[portee]}
        </span>
      </div>
      {children}
    </section>
  );
}

/** Le poids d'une accroche · a-t-elle gagné ici, vient-elle du marché, jamais tranchée. */
const HOOK_TON: Record<string, { bd: string; fg: string; label: string }> = {
  proven: { bd: 'rgba(126,232,191,.45)', fg: '#7ee8bf', label: 'a gagné ici' },
  market: { bd: 'rgba(245,166,35,.4)', fg: '#ffcf8f', label: 'marché' },
  untested: { bd: 'var(--line-2)', fg: 'var(--muted)', label: 'jamais tranchée' },
  refuted: { bd: 'rgba(254,44,85,.4)', fg: '#ff8095', label: 'a perdu ici' },
};

const corps = { margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6 } as const;
const lien = { display: 'inline-block', marginTop: 8, fontSize: 12, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none' } as const;
