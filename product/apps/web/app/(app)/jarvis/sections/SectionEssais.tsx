import Link from 'next/link';
import { getSession } from '../../../../lib/auth';
import { canAccess, FEATURES } from '../../../../lib/rbac';
import { effectiveAccess } from '../../../../lib/access';
import { getActiveBrand } from '../../../../lib/brands';
import { essaisViewAction, bilanNotesAction, bilanCopieAction, calibrationScoreAction } from '../../../actions/adsmap-attribution';
import { ESSAI_LABEL, DIMENSION_LABEL, DEFECT_LABEL, MIN_NOTES, DIMENSION_COPIE_LABEL, MIN_RELECTURES, essaiSuivant, type EssaiVariable, type SceneDefect } from '@tiktrends/core';
import { Empty } from '../../../../components/Empty';

/**
 * Essais, lots et verdicts · à leur destination, Adsmap.
 *
 * ── Pourquoi ici ─────────────────────────────────────────────────────────────
 *
 * Les lots d'essai, le Score Jarvis (cumul des notes), sa calibration contre le
 * marché, et le cumul des relectures répondent tous à « qu'ont donné mes tests ».
 * C'est la matière d'Adsmap · la carte des tests. Le détail vit là où on le
 * consulte, plus sous la conversation (direction validée).
 *
 * ── Ce qui ne bouge pas ──────────────────────────────────────────────────────
 *
 * Portée identique · derrière l'offre Plus (`adsmap`), marque par marque. Sans
 * accès, sans marque, ou hors session, la section ne rend RIEN. Mêmes actions,
 * même provenance · aucun modèle appelé, rien de facturé pour afficher un cumul
 * déjà payé.
 */
const adsmap = FEATURES.find((f) => f.key === 'adsmap')!;

