import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../lib/auth';
import { canAccess, FEATURES, roleAtLeast } from '../../../lib/rbac';
import { effectiveAccess } from '../../../lib/access';
import { isFounder } from '../../../lib/founder';
import { getActiveBrand } from '../../../lib/brands';
import { jarvisStats, jarvisMeasuredMemory, jarvisHookView } from '../../../lib/jarvis-memory';
import { jarvisSnapshot, STATE_LABEL, type JarvisLayer } from '../../../lib/jarvis-state';
import { spendStatus } from '../../../lib/spend-guard';
import { currentDeployment } from '../../../lib/deployment';
import { attributionViewAction, creativeTrendAction, essaisViewAction, bilanNotesAction } from '../../actions/adsmap-attribution';
import { ESSAI_LABEL, DIMENSION_LABEL, DEFECT_LABEL, MIN_NOTES, type EssaiVariable, type SceneDefect } from '@tiktrends/core';
import { PageInfo } from '../../../components/PageInfo';
import { JarvisRules } from './JarvisRules';
import { JarvisTraining } from './JarvisTraining';
import { JarvisChat } from './JarvisChat';
import { DescribePanel } from './DescribePanel';
import { MarketPanel } from './MarketPanel';
import { Empty } from '../../../components/Empty';

export const dynamic = 'force-dynamic';

const adsmap = FEATURES.find((f) => f.key === 'adsmap')!;

/**
 * Jarvis · une seule maison.
 *
 * ── Ce qui n'allait pas ──────────────────────────────────────────────────────
 *
 * Il y avait deux écrans. Celui-ci était une BROCHURE : six cartes en dur qui
 * affirmaient ce que Jarvis applique, identiques pour tout le monde, y compris
 * pour une marque sans logo à qui on annonçait que sa DA était injectée dans
 * chaque prompt. Et sous `/adsmap/jarvis` vivait toute la substance · la mémoire
 * mesurée, les accroches, le marché, l'attribution, rangée sous la navigation
 * d'un autre module.
 *
 * Résultat : l'écran qui portait le nom ne savait rien, et celui qui savait tout
 * ne portait pas le nom.
 *
 * ── Ce que la page répond, dans cet ordre ────────────────────────────────────
 *
 * 1. **Qu'est-ce qui tourne vraiment ?** L'état des couches, mesuré, avec le
 *    geste qui allume ce qui est éteint. C'est la première chose parce que c'est
 *    la seule qui dise si tout le reste a du sens aujourd'hui.
 * 2. **Est-ce que ça sert ?** L'attribution avant la mémoire · un outil qui ne
 *    vérifie pas ses propres règles n'apprend pas, il accumule.
 * 3. **Qu'est-ce qu'il sait ?** Chiffres mesurés, puis accroches mot pour mot.
 * 4. **Qu'est-ce qu'il coûte ?** Fondateur uniquement.
 * 5. **Qu'est-ce qu'on lui demande ?** Les actions, en bas · on règle après
 *    avoir lu, pas avant.
 *
 * ── Un point d'accès, et il ne bouge pas ─────────────────────────────────────
 *
 * La page était réservée au fondateur. Elle ne l'est plus dans son ensemble,
 * mais **rien ne devient visible pour quelqu'un qui ne le voyait pas déjà** : la
 * mémoire était ouverte aux comptes Plus sous `/adsmap/jarvis`, elle l'est ici ;
 * les règles maison, les moteurs et la dépense restent derrière `isFounder`.
 */
