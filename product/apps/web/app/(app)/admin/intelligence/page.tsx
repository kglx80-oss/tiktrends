import { redirect } from 'next/navigation';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../../lib/auth';
import { roleAtLeast } from '../../../../lib/rbac';
import { isFounder } from '../../../../lib/founder';
import { COMPETITORS, AI_STACK, CAPABILITIES, GAPS, ADVANTAGES, type Cap } from '../../../../lib/intel';
import { analyseSurvie, PROVEN_DAYS, bilanHypotheses, perfParAngle, type AnalyseSurvie, type BilanHypotheses, type PerfParAngle, type CreaLancee, type VerdictValue } from '@tiktrends/core';
import { eq, inArray } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export default async function IntelligencePage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  if (!isFounder(s.user.email)) redirect('/dashboard');

  // Mesurer le seuil « éprouvé » sur la donnée réelle · tous espaces confondus
  // (vue fondateur). On ne lit qu'une colonne · l'âge de chaque créa concurrente
  // déjà décrite. Le calcul est pur (`analyseSurvie`), la page ne fait que
  // l'afficher à côté du 21 posé de tête.
  let survie: AnalyseSurvie | null = null;
  if (db) {
    const rows = await db.select({ j: schema.marketCreatives.daysRunning }).from(schema.marketCreatives);
    survie = analyseSurvie(rows.map((r) => r.j ?? 0));
  }

  // La boucle d'itération · relier chaque créa générée à son angle d'origine et
  // au jugement du client (👍/👎). Le calcul est pur (`bilanHypotheses`) · on lit
  // les générations de pubs et on regroupe par angle. Vue fondateur, tous
  // espaces.
  let bilan: BilanHypotheses | null = null;
  if (db) {
    const gens = await db.select({ input: schema.generations.input })
      .from(schema.generations).where(eq(schema.generations.kind, 'ad'));
    bilan = bilanHypotheses(gens.map((g) => {
      const rec = (g.input ?? {}) as { angle?: string | null; rating?: 'up' | 'down' | null };
      return { angle: rec.angle ?? null, rating: rec.rating ?? null };
    }));
  }

  // Le pendant OBJECTIF · la performance réelle (verdict ADSMAP) par angle. On
  // relie chaque ad lancée à la génération qui l'a produite (lien AD-level, le
  // plus sûr · on écarte les rattachements ambigus plutôt que de les deviner),
  // puis à l'angle de cette génération (#300). ⚠ Jointure non vérifiée sur
  // données réelles · à confirmer côté propriétaire.
  let perf: PerfParAngle | null = null;
  if (db) {
    const rows = await db.select({
      sourceRef: schema.ads.sourceRef,
      computed: schema.verdicts.computed,
      metricsAgg: schema.verdicts.metricsAgg,
    })
      .from(schema.ads)
      .innerJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id));

    // 1) L'angle de chaque génération référencée par une ad.
    const genIds = Array.from(new Set(rows
      .map((r) => (r.sourceRef as { generationId?: string } | null)?.generationId)
      .filter((x): x is string => !!x)));
    const angleParGen = new Map<string, string | null>();
    if (genIds.length) {
      const gs = await db.select({ id: schema.generations.id, input: schema.generations.input })
        .from(schema.generations).where(inArray(schema.generations.id, genIds));
      for (const g of gs) angleParGen.set(g.id, ((g.input ?? {}) as { angle?: string | null }).angle ?? null);
    }

    // 2) Chaque ad conclusive rattachée devient une ligne {angle, verdict, métriques}.
    const creas: CreaLancee[] = rows.map((r) => {
      const genId = (r.sourceRef as { generationId?: string } | null)?.generationId;
      const agg = (r.metricsAgg ?? null) as { spend?: number; ctr?: number } | null;
      return {
        angle: genId ? angleParGen.get(genId) ?? null : null,
        verdict: (r.computed ?? null) as VerdictValue | null,
        spend: agg?.spend ?? null,
        ctr: agg?.ctr ?? null,
      };
    });
    perf = perfParAngle(creas);
  }

  return (
    <main style={{ padding: '30px clamp(16px, 4vw, 36px) 60px', maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 4px', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 27, fontWeight: 800, color: 'var(--ink)', letterSpacing: -0.5 }}>Intelligence marché</h1>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: 'var(--on-accent)', background: 'var(--grad-accent)' }}>ADMIN+</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginTop: 6, marginBottom: 22, maxWidth: 760, lineHeight: 1.6 }}>
        Où l'on se situe face aux concurrents directs, et comment notre pile IA maison (Jarvis) fait la différence.
        Données publiques / estimations · les tarifs évoluent, à revérifier avant tout usage commercial.
      </p>

      {/* Matrice comparative */}
      <h2 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Matrice comparative</h2>
      <div style={{ border: '1px solid var(--line-2)', borderRadius: 16, background: 'var(--surface)', overflow: 'hidden', marginBottom: 30 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 680 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={mth}>Capacité</th>
                <th style={mthC}>TikTrends</th><th style={mthC}>Atria</th><th style={mthC}>Foreplay</th><th style={mthC}>Higgsfield</th>
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((r) => (
                <tr key={r.capability} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ ...mtd, color: 'var(--ink)', fontWeight: 700 }}>{r.capability}{r.note && <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 400 }}>{r.note}</div>}</td>
                  <td style={mtdC}><Dot v={r.us} highlight /></td>
                  <td style={mtdC}><Dot v={r.atria} /></td>
                  <td style={mtdC}><Dot v={r.foreplay} /></td>
                  <td style={mtdC}><Dot v={r.higgsfield} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 16, padding: '10px 16px', borderTop: '1px solid var(--line)', fontSize: 11, color: 'var(--muted)', flexWrap: 'wrap' }}>
          <span><b style={{ color: '#7ee8bf' }}>●</b> Oui</span><span><b style={{ color: '#f5b043' }}>◐</b> Partiel</span><span><b style={{ color: 'var(--line-2)' }}>○</b> Non</span>
        </div>
      </div>

      {/* Où faire mieux + avantages */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div style={{ border: '1px solid rgba(245,176,67,.35)', borderRadius: 16, background: 'linear-gradient(180deg, rgba(245,166,35,.06), var(--surface))', padding: '18px 20px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>🎯 Où l'on doit faire mieux</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            {GAPS.map((g) => (
              <div key={g.title}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.05em', padding: '2px 7px', borderRadius: 999, color: g.priority === 'haute' ? '#0d070c' : 'var(--ink-2)', background: g.priority === 'haute' ? 'linear-gradient(135deg,#f5a623,#ff8c42)' : 'var(--line)' }}>{g.priority.toUpperCase()}</span>
                  <b style={{ fontSize: 13.5, color: 'var(--ink)' }}>{g.title}</b>
                  <span style={{ fontSize: 10.5, color: 'var(--muted)', marginLeft: 'auto' }}>vs {g.vs}</span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>{g.detail}</p>
              </div>
            ))}
          </div>
        </div>
        <div style={{ border: '1px solid rgba(126,232,191,.35)', borderRadius: 16, background: 'linear-gradient(180deg, rgba(61,220,151,.06), var(--surface))', padding: '18px 20px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>💪 Nos avantages à presser</h3>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 9, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            {ADVANTAGES.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      </div>

      {/* Notre pile IA */}
      <h2 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Notre pile IA · orchestration maison</h2>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--ink-2)', maxWidth: 760, lineHeight: 1.6 }}>
        Les modèles (Nano Banana, Kling, Claude) sont le <b>moteur</b>. Notre valeur, c'est la <b>chaîne</b> et la
        gouvernance : veille → contexte marque → règles Jarvis → concept → scène produit fidèle → design → vidéo →
        contrôle qualité. Interchangeable : si un meilleur modèle sort, on le branche sans changer la couche Jarvis.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10, marginBottom: 30 }}>
        {AI_STACK.map((l, i) => (
          <div key={l.layer} style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: '13px 15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--grad-accent)', color: 'var(--on-accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
              <b style={{ fontSize: 13.5, color: 'var(--ink)' }}>{l.layer}</b>
            </div>
            <p style={{ margin: '8px 0 6px', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>{l.role}</p>
            <div style={{ fontSize: 11, color: 'var(--accent-strong)', fontWeight: 700 }}>{l.engines}</div>
          </div>
        ))}
      </div>

      {/* Concurrents */}
      <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Concurrents directs</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)' }}>Atria · Foreplay · Higgsfield</p>

      <div style={{ display: 'grid', gap: 16 }}>
        {COMPETITORS.map((c) => (
          <div key={c.key} style={{ border: '1px solid var(--line-2)', borderRadius: 18, background: 'var(--surface)', padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--ink)' }}>{c.name}</h3>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', padding: '2px 8px', borderRadius: 999, color: 'var(--accent-strong)', border: '1px solid var(--line-2)' }}>{c.tag}</span>
              <span style={{ flex: 1 }} />
              <a href={c.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>{c.url.replace('https://', '')} ↗</a>
            </div>
            <p style={{ margin: '10px 0 12px', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>{c.positioning}</p>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-2)', background: 'rgba(255,255,255,.04)', border: '1px solid var(--line)', borderRadius: 10, padding: '7px 11px', marginBottom: 14 }}>
              <span style={{ fontSize: 13 }}>💶</span><b style={{ color: 'var(--ink)' }}>Tarif estimé :</b> {c.pricing}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <div>
                <div style={colH('#7ee8bf')}>Forces</div>
                <ul style={ulS}>{c.strengths.map((x, i) => <li key={i} style={{ marginBottom: 4 }}>{x}</li>)}</ul>
              </div>
              <div>
                <div style={colH('#f5b043')}>Limites</div>
                <ul style={ulS}>{c.weaknesses.map((x, i) => <li key={i} style={{ marginBottom: 4 }}>{x}</li>)}</ul>
              </div>
            </div>

            <div style={{ marginTop: 14, padding: '12px 15px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(254,44,85,.10), rgba(120,90,255,.06))', border: '1px solid var(--line-2)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--accent-strong)', marginBottom: 4 }}>Notre angle</div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', lineHeight: 1.55 }}>{c.ourEdge}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Seuil « éprouvé » · mesuré, pas posé de tête */}
      <h2 style={{ margin: '4px 0 6px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Seuil « éprouvé » · mesuré</h2>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 0, marginBottom: 14, maxWidth: 760, lineHeight: 1.6 }}>
        Le code fige <b>PROVEN_DAYS = {PROVEN_DAYS} j</b>, écrit de tête. Voici ce que dit la donnée réelle
        (âge de chaque créa concurrente décrite, tous espaces confondus). On <b>ne change rien</b> ici · on montre la
        courbe pour décider sur mesure, avec de la marge.
      </p>
      {!survie ? (
        <div style={cardSurvie}><p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Base indisponible.</p></div>
      ) : (
        <div style={cardSurvie}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 14 }}>
            <StatSurvie v={String(survie.effectifTotal)} label="Créas mesurées" />
            <StatSurvie v={survie.mediane + ' j'} label="Médiane" />
            <StatSurvie v={survie.p75 + ' j'} label="p75" />
            <StatSurvie v={survie.p90 + ' j'} label="p90" />
            <StatSurvie v={PROVEN_DAYS + ' j'} label="Seuil actuel (posé)" />
            <StatSurvie v={survie.recommande != null ? survie.recommande + ' j' : '—'} label="Seuil mesuré" accent />
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 480 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={sth}>Seuil</th><th style={sth}>Créas au-delà</th><th style={sth}>Part du marché</th><th style={sth}></th>
                </tr>
              </thead>
              <tbody>
                {survie.paliers.map((p) => (
                  <tr key={p.jour} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ ...std, fontWeight: 700, color: p.jour === survie!.recommande ? 'var(--accent-strong)' : 'var(--ink)' }}>{p.jour} j{p.jour === PROVEN_DAYS && <span style={{ fontSize: 10, color: 'var(--muted)' }}> · actuel</span>}</td>
                    <td style={std}>{p.effectif}</td>
                    <td style={std}>{Math.round(p.partAuDela * 100)} %</td>
                    <td style={{ ...std, width: 140 }}>
                      <div style={{ height: 7, background: 'var(--paper)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ width: Math.round(p.partAuDela * 100) + '%', height: '100%', background: 'var(--grad-accent)' }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>{survie.raison}</p>
        </div>
      )}

      {/* La boucle d'itération · l'angle testé → la pertinence jugée */}
      <h2 style={{ margin: '4px 0 6px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Hypothèses d'angle · ce qui convainc</h2>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 0, marginBottom: 14, maxWidth: 760, lineHeight: 1.6 }}>
        Chaque créa générée porte l'angle qui l'a armée · on la relie au jugement du client (👍/👎). Taux de
        pertinence <b>par angle</b>, comparé au taux général · un angle sous {5} jugements « attend » plutôt que de trancher.
      </p>
      {!bilan || bilan.lignes.length === 0 ? (
        <div style={cardSurvie}><p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          Aucune hypothèse d'angle encore mesurable · les créas générées depuis un angle de marché (« Génère dans l'angle dominant »)
          apparaîtront ici dès qu'elles seront jugées.
        </p></div>
      ) : (
        <div style={cardSurvie}>
          <div style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--ink-2)' }}>
            Référence · taux général <b style={{ color: 'var(--ink)' }}>{bilan.tauxGeneral != null ? Math.round(bilan.tauxGeneral * 100) + ' %' : '—'}</b> sur {bilan.jugeesTotal} créa(s) jugée(s).
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 560 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={sth}>Angle</th><th style={sth}>Générées</th><th style={sth}>Jugées</th><th style={sth}>Pertinence</th><th style={sth}></th>
                </tr>
              </thead>
              <tbody>
                {bilan.lignes.map((l) => (
                  <tr key={l.angle} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ ...std, color: 'var(--ink)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.angle}>{l.angle}</td>
                    <td style={std}>{l.total}</td>
                    <td style={std}>{l.jugees}</td>
                    <td style={{ ...std, fontWeight: 700, color: l.aConfirmer ? 'var(--muted)' : 'var(--ink)' }}>{l.tauxPertinence != null ? Math.round(l.tauxPertinence * 100) + ' %' : '—'}</td>
                    <td style={{ ...std, width: 120 }}>{l.aConfirmer ? <span style={{ fontSize: 11, color: 'var(--muted)' }}>à confirmer</span> : (bilan!.tauxGeneral != null && l.tauxPertinence != null ? (l.tauxPertinence >= bilan!.tauxGeneral ? <span style={{ fontSize: 11, color: '#2fd6a0', fontWeight: 700 }}>au-dessus</span> : <span style={{ fontSize: 11, color: '#f5a623' }}>en dessous</span>) : null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Le pendant OBJECTIF · la performance réelle par angle */}
      <h2 style={{ margin: '4px 0 6px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Hypothèses d'angle · ce qui a PAYÉ</h2>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 0, marginBottom: 6, maxWidth: 760, lineHeight: 1.6 }}>
        Le vote objectif · pour chaque angle, la part de créas lancées jugées <b>gagnantes</b> par ADSMAP (sur métriques
        réelles), comparée au taux général. « Le client a aimé » et « le marché a payé » sont deux choses · voici la seconde.
      </p>
      <p style={{ color: '#f5a623', fontSize: 11.5, marginTop: 0, marginBottom: 14 }}>
        ⚠ Jointure ad → génération → angle <b>non encore vérifiée sur données réelles</b> · lien AD-level seul (les
        rattachements ambigus sont écartés, pas devinés). À confirmer avant tout usage de décision.
      </p>
      {!perf || perf.lignes.length === 0 ? (
        <div style={cardSurvie}><p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          Aucune créa lancée n'est encore rattachable à un angle · ce tableau se remplit quand des créas générées depuis
          un angle (#300) sont lancées via ADSMAP et reçoivent un verdict.
        </p></div>
      ) : (
        <div style={cardSurvie}>
          <div style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--ink-2)' }}>
            Référence · taux de gagnants général <b style={{ color: 'var(--ink)' }}>{perf.tauxGeneral != null ? Math.round(perf.tauxGeneral * 100) + ' %' : '—'}</b> sur {perf.conclusifsTotal} créa(s) conclusive(s).
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 620 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={sth}>Angle</th><th style={sth}>Lancées</th><th style={sth}>Conclusives</th><th style={sth}>Gagnants</th><th style={sth}>CTR moyen</th><th style={sth}></th>
                </tr>
              </thead>
              <tbody>
                {perf.lignes.map((l) => (
                  <tr key={l.angle} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ ...std, color: 'var(--ink)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.angle}>{l.angle}</td>
                    <td style={std}>{l.total}</td>
                    <td style={std}>{l.conclusifs}</td>
                    <td style={{ ...std, fontWeight: 700, color: l.aConfirmer ? 'var(--muted)' : 'var(--ink)' }}>{l.tauxGagnant != null ? Math.round(l.tauxGagnant * 100) + ' %' : '—'}</td>
                    <td style={std}>{l.ctrMoyen != null ? (l.ctrMoyen * 100).toFixed(2).replace('.', ',') + ' %' : '—'}</td>
                    <td style={{ ...std, width: 120 }}>{l.aConfirmer ? <span style={{ fontSize: 11, color: 'var(--muted)' }}>à confirmer</span> : (perf!.tauxGeneral != null && l.tauxGagnant != null ? (l.tauxGagnant >= perf!.tauxGeneral ? <span style={{ fontSize: 11, color: '#2fd6a0', fontWeight: 700 }}>au-dessus</span> : <span style={{ fontSize: 11, color: '#f5a623' }}>en dessous</span>) : null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}

const cardSurvie = { border: '1px solid var(--line-2)', borderRadius: 16, background: 'var(--surface)', padding: 18, marginBottom: 30 } as const;
const sth = { padding: '8px 12px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' } as const;
const std = { padding: '8px 12px', color: 'var(--ink-2)' } as const;

function StatSurvie({ v, label, accent }: { v: string; label: string; accent?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, color: accent ? 'var(--accent-strong)' : 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

const ulS = { margin: '2px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 } as const;
function colH(color: string) {
  return { fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color, marginBottom: 6 } as const;
}

function Dot({ v, highlight }: { v: Cap; highlight?: boolean }) {
  const map = { yes: { c: '#7ee8bf', s: '●' }, partial: { c: '#f5b043', s: '◐' }, no: { c: 'var(--line-2)', s: '○' } } as const;
  const m = map[v];
  return <span style={{ fontSize: 16, color: m.c, textShadow: highlight && v === 'yes' ? '0 0 10px rgba(126,232,191,.5)' : 'none' }}>{m.s}</span>;
}

const mth = { padding: '10px 16px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' } as const;
const mthC = { ...mth, textAlign: 'center', width: 96 } as const;
const mtd = { padding: '10px 16px', verticalAlign: 'top' } as const;
const mtdC = { ...mtd, textAlign: 'center' } as const;