export async function SectionEssais() {
  const s = await getSession();
  if (!s) return null;
  if (!canAccess(effectiveAccess(s), adsmap)) return null;
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return null;

  const [essais, bilan, copies, calibration] = await Promise.all([
    essaisViewAction(),
    bilanNotesAction(),
    bilanCopieAction(),
    calibrationScoreAction(),
  ]);
  const essaisVue = essais.view;
  const essaisErreur = 'error' in essais ? essais.error : undefined;
  const notes = bilan.bilan;
  const notesErreur = 'error' in bilan ? bilan.error : undefined;
  const calib = 'calibration' in calibration ? calibration.calibration : undefined;
  const relectures = copies.bilan;
  const relecturesErreur = 'error' in copies ? copies.error : undefined;
  // Le conseil se déduit des deux lectures · aucun modèle appelé, rien facturé.
  const conseil = essaisVue && notes
    ? essaiSuivant({
        cumuls: essaisVue.cumuls,
        trancheParVariable: essaisVue.lots.reduce<Partial<Record<EssaiVariable, number>>>((acc, l) => {
          if (l.tranche) acc[l.variable as EssaiVariable] = (acc[l.variable as EssaiVariable] ?? 0) + 1;
          return acc;
        }, {}),
        tauxDefauts: notes.defauts.taux,
        suspect: notes.defauts.suspects[0]
          ? { quoi: notes.defauts.suspects[0].cle, taux: notes.defauts.suspects[0].taux }
          : null,
      })
    : null;

  return (
    <section aria-label="Essais, notes et relectures de Jarvis" style={{ marginTop: 30 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 500, color: 'var(--ink)' }}>Ce que Jarvis a appris de tes tests</h2>
      </div>
      <p style={{ margin: '6px 0 16px', fontSize: 12.5, color: 'var(--muted)', maxWidth: 760, lineHeight: 1.55 }}>
        Le cumul de tes lots d’essai, de tes notes et des relectures · d’où vient tout ce que Jarvis
        sait de cette marque, additionné ici plutôt que dispersé test par test.
      </p>

      {/* Ce que les lots d'essai ont répondu. */}
      <section id="essais" style={{
        marginBottom: 24, padding: '16px 18px', borderRadius: 14,
        border: `1px solid ${essaisVue?.cumuls.some((c) => c.conclusif) ? 'rgba(126,232,191,.4)' : 'var(--line)'}`,
        background: 'var(--surface)',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>
            Qu’ont répondu tes lots d’essai ?
          </h3>
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
          <Empty
            tone="wait" title="Aucun lot d’essai poussé dans la carte."
            why="Dans Pubs IA, choisis ce que le lot teste avant de générer · un essai d’accroches ou de mises en page ne produit qu’une image, il coûte donc moins cher qu’un lot libre."
          />
        ) : (
          <>
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

        {conseil && (
          <div style={{
            marginTop: 12, padding: '10px 13px', borderRadius: 10,
            border: `1px solid ${conseil.avantTout ? 'rgba(255,90,120,.35)' : 'var(--line-2)'}`,
            background: 'var(--paper)',
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', color: 'var(--muted)' }}>
              {conseil.avantTout ? 'AVANT DE TESTER' : 'LE PROCHAIN ESSAI'}
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginTop: 3, lineHeight: 1.45 }}>{conseil.question}</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3, lineHeight: 1.45 }}>{conseil.pourquoi}</div>
            {conseil.avantTout && <div style={{ fontSize: 11.5, color: '#ffb3c0', marginTop: 5, lineHeight: 1.45 }}>{conseil.avantTout}</div>}
            {conseil.variable && (
              <Link href="/studio/ads" style={{ display: 'inline-block', marginTop: 8, fontSize: 11.5, fontWeight: 800, color: 'var(--accent-strong)', textDecoration: 'none' }}>
                Lancer cet essai dans Pubs IA →
              </Link>
            )}
          </div>
        )}

        <p style={{ margin: '11px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
          Un lot seul donne <b>une observation par bras</b> · pas un taux. C’est en répétant l’essai
          que l’écart devient une mesure, et on ne conclut qu’au-dessus de ce que le hasard
          expliquerait. Les accroches ne se cumulent pas d’un essai à l’autre : chacun en compare de
          nouvelles.
        </p>
      </section>

      {/* Ce que les notes déjà payées disent ensemble. */}
      <section id="bilan-notes" style={{
        marginBottom: 24, padding: '16px 18px', borderRadius: 14,
        border: `1px solid ${notes?.defauts.suspects.length ? 'rgba(255,90,120,.35)' : 'var(--line)'}`,
        background: 'var(--surface)',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>
            Ce que tes notes disent ensemble
          </h3>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--line-2)' }}>
            Score Jarvis
          </span>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: 720 }}>
          Chaque Score Jarvis coûte deux crédits et ne servait qu’une fois. Voici leur somme ·
          d’où viennent tes ratés de fabrication, et ce qui tient le mieux chez toi.
        </p>

        {calib && calib.predictif !== null && (
          <p style={{
            margin: '10px 0 0', padding: '10px 13px', borderRadius: 10,
            background: calib.predictif ? 'rgba(126,232,191,.08)' : 'var(--paper)',
            border: `1px solid ${calib.predictif ? 'rgba(126,232,191,.4)' : 'var(--line)'}`,
            fontSize: 12.5, fontWeight: 600, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 720,
          }}>
            <b style={{ color: calib.predictif ? '#7ee8bf' : 'var(--ink)' }}>
              {calib.predictif ? 'Ton Score Jarvis prédit le marché.' : 'Ton Score Jarvis ne se détache pas encore du hasard.'}
            </b>{' '}
            {calib.resume} <span style={{ color: 'var(--muted)' }}>· sur {calib.conclusifs} créa(s) notée(s) et mesurée(s).</span>
          </p>
        )}

        {notesErreur ? (
          <p style={{ margin: '11px 0 0', padding: '10px 13px', borderRadius: 10, background: 'var(--paper)', border: '1px solid var(--line)', fontSize: 12.5, fontWeight: 600, color: '#ff8095' }}>{notesErreur}</p>
        ) : !notes?.notes ? (
          <Empty
            tone="wait" title="Aucune créa notée pour l’instant."
            why="Le Score Jarvis s’ouvre depuis le panneau d’une pub, dans Pubs IA."
          />
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

      {/* Ce que les relectures disent ensemble. */}
      <section id="bilan-copie" style={{
        marginBottom: 8, padding: '16px 18px', borderRadius: 14,
        border: `1px solid ${relectures?.dimensions.some((d) => d.conclusif) ? 'rgba(255,90,120,.35)' : 'var(--line)'}`,
        background: 'var(--surface)',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>
            Quel moteur écrit tes mots, et garde ton produit
          </h3>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--line-2)' }}>
            Pubs générées entièrement
          </span>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: 720 }}>
          En mode « générée entièrement », c’est le modèle d’images qui écrit la typographie. Chaque
          pub est relue à sa génération · voici la somme de ces relectures.
        </p>

        {relecturesErreur ? (
          <p style={{ margin: '11px 0 0', padding: '10px 13px', borderRadius: 10, background: 'var(--paper)', border: '1px solid var(--line)', fontSize: 12.5, fontWeight: 600, color: '#ff8095' }}>{relecturesErreur}</p>
        ) : !relectures?.relues ? (
          <Empty
            tone="wait" title="Aucune publicité relue pour l’instant."
            why="La relecture tourne toute seule sur les pubs produites en mode « Générée entièrement », dans Pubs IA."
          />
        ) : (
          <>
            <p style={{
              margin: '11px 0 0', padding: '10px 13px', borderRadius: 10,
              background: 'var(--paper)', border: '1px solid var(--line)',
              fontSize: 12.5, fontWeight: 600, lineHeight: 1.55,
              color: (relectures.tauxReecriture ?? 0) > 0 || (relectures.tauxProduit ?? 0) > 0 ? '#ff8095' : '#7ee8bf',
            }}>
              {relectures.resume}
            </p>

            {copies.temoin?.resume && (
              <p style={{
                margin: '8px 0 0', padding: '9px 12px', borderRadius: 10,
                background: 'var(--paper)', border: '1px solid var(--line)',
                fontSize: 12, fontWeight: 600, lineHeight: 1.5,
                color: copies.temoin.evolutions.some((e) => e.sens === 'degradation') ? '#ffb86b' : '#7ee8bf',
              }}>
                Témoin · {copies.temoin.resume}
              </p>
            )}

            {relectures.dimensions.filter((d) => d.conclusif).map((d) => (
              <div key={d.dimension} style={{ marginTop: 12, padding: '9px 12px', borderRadius: 10, background: 'var(--paper)', border: '1px solid var(--line)' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.5 }}>
                  {DIMENSION_COPIE_LABEL[d.dimension]} · {d.resume}
                </div>
                <div style={{ display: 'grid', gap: 3, marginTop: 6 }}>
                  {d.lignes.map((l) => (
                    <div key={l.cle} style={{ display: 'flex', alignItems: 'baseline', gap: 9, fontSize: 12, flexWrap: 'wrap' }}>
                      <span style={{ width: 150, color: 'var(--ink-2)' }}>{l.cle}</span>
                      <span style={{ fontWeight: 700, color: l.verdict === 'meilleur' ? '#7ee8bf' : l.verdict === 'pire' ? '#ff8095' : 'var(--muted)' }}>
                        {Math.round(l.tauxReecriture * 100)} % réécrites
                      </span>
                      <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>
                        sur {l.n} pub(s)
                        {l.tauxProduit !== null && ` · ${Math.round(l.tauxProduit * 100)} % de produits modifiés sur ${l.avecReference}`}
                        {l.verdict === null && ' · écart non tranché'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <p style={{ margin: '11px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
              Un groupe ne se détache qu’au-dessus de {MIN_RELECTURES} publicités relues, et
              seulement si son écart au taux général tient. La fidélité du produit ne se compte que
              sur les pubs qui avaient une photo de référence · sans elle, on n’a pas pu regarder,
              ce qui n’est pas la même chose que « conforme ».
            </p>
          </>
        )}
      </section>
    </section>
  );
}
