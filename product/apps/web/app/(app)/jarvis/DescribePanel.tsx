'use client';

import { useCallback, useEffect, useState } from 'react';
import { analyzeAssetsAction, analysisCoverageAction, type AnalysisCoverage } from '../../actions/adsmap-analyze';

/**
 * Description des créas · agent A0.
 *
 * Le tableau de Jarvis ne peut dire « les accroches chiffrées gagnent 3 fois sur
 * 8 » que si quelqu'un a d'abord noté quelle accroche portait chaque créa. Cet
 * encart existe pour rendre ce travail visible et déclenchable · sinon les
 * colonnes restent vides et les lignes les plus utiles du tableau n'apparaissent
 * jamais, sans que rien ne l'explique.
 *
 * La COUVERTURE est affichée avant le bouton, et c'est délibéré : une statistique
 * calculée sur trois créas décrites sur cent est une statistique fausse. Le
 * chiffre dit à quel point on peut se fier au tableau du dessus.
 */
export function DescribePanel() {
  const [c, setC] = useState<AnalysisCoverage | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [details, setDetails] = useState<string[]>([]);

  const charger = useCallback(async () => {
    const r = await analysisCoverageAction();
    if (r.coverage) setC(r.coverage);
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  async function decrire() {
    if (busy) return;
    setBusy(true); setMsg(null); setDetails([]);
    const r = await analyzeAssetsAction();
    setBusy(false);
    if (r.error) { setMsg({ texte: r.error, erreur: true }); return; }
    setMsg({ texte: r.summary ?? 'Terminé.', erreur: false });
    // Les raisons sont affichées telles quelles · « rien à décrire » est une
    // information, pas un échec à cacher.
    setDetails([...new Set((r.skipped ?? []).map((s) => s.reason))].slice(0, 5));
    await charger();
  }

  const restant = c ? Math.max(0, c.total - c.described - c.withoutAsset) : 0;
  const couverture = c && c.total > 0 ? Math.round((c.described / c.total) * 100) : null;

  return (
    <section style={{
      marginTop: 22, padding: '15px 17px', borderRadius: 13,
      border: '1px solid var(--line)', background: 'var(--surface)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 340px', minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>Décrire les créas</h2>
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
            Le tableau ci-dessus ne peut parler d’accroches, d’ouvertures et de talents que si chaque
            créa a été décrite. L’agent regarde le visuel et le texte, et note ce qu’il voit · il ne
            juge rien, le jugement reste au verdict.
          </p>
          {c && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: couverture !== null && couverture < 50 ? '#ffcf8f' : 'var(--muted)', lineHeight: 1.5 }}>
              {c.total === 0
                ? 'Aucune créa dans la carte pour l’instant.'
                : `${c.described} créa(s) décrite(s) sur ${c.total}${couverture !== null ? ` · ${couverture} %` : ''}`}
              {c.manual > 0 && ` · dont ${c.manual} corrigée(s) à la main, que l’agent ne touche pas.`}
              {c.withoutAsset > 0 && ` ${c.withoutAsset} sans visuel ni texte, indescriptibles en l’état.`}
              {couverture !== null && couverture < 50 && c.described > 0 && ' Sous la moitié, les lignes du tableau tirées de ces champs restent peu fiables.'}
            </p>
          )}
        </div>
        <button type="button" onClick={decrire} disabled={busy || restant === 0} style={{
          padding: '9px 18px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)',
          color: '#0d070c', fontWeight: 800, fontSize: 12.5,
          cursor: busy || restant === 0 ? 'default' : 'pointer', opacity: busy || restant === 0 ? 0.5 : 1,
        }}>
          {busy ? 'Analyse…' : restant > 0 ? `Décrire ${Math.min(restant, 25)} créa(s)` : 'Tout est décrit'}
        </button>
      </div>

      {msg && (
        <p style={{ margin: '11px 0 0', fontSize: 12.5, lineHeight: 1.55, color: msg.erreur ? '#ff8095' : 'var(--ink-2)' }}>
          {msg.texte}
        </p>
      )}
      {details.length > 0 && (
        <ul style={{ margin: '7px 0 0', paddingLeft: 16, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.55 }}>
          {details.map((d) => <li key={d}>{d}</li>)}
        </ul>
      )}
      <p style={{ margin: '9px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
        2 crédits par créa · par lots de 25, remboursés quand l’agent ne trouve rien à décrire.
      </p>
    </section>
  );
}