export default async function JarvisPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'member')) redirect('/dashboard');

  const fondateur = isFounder(s.user.email);
  const voitMemoire = canAccess(effectiveAccess(s), adsmap);
  const brand = await getActiveBrand(s.workspaceId);

  if (!brand) {
    return (
      <main style={{ padding: '30px 36px 60px', maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--ink)' }}>Jarvis</h1>
        <div style={{ marginTop: 20 }}>
          <Empty
            tone="todo" title="Sélectionne une marque active."
            why="Jarvis apprend marque par marque · sa mémoire n’a de sens que rapportée à une marque précise."
            action={{ label: 'Choisir une marque', href: '/brands' }}
          />
        </div>
      </main>
    );
  }

  const [row] = db
    ? await db.select({
        creativeRules: schema.brands.creativeRules,
        jarvisLearnings: schema.brands.jarvisLearnings,
        jarvisTrainedAt: schema.brands.jarvisTrainedAt,
      }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1)
    : [];

  const snapshot = await jarvisSnapshot(brand.id, s.workspaceId);

  // La mémoire n'est chargée que si elle est accessible · inutile de faire
  // travailler la base pour un bloc qu'on n'affichera pas.
  const [memoire, hooks, attribution, tendance, essais, bilan, stats, depense] = await Promise.all([
    voitMemoire ? jarvisMeasuredMemory(brand.id, s.workspaceId) : Promise.resolve(''),
    voitMemoire ? jarvisHookView(brand.id, s.workspaceId) : Promise.resolve(null),
    voitMemoire ? attributionViewAction() : Promise.resolve({ view: undefined }),
    voitMemoire ? creativeTrendAction() : Promise.resolve({ trend: undefined }),
    voitMemoire ? essaisViewAction() : Promise.resolve({ view: undefined }),
    voitMemoire ? bilanNotesAction() : Promise.resolve({ bilan: undefined }),
    voitMemoire ? jarvisStats(brand.id, s.workspaceId) : Promise.resolve(null),
    fondateur ? spendStatus() : Promise.resolve(null),
  ]);
  // Ce que ce serveur exécute · fondateur seulement, c'est une information
  // d'exploitation. Sans elle, chaque rapport de bug commence par une enquête
  // pour savoir si le correctif est seulement en ligne.
  const deploiement = fondateur ? await currentDeployment() : null;
  const attr = attribution.view;
  // L'échec de lecture se dit · un bloc qui s'évapore quand il n'a rien à
  // répondre laisse croire qu'il n'existe pas.
  const attrErreur = 'error' in attribution ? attribution.error : undefined;
  const essaisVue = essais.view;
  const essaisErreur = 'error' in essais ? essais.error : undefined;
  const notes = bilan.bilan;
  const notesErreur = 'error' in bilan ? bilan.error : undefined;

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 1040, margin: '0 auto' }}>
      <div style={{ position: 'relative', overflow: 'hidden', border: '1px solid var(--line-2)', borderRadius: 22, background: 'linear-gradient(135deg, rgba(230,0,126,.16), rgba(120,90,255,.10) 60%, var(--surface))', padding: '26px 28px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 52, height: 52, borderRadius: 15, background: 'var(--grad-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>🧠</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, color: 'var(--ink)', letterSpacing: -0.5 }}>Jarvis</h1>
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>· {brand.name}</span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--ink-2)', maxWidth: 640, lineHeight: 1.5 }}>
              {snapshot.summary}
            </p>
          </div>
        </div>
      </div>

      {/* 0 · La conversation, en premier et en grand.

           Les tableaux qui suivent répondent bien, à condition de savoir quelle
           question poser et sur quel écran. Une conversation est la seule
           interface qui n'exige pas de savoir où chercher · c'est donc elle
           qu'on rencontre d'abord. */}
      <JarvisChat />

      {/* 0 bis · Ce que CE serveur exécute.

           Une grille rapportée comme cassée venait d'un build antérieur au
           correctif · il a fallu sonder le rendu pixel par pixel pour
           l'établir, et deux défauts ont été « corrigés » sans exister. */}
      {deploiement && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          margin: '18px 0 0', padding: '10px 14px', borderRadius: 12,
          border: `1px solid ${deploiement.ok ? 'var(--line)' : 'rgba(245,166,35,.45)'}`,
          background: deploiement.ok ? 'var(--surface)' : 'rgba(245,166,35,.08)',
        }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>
            Ce serveur
          </span>
          <span style={{ fontSize: 12.5, color: deploiement.ok ? 'var(--ink-2)' : '#f5b043', lineHeight: 1.5, flex: '1 1 260px' }}>
            {deploiement.summary}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            maquette v{deploiement.renderVersion} · {deploiement.applied ?? '—'}/{deploiement.inBuild} migrations
            {deploiement.build ? ` · ${deploiement.build}` : ''}
          </span>
        </div>
      )}

      {/* 1 · L'état réel · avant toute promesse. */}
      <h2 style={{ margin: '30px 0 4px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Ce qui tourne, en ce moment</h2>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--muted)', maxWidth: 720, lineHeight: 1.55 }}>
        Chaque couche dit si elle est alimentée, sur quel volume, et le geste qui l’allume quand elle ne l’est pas.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 11, marginBottom: 26 }}>
        {snapshot.layers.map((l) => <Layer key={l.key} l={l} />)}
      </div>

      {!voitMemoire && (
        <div style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: '20px 22px', marginBottom: 24 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>La mémoire mesurée demande l’offre Plus.</p>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 640 }}>
            Les couches ci-dessus tournent déjà. Ce qui s’ajoute avec Adsmap, c’est ce que Jarvis apprend
            de tes propres tests · les chiffres, les accroches qui ont gagné, et la vérification qu’il
            améliore vraiment les résultats.
          </p>
          <Link href="/billing" style={{ display: 'inline-block', marginTop: 12, padding: '9px 18px', borderRadius: 999, background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 12.5, textDecoration: 'none' }}>
            Voir les formules ›
          </Link>
        </div>
      )}

      {/* 1 bis · Est-ce que ça va mieux qu'avant ?

           On empilait des améliorations sans jamais encaisser le pari · aucun
           écran ne disait si le taux avait bougé. Deux fenêtres glissantes, pas
           une date de sortie : caler la coupure sur un déploiement laisserait
           croire que l'écart mesure CE changement-là. */}
      {voitMemoire && tendance.trend && (
        <section style={{
          marginBottom: 24, padding: '16px 18px', borderRadius: 14,
          border: `1px solid ${tendance.trend.conclusive ? ((tendance.trend.liftPoints ?? 0) > 0 ? 'rgba(126,232,191,.4)' : 'rgba(255,77,109,.4)') : 'var(--line)'}`,
          background: 'var(--surface)',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>
              Est-ce que ça marche mieux qu’avant ?
            </h2>
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

      {/* 2 · Ce que les lots d'essai ont répondu.
             Avant l'attribution, parce que c'est la seule comparaison du produit
             où tout le reste était VRAIMENT tenu · l'attribution, elle, compare
             deux époques et le dit. */}
      {voitMemoire && (
        <section id="essais" style={{
          marginBottom: 24, padding: '16px 18px', borderRadius: 14,
          border: `1px solid ${essaisVue?.cumuls.some((c) => c.conclusif) ? 'rgba(126,232,191,.4)' : 'var(--line)'}`,
          background: 'var(--surface)',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>
              Qu’ont répondu tes lots d’essai ?
            </h2>
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--line-2)' }}>
              Essais
            </span>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: 720 }}>
            Un lot d’essai fait varier <b>une seule chose</b> et tient tout le reste · même scène, mêmes
            textes, même gabarit. C’est la seule comparaison de l’outil où l’écart est vraiment
            attribuable à ce qu’on testait.
          </p>

          {essaisErreur ? (
            <p style={{ margin: '11px 0 0', padding: '10px 13px', borderRadius: 10, background: 'var(--paper)', border: '1px solid var(--line)', fontSize: 12.5, fontWeight: 600, color: '#ff8095' }}>{essaisErreur}</p>
          ) : !essaisVue?.lots.length ? (
            <p style={{ margin: '11px 0 0', padding: '10px 13px', borderRadius: 10, background: 'var(--paper)', border: '1px solid var(--line)', fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.55 }}>
              Aucun lot d’essai n’a encore été poussé dans la carte. Dans <b>Pubs IA</b>, choisis ce que
              le lot teste avant de générer · un essai d’accroches ou de mises en page ne produit
              qu’une image, il coûte donc moins cher qu’un lot libre.
            </p>
          ) : (
            <>
              {/* Le cumul d'abord · c'est le seul endroit où un chiffre devient
                  une mesure. Un lot seul est une observation par bras. */}
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {essaisVue.cumuls.filter((c) => c.essais > 0).map((c) => (
                  <div key={c.variable} style={{ padding: '10px 13px', borderRadius: 10, background: 'var(--paper)', border: `1px solid ${c.conclusif ? 'rgba(126,232,191,.4)' : 'var(--line)'}` }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: c.conclusif ? '#7ee8bf' : 'var(--ink)', lineHeight: 1.5 }}>
                      {ESSAI_LABEL[c.variable as EssaiVariable]} · {c.resume}
                    </div>
                    <div style={{ display: 'grid', gap: 4, marginTop: 7 }}>
                      {c.lignes.map((l) => (
                        <div key={l.valeur} style={{ display: 'flex', alignItems: 'baseline', gap: 9, fontSize: 12, flexWrap: 'wrap' }}>
                          <span style={{ width: 150, color: 'var(--ink-2)' }}>{l.valeur}</span>
                          <span style={{ fontWeight: 700, color: l.gagne ? '#7ee8bf' : 'var(--muted)' }}>
                            {l.victoires}/{l.participations}
                          </span>
                          <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>
                            {Math.round((l.taux ?? 0) * 100)} % de victoires · le hasard en donnerait {Math.round(c.hasard * 100)} %
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Puis les lots un par un · ce sont des pistes, et c'est écrit. */}
              <div style={{ display: 'grid', gap: 7, marginTop: 12 }}>
                {essaisVue.lots.slice(0, 8).map((e) => (
                  <div key={e.groupe} style={{ fontSize: 12, lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 700, color: 'var(--ink-2)' }}>{ESSAI_LABEL[e.variable as EssaiVariable]}</span>
                    <span style={{ color: 'var(--muted)' }}>
                      {' · '}{e.bras.map((b) => `${b.valeur}${b.gagnant ? ' ✓' : b.arbitre ? '' : ' …'}`).join(', ')}
                    </span>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{e.resume}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <p style={{ margin: '11px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
            Un lot seul donne <b>une observation par bras</b> · pas un taux. C’est en répétant l’essai
            que l’écart devient une mesure, et on ne conclut qu’au-dessus de ce que le hasard
            expliquerait. Les accroches ne se cumulent pas d’un essai à l’autre : chacun en compare de
            nouvelles.
          </p>
        </section>
      )}

      {/* 3 · Ce que les notes déjà payées disent ensemble.
             Chaque note coûtait deux crédits et ne servait qu'une fois, à la
             carte qui l'avait demandée. */}
      {voitMemoire && (
        <section id="bilan-notes" style={{
          marginBottom: 24, padding: '16px 18px', borderRadius: 14,
          border: `1px solid ${notes?.defauts.suspects.length ? 'rgba(255,90,120,.35)' : 'var(--line)'}`,
          background: 'var(--surface)',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>
              Ce que tes notes disent ensemble
            </h2>
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--line-2)' }}>
              Score Jarvis
            </span>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: 720 }}>
            Chaque Score Jarvis coûte deux crédits et ne servait qu’une fois. Voici leur somme ·
            d’où viennent tes ratés de fabrication, et ce qui tient le mieux chez toi.
          </p>

          {notesErreur ? (
            <p style={{ margin: '11px 0 0', padding: '10px 13px', borderRadius: 10, background: 'var(--paper)', border: '1px solid var(--line)', fontSize: 12.5, fontWeight: 600, color: '#ff8095' }}>{notesErreur}</p>
          ) : !notes?.notes ? (
            <p style={{ margin: '11px 0 0', padding: '10px 13px', borderRadius: 10, background: 'var(--paper)', border: '1px solid var(--line)', fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.55 }}>
              Aucune créa n’a encore été notée. Le Score Jarvis s’ouvre depuis le panneau d’une pub,
              dans <b>Pubs IA</b>.
            </p>
          ) : (
            <>
              <p style={{
                margin: '11px 0 0', padding: '10px 13px', borderRadius: 10,
                background: 'var(--paper)', border: '1px solid var(--line)',
                fontSize: 12.5, fontWeight: 600, lineHeight: 1.55,
                color: notes.defauts.avecDefaut ? '#ff8095' : '#7ee8bf',
              }}>
                {notes.defauts.resume}
              </p>

              {notes.defauts.parType.length > 0 && (
                <div style={{ display: 'grid', gap: 4, marginTop: 9 }}>
                  {notes.defauts.parType.map((d) => (
                    <div key={d.defaut} style={{ display: 'flex', alignItems: 'baseline', gap: 9, fontSize: 12 }}>
                      <span style={{ width: 230, color: 'var(--ink-2)' }}>{DEFECT_LABEL[d.defaut as SceneDefect]}</span>
                      <span style={{ fontWeight: 700, color: 'var(--muted)' }}>{d.n}×</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Les dimensions qui se détachent · les autres ne méritent pas
                  une ligne, elles diraient « rien à signaler » quatre fois. */}
              {notes.dimensions.filter((d) => d.conclusif).length > 0 && (
                <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                  {notes.dimensions.filter((d) => d.conclusif).map((d) => (
                    <div key={d.dimension} style={{ padding: '9px 12px', borderRadius: 10, background: 'var(--paper)', border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.5 }}>
                        {DIMENSION_LABEL[d.dimension]} · {d.resume}
                      </div>
                      <div style={{ display: 'grid', gap: 3, marginTop: 6 }}>
                        {d.lignes.filter((l) => l.n >= MIN_NOTES).map((l) => (
                          <div key={l.cle} style={{ display: 'flex', alignItems: 'baseline', gap: 9, fontSize: 12 }}>
                            <span style={{ width: 150, color: 'var(--ink-2)' }}>{l.cle}</span>
                            <span style={{ fontWeight: 700, color: l.tranche ? (l.ecart > 0 ? '#7ee8bf' : '#ff8095') : 'var(--muted)' }}>
                              {Math.round(l.moyenne)}/100
                            </span>
                            <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>
                              sur {l.n} note(s){!l.tranche && ' · écart non tranché'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p style={{ margin: '11px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                {notes.notes} note(s), moyenne {Math.round(notes.moyenne ?? 0)}/100. Une note est un
                <b> pronostic</b>, pas un résultat · elle dit ce qu’un directeur créatif pense de la créa,
                pas ce que le marché en a fait. Les vraies performances sont dans les verdicts. Un écart
                n’est retenu qu’au-dessus de {MIN_NOTES} notes et s’il dépasse la dispersion.
              </p>
            </>
          )}
        </section>
      )}

      {/* 4 · Le contrôle AVANT la mémoire · un outil qui ne se vérifie pas accumule. */}
      {voitMemoire && (
        <section id="attribution" style={{
          marginBottom: 24, padding: '16px 18px', borderRadius: 14,
          border: `1px solid ${attr?.overall.conclusive ? 'rgba(126,232,191,.4)' : 'var(--line)'}`,
          background: 'var(--surface)',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>
              Est-ce que Jarvis améliore vraiment les résultats ?
            </h2>
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--line-2)' }}>
              Attribution
            </span>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: 720 }}>
            Les créas générées <b>avec</b> la mémoire, comparées à celles générées <b>sans</b>, sur les
            tests arbitrés. On ne cherche pas quelle accroche a produit quelle gagnante — c’est
            indécidable — mais si l’ensemble fait bouger le taux.
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

          {/* Ce qu'il faut pour que cette réponse existe · sans ça, « pas assez
              de données » ressemble à une panne. */}
          {attr && !attr.overall.conclusive && (
            <p style={{ margin: '9px 0 0', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.55 }}>
              Il faut <b>6 tests arbitrés</b> dans chacun des deux groupes · les créas nées du Studio avec
              la mémoire, et les autres. {attr.total > 0
                ? `${attr.total} test(s) arbitré(s) alimentent la comparaison pour l’instant.`
                : 'Aucun test arbitré ne l’alimente pour l’instant.'}
            </p>
          )}
          {/* Ce qui a été écarté se dit · une comparaison qui laisse tomber des
              tests en silence a l'air de porter sur tout. */}
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
      )}

      {/* 3 · Ce qu'il sait. */}
      {stats && <MemoryBlock stats={stats} memoire={memoire} />}

      {hooks && <HooksBlock hooks={hooks} />}

      {/* 4 · Ce qu'il coûte · fondateur uniquement, comme /admin/depenses. */}
      {depense && (
        <section style={{ marginTop: 22, padding: '15px 18px', borderRadius: 14, border: `1px solid ${depense.blocked ? '#ff8095' : 'var(--line)'}`, background: 'var(--surface)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Ce que Jarvis coûte</h2>
            <span style={{ flex: 1 }} />
            <Link href="/admin/depenses" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>Détail ›</Link>
          </div>
          <p style={{ margin: '7px 0 0', fontSize: 12.5, color: depense.blocked ? '#ff8095' : 'var(--ink-2)', lineHeight: 1.55 }}>
            {depense.summary} Aucun appel ne part sans passer par ce plafond · y compris les tiens.
          </p>
        </section>
      )}

      {/* 5 · Les actions · on règle après avoir lu. */}
      <h2 id="actions" style={{ margin: '30px 0 4px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Ce qu’on lui demande</h2>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--muted)', maxWidth: 720, lineHeight: 1.55 }}>
        Les gestes qui nourrissent les couches ci-dessus, et les écrans où Jarvis rend ce qu’il a appris.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 11, marginBottom: 22 }}>
        <Action href="/adsmap/suites" title="Suites" desc="Ce qu’il faut faire d’un test arbitré · et surtout ce qu’il ne faut pas retoucher." gate={voitMemoire} />
        <Action href="/adsmap/radar" title="Radar" desc="Chaque nuit, ce que tes concurrents continuent de payer." gate={voitMemoire} />
        <Action href="/adsmap/lots" title="Avant de dépenser" desc="Le brief de pré-lancement, sur chaque créa d’un lot." gate={voitMemoire} />
        <Action href="/adsmap" title="Adsmap" desc="La carte des tests, d’où vient tout ce que Jarvis sait." gate={voitMemoire} />
      </div>

      {voitMemoire && (
        <>
          <div id="decrire"><DescribePanel /></div>
          {/* La mémoire marché vient APRÈS la mesurée, à l'écran comme dans le
              prompt : ce que la marque a payé pour apprendre prime sur ce qu'on
              devine des autres. */}
          <div id="marche"><MarketPanel /></div>
        </>
      )}

      {/* 6 · Les réglages maison · fondateur seulement, comme avant. */}
      {fondateur && (
        <>
          <h2 style={{ margin: '32px 0 4px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Réglages maison</h2>
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--muted)', maxWidth: 720, lineHeight: 1.55 }}>
            Ta couche par-dessus les modèles · visible de toi seul.
          </p>
          <div id="entrainement">
            <JarvisTraining brandName={brand.name} initial={row?.jarvisLearnings ?? ''} trainedAt={row?.jarvisTrainedAt ? row.jarvisTrainedAt.toISOString() : null} />
          </div>
          <div id="regles" style={{ marginTop: 22 }}>
            <JarvisRules brandName={brand.name} initial={row?.creativeRules ?? ''} />
          </div>

          <h2 style={{ margin: '28px 0 12px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Moteurs orchestrés</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {ENGINES.map((e) => (
              <div key={e.name} style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: '14px 16px' }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', padding: '2px 7px', borderRadius: 999, color: 'var(--accent-strong)', border: '1px solid var(--line-2)' }}>{e.tag}</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginTop: 8 }}>{e.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>{e.role}</div>
              </div>
            ))}
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--muted)' }}>
            Les moteurs sont interchangeables (surchargeables par configuration) : Jarvis reste ta couche, quel que soit le fournisseur.
          </p>
        </>
      )}
    </main>
  );
}

/* -------------------------------------------------------------------------- */

const ENGINES: Array<{ tag: string; name: string; role: string }> = [
  { tag: 'IMAGE', name: 'Nano Banana 2 (Gemini)', role: 'Mise en scène produit fidèle' },
  { tag: 'VIDÉO', name: 'Kling 2.5 turbo pro', role: 'Animation des visuels' },
  { tag: 'COPY', name: 'Claude', role: 'Concepts, angles, copywriting' },
];

const TON: Record<string, { fg: string; bd: string }> = {
  on: { fg: '#7ee8bf', bd: 'rgba(126,232,191,.42)' },
  partial: { fg: '#ffcf8f', bd: 'rgba(245,166,35,.38)' },
  off: { fg: 'var(--muted)', bd: 'var(--line)' },
  always: { fg: 'var(--muted)', bd: 'var(--line)' },
};

function Layer({ l }: { l: JarvisLayer }) {
  const t = TON[l.state] ?? TON.off!;
  return (
    <div style={{ border: `1px solid ${t.bd}`, borderRadius: 14, background: 'var(--surface)', padding: '13px 15px', display: 'grid', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 17 }}>{l.icon}</span>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', flex: 1 }}>{l.title}</span>
        <span style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: t.fg, padding: '2px 7px', borderRadius: 999, border: `1px solid ${t.bd}`, whiteSpace: 'nowrap' }}>
          {STATE_LABEL[l.state]}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>{l.what}</div>
      <div style={{ fontSize: 11.5, color: t.fg === 'var(--muted)' ? 'var(--muted)' : t.fg, fontWeight: 600 }}>{l.detail}</div>
      {l.fix && (
        <Link href={l.fix.href} style={{ fontSize: 11.5, color: 'var(--accent-strong)', fontWeight: 700, textDecoration: 'none' }}>
          {l.fix.label} ›
        </Link>
      )}
    </div>
  );
}

function Action({ href, title, desc, gate }: { href: string; title: string; desc: string; gate: boolean }) {
  const inner = (
    <>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: gate ? 'var(--ink)' : 'var(--muted)' }}>
        {title} {!gate && '🔒'}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.5 }}>{desc}</div>
    </>
  );
  const style = { border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: '13px 15px', textDecoration: 'none', display: 'block' } as const;
  return gate ? <Link href={href} style={style}>{inner}</Link> : <div style={{ ...style, opacity: 0.6 }}>{inner}</div>;
}

const DIM_LABEL: Record<string, string> = {
  mechanism: 'Mécanismes', hook_type: 'Types d’accroche', format: 'Formats',
  length_bucket: 'Durées', awareness: 'Stades de conscience', avatar: 'Avatars',
  talent: 'Talents', opening_type: 'Ouvertures', element: 'Éléments réutilisés',
  layout: 'Mises en page',
};
const ORDRE = ['mechanism', 'element', 'hook_type', 'opening_type', 'layout', 'format', 'length_bucket', 'awareness', 'talent', 'avatar'];

function MemoryBlock({ stats, memoire }: { stats: Awaited<ReturnType<typeof jarvisStats>>; memoire: string }) {
  const utiles = stats.stats.filter((r) => r.nConclusive >= 3 && r.hitRate !== null);
  const parDim = ORDRE
    .map((d) => ({ dim: d, rows: utiles.filter((r) => r.dimension === d).sort((a, b) => (b.hitRate ?? 0) - (a.hitRate ?? 0)) }))
    .filter((g) => g.rows.length > 0);
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  const globalRate = stats.globalRate;

  return (
    <>
      <h2 style={{ margin: '4px 0 4px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Ce qu’il a appris de cette marque</h2>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--muted)', maxWidth: 760, lineHeight: 1.55 }}>
        Mesuré sur les tests de cette marque, pas déduit de règles générales. Ce tableau est exactement
        ce qui est injecté dans chaque génération.
      </p>

      <PageInfo title="lire ce tableau">
        Le taux se lit sur les tests <b>concluants</b> : une ad non concluante n’apprend rien et ne compte
        nulle part. Une ligne n’apparaît qu’à partir de <b>trois</b> tests · en dessous, ce serait une
        anecdote présentée comme une loi. Jarvis applique la même règle : ce qu’il ne sait pas, il ne le dit pas.
      </PageInfo>

      {parDim.length === 0 ? (
        <Empty
          tone="wait" title="Rien d’appris pour l’instant."
          why={stats.nAds > 0
            ? `${stats.nAds} ad(s) suivies, mais aucun verdict concluant sur au moins trois tests d’un même type. Une ligne n’apparaît qu’à partir de trois · en dessous, ce serait une anecdote présentée comme une loi.`
            : 'Jarvis apprend des verdicts, pas des intentions · sa mémoire se remplit quand des tests sont arbitrés.'}
        />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 18 }}>
            <Stat label="Taux de réussite" value={globalRate === null ? '—' : pct(globalRate)} sub="gagnantes / concluantes" strong />
            <Stat label="Ads suivies" value={String(stats.nAds)} />
            <Stat label="Signaux exploitables" value={String(utiles.length)} sub="au moins 3 tests" />
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            {parDim.map(({ dim, rows }) => (
              <section key={dim} style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: '15px 18px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>{DIM_LABEL[dim] ?? dim}</h3>
                <div style={{ display: 'grid', gap: 8 }}>
                  {rows.map((r) => {
                    const au_dessus = globalRate !== null && r.hitRate! > globalRate;
                    return (
                      <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 210, fontSize: 12.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.key}>{r.key}</span>
                        <div style={{ flex: 1, height: 9, background: 'var(--paper)', borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
                          <div style={{ width: `${(r.hitRate ?? 0) * 100}%`, height: '100%', borderRadius: 999, background: au_dessus ? 'linear-gradient(90deg,#4fd1a5,#7ee8bf)' : 'var(--grad-accent)' }} />
                          {globalRate !== null && (
                            <div title="Moyenne de la marque" style={{ position: 'absolute', left: `${globalRate * 100}%`, top: -2, width: 1, height: 13, background: 'var(--muted)' }} />
                          )}
                        </div>
                        <span style={{ width: 48, textAlign: 'right', fontSize: 12.5, fontWeight: 800, color: au_dessus ? '#7ee8bf' : 'var(--ink-2)' }}>{pct(r.hitRate!)}</span>
                        <span style={{ width: 84, textAlign: 'right', fontSize: 11.5, color: 'var(--muted)' }}>
                          {r.nWinners + r.nBaby}/{r.nConclusive} tests
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          {memoire && (
            <details style={{ marginTop: 16 }}>
              <summary style={{ fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer' }}>Voir le texte exact injecté dans les générations</summary>
              <pre style={{ marginTop: 10, padding: '14px 16px', borderRadius: 12, background: 'var(--paper)', border: '1px solid var(--line)', fontSize: 11.5, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', lineHeight: 1.6, fontFamily: 'ui-monospace, monospace' }}>
                {memoire}
              </pre>
            </details>
          )}
        </>
      )}
    </>
  );
}

const HOOK_TON: Record<string, { bd: string; fg: string; label: string }> = {
  proven: { bd: 'rgba(126,232,191,.45)', fg: '#7ee8bf', label: 'a gagné ici' },
  market: { bd: 'rgba(245,166,35,.4)', fg: '#ffcf8f', label: 'marché' },
  untested: { bd: 'var(--line-2)', fg: 'var(--muted)', label: 'jamais tranchée' },
  refuted: { bd: 'rgba(254,44,85,.4)', fg: '#ff8095', label: 'a perdu ici' },
};

function HooksBlock({ hooks }: { hooks: NonNullable<Awaited<ReturnType<typeof jarvisHookView>>> }) {
  return (
    <section style={{ marginTop: 22, padding: '16px 18px', borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface)' }}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Les accroches, mot pour mot</h2>
      <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: 720 }}>
        Le tableau du dessus donne des <b>catégories</b> · celui-ci donne les <b>phrases</b>. On n’écrit
        pas une publicité à partir d’une catégorie. Ces accroches sont injectées telles quelles dans
        chaque génération, avec ce qu’elles ont donné.
      </p>
      <p style={{ margin: '9px 0 0', fontSize: 12.5, color: 'var(--ink)', fontWeight: 600, lineHeight: 1.5 }}>{hooks.summary}</p>

      {hooks.entries.length > 0 && (
        <div style={{ marginTop: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {hooks.entries.slice(0, 14).map((h, i) => {
            const t = HOOK_TON[h.evidence] ?? HOOK_TON.untested!;
            return (
              <div key={`${h.evidence}-${i}`} style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
                <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: t.fg, border: `1px solid ${t.bd}`, whiteSpace: 'nowrap' }}>{t.label}</span>
                <span style={{ flex: '1 1 300px', minWidth: 0, fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.45 }}>« {h.text} »</span>
                {h.evidence === 'market' && h.maxDaysRunning && (
                  <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {h.maxDaysRunning} j en ligne{h.advertisers > 1 ? ` · ${h.advertisers} annonceurs` : ''}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {hooks.counts.market > 0 && (
        <p style={{ margin: '12px 0 0', fontSize: 11, color: '#ffcf8f', lineHeight: 1.5 }}>
          Les accroches de concurrents ne sont jamais recopiées · le prompt l’interdit explicitement
          et demande d’en reprendre la mécanique, pas les mots.
        </p>
      )}
    </section>
  );
}

function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div style={{ border: `1px solid ${strong ? 'rgba(254,44,85,.22)' : 'var(--line)'}`, borderRadius: 13, background: 'var(--surface)', padding: '12px 14px' }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color: strong ? 'var(--accent-strong)' : 'var(--ink)', marginTop: 4, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}
