'use client';

import { useCallback, useEffect, useState } from 'react';
import { marketViewAction, learnFromFollowedAction, type MarketView } from '../../../actions/market-learn';

/**
 * Ce que fait le marché, et où nos chiffres le contredisent.
 *
 * L'ordre d'affichage n'est pas neutre : la CONFRONTATION passe avant les parts
 * de marché. Savoir que 70 % des concurrents ouvrent sur un visage est une
 * donnée de culture générale · savoir qu'ils le font ET que ça perd chez nous
 * est une décision, et c'est la seule chose qui mérite le haut de l'écran.
 *
 * Le panneau répète que ces pourcentages ne sont pas des taux de réussite. Sans
 * cette phrase, un pourcentage à côté d'un autre pourcentage se lit comme une
 * comparaison de performances · ce qui serait faux, et coûteux.
 */

const DIM_LABEL: Record<string, string> = {
  hook_type: 'Accroches', opening_type: 'Ouvertures', talent: 'Présence à l’écran',
  length_bucket: 'Durées', format: 'Formats',
};

const TON: Record<string, { bd: string; fg: string; titre: string }> = {
  contredit: { bd: 'rgba(254,44,85,.4)', fg: '#ff8095', titre: 'Le marché dit l’inverse de tes chiffres' },
  inexploite: { bd: 'rgba(245,166,35,.4)', fg: '#ffcf8f', titre: 'Pratique majoritaire jamais testée chez toi' },
  confirme: { bd: 'rgba(126,232,191,.35)', fg: '#7ee8bf', titre: 'Le marché confirme tes chiffres' },
};

export function MarketPanel() {
  const [v, setV] = useState<MarketView | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ texte: string; erreur: boolean } | null>(null);

  const charger = useCallback(async () => {
    const r = await marketViewAction();
    if (r.error) { setMsg({ texte: r.error, erreur: true }); return; }
    setV(r.view!);
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  async function apprendre() {
    if (busy) return;
    setBusy(true); setMsg(null);
    const r = await learnFromFollowedAction();
    setBusy(false);
    if (r.error) { setMsg({ texte: r.error, erreur: true }); return; }
    setMsg({ texte: r.summary ?? 'Terminé.', erreur: false });
    await charger();
  }

  const pct = (x: number) => `${Math.round(x * 100)} %`;

  return (
    <section style={{ marginTop: 22, padding: '16px 18px', borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 340px', minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Ce que fait le marché</h2>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
            Les créas de tes concurrents, décrites avec la <b>même grille</b> que les tiennes · c’est ce
            qui les rend comparables. On ne connaît aucun chiffre de performance des autres : le seul
            signal disponible est qu’<b>une pub qui tourne encore après trois semaines est une pub que
            son annonceur continue de payer</b>.
          </p>
          {v && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
              {v.sampleSize} créa(s) décrites · {v.provenSize} qui tiennent · {v.advertisers} annonceur(s).
            </p>
          )}
        </div>
        <button type="button" onClick={apprendre} disabled={busy} style={{
          padding: '9px 18px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)',
          color: '#0d070c', fontWeight: 800, fontSize: 12.5, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
        }}>
          {busy ? 'Analyse…' : 'Apprendre des marques suivies'}
        </button>
      </div>

      {msg && (
        <p style={{ margin: '11px 0 0', fontSize: 12.5, lineHeight: 1.55, color: msg.erreur ? '#ff8095' : 'var(--ink-2)' }}>
          {msg.texte}
        </p>
      )}

      {v && (
        <>
          <p style={{
            margin: '14px 0 0', padding: '10px 13px', borderRadius: 10,
            background: 'var(--paper)', border: '1px solid var(--line)',
            fontSize: 12.5, color: 'var(--ink)', fontWeight: 600, lineHeight: 1.55,
          }}>
            {v.summary}
          </p>

          {/* La confrontation d'abord · c'est elle qui fait décider. */}
          {v.contrasts.length > 0 && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {v.contrasts.slice(0, 6).map((c) => {
                const t = TON[c.kind] ?? TON.confirme!;
                return (
                  <div key={`${c.dimension}:${c.key}`} style={{ border: `1px solid ${t.bd}`, borderRadius: 11, padding: '10px 13px' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: t.fg }}>
                      {t.titre}
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{c.statement}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Les parts ensuite · avec le rappel que ce ne sont pas des performances. */}
          {v.rows.length > 0 && (
            <details style={{ marginTop: 14 }}>
              <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
                Voir les parts d’usage du marché
              </summary>
              <p style={{ margin: '9px 0 10px', fontSize: 11.5, color: '#ffcf8f', lineHeight: 1.5 }}>
                Ce sont des parts d’USAGE parmi les créas qui tiennent, pas des taux de réussite ·
                aucun chiffre de performance des concurrents n’est connu.
              </p>
              {Object.entries(
                v.rows.reduce<Record<string, typeof v.rows>>((acc, r) => {
                  (acc[r.dimension] ??= []).push(r);
                  return acc;
                }, {}),
              ).map(([dim, rows]) => (
                <div key={dim} style={{ marginBottom: 11 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 5 }}>
                    {DIM_LABEL[dim] ?? dim}
                  </div>
                  {rows.slice(0, 5).map((r) => (
                    <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
                      <span style={{ width: 150, fontSize: 12, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.key}</span>
                      <div style={{ flex: 1, height: 7, background: 'var(--paper)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ width: `${r.shareOfProven * 100}%`, height: '100%', borderRadius: 999, background: 'var(--grad-accent)' }} />
                      </div>
                      <span style={{ width: 44, textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>{pct(r.shareOfProven)}</span>
                      <span style={{ width: 96, textAlign: 'right', fontSize: 11, color: 'var(--muted)' }}>
                        {r.nProven} créas · {r.advertisers} ann.
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </details>
          )}
        </>
      )}

      <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
        2 crédits par créa décrite · par lots de 20. Une créa déjà décrite n’est jamais repayée.
      </p>
    </section>
  );
}
