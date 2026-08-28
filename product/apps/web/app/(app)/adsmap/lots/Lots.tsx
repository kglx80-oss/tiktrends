'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
  batchDetailAction, candidatesAction, createBatchAction, setBatchAdAction,
  prepareBatchAction, launchBatchAction,
  type BatchDetail, type CandidateAd, type PrepareResult,
} from '../../../actions/adsmap-batch';

/**
 * Préparation d'un lot de test.
 *
 * L'écran répond à une question et une seule : **est-ce que ce lot peut partir,
 * et si non pourquoi ?** Tout ce qui n'y contribue pas en est absent.
 *
 * Il ne crée rien dans Meta. Un brief à recopier coûte deux minutes et n'engage
 * aucune permission d'écriture sur le compte publicitaire du client.
 */

const STATUS_LABEL: Record<string, string> = {
  planned: 'En composition', in_production: 'En production', ready: 'Prêt',
  testing: 'En test', analyzed: 'Analysé',
  draft: 'Brouillon', proposed: 'Proposée', live: 'En test', paused: 'En pause', done: 'Terminée',
};

export function Lots({ batches, brandName }: {
  batches: Array<{ id: string; number: number; status: string; goal: string | null; ads: number }>;
  brandName: string;
}) {
  const [liste, setListe] = useState(batches);
  const [choisi, setChoisi] = useState<string | null>(batches[0]?.id ?? null);
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [candidats, setCandidats] = useState<CandidateAd[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [prep, setPrep] = useState<PrepareResult | null>(null);
  const [nouveauBut, setNouveauBut] = useState('');
  const [copie, setCopie] = useState('');

  const charger = useCallback(async () => {
    if (!choisi) { setDetail(null); return; }
    const [d, c] = await Promise.all([batchDetailAction(choisi), candidatesAction()]);
    if (d.error) { setError(d.error); return; }
    setError('');
    setDetail(d.detail!);
    setCandidats(c.rows ?? []);
  }, [choisi]);

  useEffect(() => { void charger(); }, [charger]);

  async function creer() {
    if (busy) return;
    setBusy(true); setError(''); setPrep(null);
    const r = await createBatchAction(nouveauBut);
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    setListe((l) => [{ id: r.id!, number: r.number!, status: 'planned', goal: nouveauBut || null, ads: 0 }, ...l]);
    setNouveauBut(''); setChoisi(r.id!);
  }

  async function basculer(adId: string, inBatch: boolean) {
    if (!choisi || busy) return;
    setBusy(true); setError(''); setPrep(null);
    const r = await setBatchAdAction({ batchId: choisi, adId, inBatch });
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    await charger();
  }

  async function preparer() {
    if (!choisi || busy) return;
    setBusy(true); setError('');
    const r = await prepareBatchAction(choisi);
    setBusy(false);
    if (r.error) { setError(r.error); setPrep(null); return; }
    setPrep(r);
    await charger();
  }

  async function lancer() {
    if (!choisi || busy) return;
    setBusy(true); setError('');
    const r = await launchBatchAction(choisi);
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    setListe((l) => l.map((b) => (b.id === choisi ? { ...b, status: 'testing' } : b)));
    await charger();
  }

  function copier(texte: string, cle: string) {
    void navigator.clipboard?.writeText(texte).then(() => {
      setCopie(cle);
      setTimeout(() => setCopie(''), 1600);
    }).catch(() => setError('Copie impossible · sélectionne le texte à la main.'));
  }

  const bloquees = detail?.ads.filter((a) => a.blocking).length ?? 0;
  const lancable = !!detail && detail.ads.length > 0 && bloquees === 0 && detail.status !== 'testing' && detail.status !== 'analyzed';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 320px)', gap: 22, alignItems: 'start' }}>
      <div style={{ minWidth: 0 }}>
        {error && (
          <p style={{ padding: '10px 13px', borderRadius: 10, background: 'rgba(254,44,85,.09)', border: '1px solid rgba(254,44,85,.3)', color: '#ff8095', fontSize: 12.5, lineHeight: 1.5, marginTop: 0 }}>
            {error}
          </p>
        )}

        {!detail ? (
          <div style={{ border: '1px dashed var(--line-2)', borderRadius: 16, padding: '34px 24px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)', fontWeight: 700 }}>Aucun lot ouvert.</p>
            <p style={{ margin: '6px auto 0', fontSize: 12.5, color: 'var(--muted)', maxWidth: 460, lineHeight: 1.6 }}>
              Un lot, c’est une campagne dédiée, une fenêtre, un protocole. C’est ce qui rend les ads comparables
              entre elles · sans lui, chaque test se juge seul et ne dit rien.
            </p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Lot {detail.number}</h2>
              <span style={badge}>{STATUS_LABEL[detail.status] ?? detail.status}</span>
              {detail.goal && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>· {detail.goal}</span>}
            </div>

            {/* Ce que le lot pourra conclure · avant de dépenser, pas après */}
            <div style={{
              marginTop: 14, padding: '14px 16px', borderRadius: 13,
              border: '1px solid var(--line)', background: 'var(--surface)',
            }}>
              <h3 style={titreSection}>Brief de lancement</h3>
              <Ligne label="Campagne" valeur={detail.brief.campaignName} onCopy={() => copier(detail.brief.campaignName, 'camp')} copie={copie === 'camp'} />
              <Ligne label="Structure" valeur={detail.brief.structure} />
              <Ligne label="Audience" valeur={detail.brief.audienceRule} />
              <Ligne label="Budget" valeur={`${detail.brief.dailyBudgetPerAd} €/jour/ad · ${detail.brief.durationDays} jours · ${detail.brief.totalBudget} € engagés au total`} />
              <p style={{
                margin: '10px 0 0', fontSize: 12, lineHeight: 1.55,
                color: detail.brief.conclusiveness.startsWith('Attention') ? '#ffcf8f' : 'var(--muted)',
              }}>
                {detail.brief.conclusiveness}
              </p>
              {detail.protocolSummary && (
                <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>{detail.protocolSummary}</p>
              )}
            </div>

            {/* Les ads du lot */}
            <h3 style={{ ...titreSection, marginTop: 22 }}>Ads du lot ({detail.ads.length})</h3>
            {detail.ads.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55 }}>
                Aucune ad · choisis-en dans le vivier à droite.
              </p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {detail.ads.map((a) => (
                  <li key={a.id} style={{
                    border: `1px solid ${a.blocking ? 'rgba(245,166,35,.35)' : 'var(--line)'}`,
                    borderRadius: 11, padding: '10px 13px', background: 'var(--surface)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 12.5, color: 'var(--ink)' }}>{a.variantCode}</strong>
                      <span style={{ fontSize: 12, color: 'var(--ink-2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.concept}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{STATUS_LABEL[a.status] ?? a.status}</span>
                      {detail.status !== 'testing' && detail.status !== 'analyzed' && (
                        <button type="button" onClick={() => basculer(a.id, false)} disabled={busy} style={petitBouton}>retirer</button>
                      )}
                    </div>
                    {a.blocking && (
                      <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#ffcf8f', lineHeight: 1.5 }}>{a.blocking}</p>
                    )}
                    {a.generatedName && (
                      <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <code style={code}>{a.generatedName}</code>
                        <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>ad set · {a.adsetName}</span>
                        <button type="button" onClick={() => copier(a.generatedName!, a.id)} style={petitBouton}>
                          {copie === a.id ? 'copié' : 'copier'}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {prep && (
              <div style={{ marginTop: 14, padding: '11px 14px', borderRadius: 11, border: '1px solid var(--line)', background: 'var(--paper)', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                {prep.named} nom(s) généré(s), {prep.ready} ad(s) passée(s) en prêt.
                {prep.skipped?.length ? ` ${prep.skipped.length} ad(s) restent en brouillon · le détail est sur chaque ligne.` : ' Le lot est prêt à partir.'}
              </div>
            )}

            <div style={{ display: 'flex', gap: 9, marginTop: 16, flexWrap: 'wrap' }}>
              <button type="button" onClick={preparer} disabled={busy || !detail.ads.length} style={{ ...bouton, opacity: busy || !detail.ads.length ? 0.5 : 1 }}>
                {busy ? '…' : 'Préparer le lot'}
              </button>
              <button type="button" onClick={lancer} disabled={busy || !lancable} title={lancable ? undefined : 'Toutes les ads doivent être prêtes'} style={{ ...boutonSecondaire, opacity: busy || !lancable ? 0.5 : 1 }}>
                Marquer comme lancé
              </button>
            </div>
            <p style={{ margin: '9px 0 0', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.55, maxWidth: 620 }}>
              « Préparer » génère les noms attendus côté régie et passe en prêt ce qui peut l’être.
              « Marquer comme lancé » ouvre la fenêtre d’évaluation · c’est de cette date que partent
              les {detail.brief.durationDays} jours et le rattachement des métriques.
            </p>
          </>
        )}
      </div>

      {/* Colonne de droite : les lots, et le vivier */}
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <h3 style={titreSection}>Lots de {brandName}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {liste.map((b) => (
              <button key={b.id} type="button" onClick={() => { setChoisi(b.id); setPrep(null); }} style={{
                textAlign: 'left', padding: '8px 11px', borderRadius: 10, cursor: 'pointer', fontSize: 12,
                border: '1px solid ' + (choisi === b.id ? 'var(--accent-strong)' : 'var(--line-2)'),
                background: choisi === b.id ? 'var(--accent-soft)' : 'var(--surface)', color: 'var(--ink)',
              }}>
                <strong>Lot {b.number}</strong> · {b.ads} ad(s)
                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--muted)', marginTop: 1 }}>
                  {STATUS_LABEL[b.status] ?? b.status}{b.goal ? ` · ${b.goal}` : ''}
                </span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
            <input value={nouveauBut} onChange={(e) => setNouveauBut(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void creer(); }}
              placeholder="But du lot · ex : tester 3 hooks" style={champ} />
            <button type="button" onClick={creer} disabled={busy} style={{ ...bouton, padding: '8px 13px' }}>+</button>
          </div>
        </div>

        {detail && detail.status !== 'testing' && detail.status !== 'analyzed' && (
          <div>
            <h3 style={titreSection}>Vivier ({candidats.length})</h3>
            {candidats.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>
                Aucune ad libre. Crée une itération depuis une gagnante, ou pousse une créa du Studio dans la carte.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 420, overflowY: 'auto' }}>
                {candidats.map((c) => (
                  <button key={c.id} type="button" onClick={() => basculer(c.id, true)} disabled={busy}
                    title={c.blocking ?? 'Prête à être rangée dans le lot'}
                    style={{
                      textAlign: 'left', padding: '7px 10px', borderRadius: 9, cursor: 'pointer', fontSize: 11.5,
                      border: `1px ${c.blocking ? 'dashed' : 'solid'} ${c.blocking ? 'rgba(245,166,35,.4)' : 'var(--line-2)'}`,
                      background: 'var(--surface)', color: 'var(--ink-2)',
                    }}>
                    <strong style={{ color: 'var(--ink)' }}>{c.variantCode}</strong> · {c.concept}
                    {c.blocking && <span style={{ display: 'block', color: '#ffcf8f', fontSize: 10.5, marginTop: 1 }}>incomplète</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Ligne({ label, valeur, onCopy, copie }: { label: string; valeur: string; onCopy?: () => void; copie?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '5px 0', borderTop: '1px solid var(--line)' }}>
      <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontWeight: 700, width: 82, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12.5, color: 'var(--ink)', flex: 1, minWidth: 0, lineHeight: 1.5 }}>{valeur}</span>
      {onCopy && <button type="button" onClick={onCopy} style={petitBouton}>{copie ? 'copié' : 'copier'}</button>}
    </div>
  );
}

const titreSection: CSSProperties = {
  margin: '0 0 9px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em',
  textTransform: 'uppercase', color: 'var(--muted)',
};

const badge: CSSProperties = {
  padding: '2px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 700,
  color: 'var(--ink-2)', border: '1px solid var(--line-2)',
};

const code: CSSProperties = {
  fontFamily: 'ui-monospace, monospace', fontSize: 10.5, color: 'var(--accent-strong)',
  background: 'var(--paper)', padding: '3px 7px', borderRadius: 6, wordBreak: 'break-all',
};

const petitBouton: CSSProperties = {
  padding: '3px 8px', borderRadius: 7, border: '1px solid var(--line-2)', background: 'transparent',
  color: 'var(--muted)', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
};

const bouton: CSSProperties = {
  padding: '9px 18px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)',
  color: '#0d070c', fontWeight: 800, fontSize: 12.5, cursor: 'pointer',
};

const boutonSecondaire: CSSProperties = {
  padding: '9px 18px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent',
  color: 'var(--ink)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
};

const champ: CSSProperties = {
  flex: 1, minWidth: 0, padding: '8px 11px', borderRadius: 9, border: '1px solid var(--line-2)',
  background: 'var(--paper)', color: 'var(--ink)', fontSize: 12, outline: 'none',
};
