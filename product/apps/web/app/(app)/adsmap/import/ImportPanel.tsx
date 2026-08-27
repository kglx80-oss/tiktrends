'use client';

import { useState, type CSSProperties } from 'react';
import { previewImportAction, applyImportAction, type PreviewResult } from '../../../actions/adsmap-import';

/**
 * Import du tableau historique · en deux temps.
 *
 * On analyse et on montre le rapport AVANT d'écrire. Un import de plus de cent
 * lignes qui écrit d'abord et explique ensuite est un import qu'on n'ose pas
 * relancer · celui-ci se relit tranquillement, et ne touche à rien tant qu'on
 * n'a pas cliqué la seconde fois.
 */
export function ImportPanel({ brandName }: { brandName: string }) {
  const [csv, setCsv] = useState('');
  const [nom, setNom] = useState('');
  const [prev, setPrev] = useState<PreviewResult | null>(null);
  const [fait, setFait] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function choisir(f: File | null) {
    if (!f) return;
    setErr(''); setPrev(null); setFait(false);
    const texte = await f.text();
    setCsv(texte); setNom(f.name);
    setBusy(true);
    const r = await previewImportAction(texte);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setPrev(r);
  }

  async function appliquer() {
    if (busy || !csv) return;
    setBusy(true); setErr('');
    const r = await applyImportAction(csv);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setFait(true);
  }

  const rep = prev?.report;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={panel}>
        <h2 style={h2}>1 · Choisir le fichier</h2>
        <p style={sub}>
          Le CSV exporté depuis Google Sheets, onglet de la marque. L’en-tête peut se trouver en
          deuxième ligne et les valeurs porter des émojis · c’est prévu.
        </p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => choisir(e.target.files?.[0] ?? null)}
          style={{ fontSize: 13, color: 'var(--ink-2)' }} />
        {nom && <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8 }}>{nom}</p>}
      </section>

      {busy && !prev && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Analyse du fichier…</p>}
      {err && <div style={{ ...bandeau, background: 'rgba(254,44,85,.08)', borderColor: 'rgba(254,44,85,.32)', color: '#ff8095' }}>{err}</div>}

      {rep && !fait && (
        <>
          <section style={panel}>
            <h2 style={h2}>2 · Ce qui sera créé</h2>
            <p style={sub}>Rien n’est encore écrit. Relis, puis applique.</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
              <Chiffre label="Lignes lues" v={rep.rowsRead} fort />
              <Chiffre label="Ads" v={rep.ads} fort />
              <Chiffre label="Concepts" v={rep.concepts} />
              <Chiffre label="Angles" v={rep.angles} />
              <Chiffre label="Désirs" v={rep.desires} />
              <Chiffre label="Lots" v={rep.batches} />
              <Chiffre label="Verdicts" v={rep.verdicts} />
              <Chiffre label="Apprentissages" v={rep.learnings} />
            </div>

            {rep.rowsRead === rep.ads && (
              <p style={{ fontSize: 12.5, color: '#7ee8bf', margin: '0 0 14px' }}>
                ✓ Aucune ligne perdue · {rep.conceptsMerged} ligne(s) regroupée(s) en variantes d’un même concept.
              </p>
            )}

            {rep.warnings.length > 0 && (
              <ul style={{ margin: 0, padding: '12px 16px 12px 30px', borderRadius: 12, background: 'rgba(245,166,35,.07)', border: '1px solid rgba(245,166,35,.25)', display: 'grid', gap: 6 }}>
                {rep.warnings.map((w, i) => <li key={i} style={{ fontSize: 12.5, color: '#ffcf8f', lineHeight: 1.55 }}>{w}</li>)}
              </ul>
            )}
          </section>

          {prev?.sample && prev.sample.length > 0 && (
            <section style={panel}>
              <h2 style={h2}>Aperçu</h2>
              <p style={sub}>Les douze premières lignes, telles qu’elles seront enregistrées.</p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
                  <thead><tr>{['Concept', 'Angle', 'Désir', 'Variante', 'Statut', 'Verdict', 'Date'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {prev.sample.map((r, i) => (
                      <tr key={i}>
                        <td style={{ ...td, color: 'var(--ink)', maxWidth: 200 }}>{r.concept}</td>
                        <td style={{ ...td, color: 'var(--ink-2)' }}>{r.angle}</td>
                        <td style={{ ...td, color: 'var(--ink-2)' }}>{r.desire}</td>
                        <td style={{ ...td, fontFamily: 'ui-monospace, monospace', color: 'var(--accent-strong)' }}>{r.variant}</td>
                        <td style={td}>{r.status}</td>
                        <td style={td}>{r.verdict ?? '—'}</td>
                        <td style={{ ...td, color: 'var(--muted)' }}>{r.date ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div>
            <button type="button" onClick={appliquer} disabled={busy}
              style={{ padding: '11px 22px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 13.5, cursor: busy ? 'wait' : 'pointer' }}>
              {busy ? 'Import en cours…' : `Importer ${rep.ads} ad(s) dans ${brandName}`}
            </button>
            <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
              Tout arrive « proposé » : rien n’est considéré comme validé tant que tu ne l’as pas relu.
            </p>
          </div>
        </>
      )}

      {fait && rep && (
        <div style={{ ...bandeau, background: 'rgba(126,232,191,.07)', borderColor: 'rgba(126,232,191,.3)', color: '#7ee8bf' }}>
          <b>Import terminé.</b> {rep.ads} ad(s), {rep.concepts} concept(s) et {rep.batches} lot(s) créés.
          {rep.demotedToDraft > 0 && ` ${rep.demotedToDraft} ad(s) attendent leur hypothèse avant de pouvoir repartir en test.`}
          {' '}<a href="/adsmap" style={{ color: '#7ee8bf', fontWeight: 700 }}>Ouvrir le tableau ›</a>
        </div>
      )}
    </div>
  );
}

function Chiffre({ label, v, fort }: { label: string; v: number; fort?: boolean }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', background: 'var(--paper)' }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: fort ? 'var(--accent-strong)' : 'var(--ink)', marginTop: 3 }}>{v}</div>
    </div>
  );
}

const panel: CSSProperties = { border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: '18px 20px' };
const h2: CSSProperties = { margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: 'var(--ink)' };
const sub: CSSProperties = { color: 'var(--muted)', fontSize: 12.5, margin: '0 0 14px', lineHeight: 1.6, maxWidth: 660 };
const bandeau: CSSProperties = { padding: '12px 15px', borderRadius: 12, border: '1px solid', fontSize: 13, lineHeight: 1.6 };
const th: CSSProperties = { textAlign: 'left', padding: '7px 10px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted)', borderBottom: '1px solid var(--line)' };
const td: CSSProperties = { padding: '7px 10px', borderTop: '1px solid var(--line)' };
