'use client';

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { VerdictValue, TestedVariable } from '@tiktrends/core';
import {
  adDetailAction, validateVerdictAction, createIterationAction,
  type AdDetail, type ValidateInput,
} from '../../actions/adsmap-verdict';

/**
 * Panneau d'arbitrage d'un test.
 *
 * Il y a trois gestes, et un seul ordre possible entre eux : comprendre le
 * chiffre, en tirer un enseignement, décider de la suite. L'écran suit cet ordre
 * plutôt que d'offrir trois onglets · l'itération n'a de sens qu'après le
 * verdict, et le verdict n'a pas le droit d'être clos sans apprentissage (§2.4).
 *
 * Le champ d'apprentissage n'est pas une case à cocher de conformité : c'est la
 * seule chose que Jarvis relira avant d'écrire la créa suivante. Le formulaire
 * refuse donc « ok » et demande une phrase réutilisable.
 */

const VERDICT_LABEL: Record<string, string> = {
  winner: 'Gagnante', baby_winner: 'Gagnante naissante', relative_winner: 'Gagnante (relatif)',
  loser: 'Perdante', inconclusive: 'Non concluant', insufficient_delivery: 'Sous-diffusée',
};
const STAGE_LABEL: Record<string, string> = { hook: 'Accroche', hold: 'Rétention', click: 'Clic', convert: 'Conversion' };
const VARIABLE_LABEL: Record<string, string> = {
  hook: 'Hook', opening_visual: 'Visuel d’ouverture', body: 'Corps', length: 'Durée', cta: 'CTA',
  format: 'Format', offer: 'Offre', landing: 'Landing', avatar_on_screen: 'Personne à l’écran',
  proof: 'Preuve', audio: 'Audio', angle: 'Angle', desire: 'Désir',
};
const SCOPE_LABEL: Record<string, string> = {
  ad: 'Cette ad', concept: 'Le concept', angle: 'L’angle', desire: 'Le désir',
  avatar: 'L’avatar', format: 'Le format', landing: 'La page', offer: 'L’offre',
};
const MODE_LABEL: Record<string, { titre: string; aide: string }> = {
  more: { titre: 'MORE', aide: 'Refaire la même chose · on scale ce qui marche sans y toucher.' },
  better: { titre: 'BETTER', aide: 'Changer une variable pour améliorer · le cœur de la boucle.' },
  new: { titre: 'NEW', aide: 'Nouvelle piste · ce n’est plus une itération, on repart d’ailleurs.' },
};

const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)} %`);
const eur = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} €`);

export function AdDrawer({ adId, onClose, onChanged }: { adId: string; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<AdDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Arbitrage
  const [value, setValue] = useState<string>('');
  const [motif, setMotif] = useState('');
  const [enonce, setEnonce] = useState('');
  const [scope, setScope] = useState('ad');
  const [confiance, setConfiance] = useState(3);

  // Itération
  const [ouvrirIteration, setOuvrirIteration] = useState(false);
  const [mode, setMode] = useState<'more' | 'better' | 'new'>('better');
  const [variable, setVariable] = useState('hook');
  const [valeurVariable, setValeurVariable] = useState('');
  const [hypothese, setHypothese] = useState('');

  const charger = useCallback(async () => {
    const r = await adDetailAction(adId);
    if (r.error) { setError(r.error); return; }
    setError('');
    setD(r.detail!);
    setValue(r.detail!.validated ?? r.detail!.computed ?? '');
  }, [adId]);

  useEffect(() => { void charger(); }, [charger]);

  // Échap ferme · un panneau plein écran sans sortie au clavier est une impasse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function valider() {
    if (busy || !d) return;
    setBusy(true); setError('');
    const r = await validateVerdictAction({
      adId, value: value as VerdictValue,
      overrideReason: motif,
      learning: { statement: enonce, scope: scope as ValidateInput['learning']['scope'], confidence: confiance },
    });
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    setEnonce(''); setMotif('');
    await charger();
    onChanged();
  }

  async function iterer() {
    if (busy || !d) return;
    setBusy(true); setError('');
    const r = await createIterationAction({
      parentAdId: adId, mode,
      changedVariable: variable as TestedVariable,
      variableValue: valeurVariable, hypothesis: hypothese,
      stageTargeted: d.failedStage,
    });
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    setOuvrirIteration(false); setValeurVariable(''); setHypothese('');
    await charger();
    onChanged();
  }

  const arbitre = d?.verdictStatus === 'validated';
  const ecart = !!d?.computed && value !== d.computed;
  const gagnante = d && ['winner', 'baby_winner', 'relative_winner'].includes(d.validated ?? d.computed ?? '');

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 60 }} />
      <aside style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(560px, 100vw)', zIndex: 70,
        background: 'var(--surface)', borderLeft: '1px solid var(--line)', overflowY: 'auto',
        boxShadow: '-20px 0 50px -20px rgba(0,0,0,.6)', padding: '22px 26px 60px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.3 }}>
              {d?.concept ?? 'Chargement…'}
            </h2>
            {d && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                {d.variantCode} · {d.batchNumber !== null ? `lot ${d.batchNumber}` : 'hors lot'}
                {d.angle && ` · ${d.angle}`}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" style={{
            width: 28, height: 28, borderRadius: 8, border: '1px solid var(--line-2)',
            background: 'var(--paper)', color: 'var(--ink-2)', cursor: 'pointer', flexShrink: 0,
          }}>✕</button>
        </div>

        {error && (
          <p style={{ marginTop: 14, padding: '10px 13px', borderRadius: 10, background: 'rgba(254,44,85,.09)', border: '1px solid rgba(254,44,85,.3)', color: '#ff8095', fontSize: 12.5, lineHeight: 1.5 }}>
            {error}
          </p>
        )}

        {d && (
          <>
            {/* 1 · Ce que le chiffre dit */}
            <Section titre="Ce que le test a donné">
              {d.computed ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 14, color: 'var(--ink)' }}>{VERDICT_LABEL[d.computed] ?? d.computed}</strong>
                    {!d.comparable && (
                      <span title="Protocole non respecté : la conclusion ne vaut qu’au sein du lot" style={pastille('#ffcf8f', 'rgba(245,166,35,.3)')}>
                        comparaison relative
                      </span>
                    )}
                    {d.failedStage && <span style={pastille('var(--ink-2)', 'var(--line-2)')}>bloque sur {STAGE_LABEL[d.failedStage] ?? d.failedStage}</span>}
                  </div>
                  {d.reason && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>{d.reason}</p>}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8, marginTop: 12 }}>
                    <Chiffre l="Dépense" v={eur(d.metrics.spend)} />
                    <Chiffre l="Achats" v={d.metrics.purchases === null ? '—' : String(d.metrics.purchases)} />
                    <Chiffre l="CPA" v={eur(d.metrics.cpa)} sub={d.metrics.cpaHi !== null && Number.isFinite(d.metrics.cpaHi) ? `jusqu’à ${eur(d.metrics.cpaHi)}` : undefined} />
                    <Chiffre l="Accroche" v={pct(d.metrics.hookRate)} />
                    <Chiffre l="Rétention" v={pct(d.metrics.holdRate)} />
                    <Chiffre l="Clic" v={pct(d.metrics.ctr)} />
                  </div>
                  {d.protocolSummary && (
                    <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>{d.protocolSummary}</p>
                  )}
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55 }}>
                  Aucun verdict calculé. Lance « Mesurer maintenant » sur la carte · sans chiffre, il n’y a rien à arbitrer.
                </p>
              )}
              {d.hypothesis && (
                <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                  <span style={{ color: 'var(--muted)' }}>Hypothèse · </span>{d.hypothesis}
                </p>
              )}
            </Section>

            {/* 2 · L'arbitrage */}
            <Section titre={arbitre ? 'Arbitrage' : 'Arbitrer ce test'}>
              {arbitre ? (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                  Verdict retenu : <strong style={{ color: 'var(--ink)' }}>{VERDICT_LABEL[d.validated!] ?? d.validated}</strong>.
                  {d.validated !== d.computed && ' Différent du calcul · le motif est consigné.'}
                </p>
              ) : d.computed ? (
                <>
                  <Label>Verdict retenu</Label>
                  <select value={value} onChange={(e) => setValue(e.target.value)} style={champ}>
                    {Object.entries(VERDICT_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>{l}{v === d.computed ? ' · calculé' : ''}</option>
                    ))}
                  </select>

                  {ecart && (
                    <>
                      <Label>Ce que tu as vu et que le chiffre ignore</Label>
                      <textarea value={motif} onChange={(e) => setMotif(e.target.value)} rows={2}
                        placeholder="Ex : la vidéo a été coupée par la modération au bout de deux jours."
                        style={{ ...champ, resize: 'vertical' }} />
                    </>
                  )}

                  <Label>Ce que ce test t’apprend</Label>
                  <textarea value={enonce} onChange={(e) => setEnonce(e.target.value)} rows={3}
                    placeholder="Ex : sur cet avatar, une accroche chiffrée tient l’attention là où une question la perd."
                    style={{ ...champ, resize: 'vertical' }} />
                  <p style={{ margin: '5px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                    C’est cette phrase que Jarvis relira avant d’écrire la prochaine créa · pas le verdict.
                  </p>

                  <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 180px' }}>
                      <Label>Ça vaut pour</Label>
                      <select value={scope} onChange={(e) => setScope(e.target.value)} style={champ}>
                        {Object.entries(SCOPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: '1 1 140px' }}>
                      <Label>Confiance · {confiance}/5</Label>
                      <input type="range" min={1} max={5} value={confiance} onChange={(e) => setConfiance(Number(e.target.value))}
                        style={{ width: '100%', accentColor: 'var(--accent-strong)' }} />
                    </div>
                  </div>

                  <button type="button" onClick={valider} disabled={busy} style={{ ...bouton, marginTop: 14, opacity: busy ? 0.6 : 1 }}>
                    {busy ? 'Enregistrement…' : 'Valider le verdict'}
                  </button>
                </>
              ) : null}

              {d.learnings.length > 0 && (
                <ul style={{ margin: '14px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {d.learnings.map((l) => (
                    <li key={l.id} style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5, paddingLeft: 12, borderLeft: '2px solid var(--line-2)' }}>
                      {l.statement}
                      <span style={{ color: 'var(--muted)' }}> · {SCOPE_LABEL[l.scope] ?? l.scope} · confiance {l.confidence}/5</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* 3 · La suite */}
            <Section titre="La suite">
              {d.parent && (
                <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                  Vient de {d.parent.variantCode} · {VARIABLE_LABEL[d.parent.changedVariable] ?? d.parent.changedVariable} modifié.
                </p>
              )}
              {d.children.length > 0 && (
                <ul style={{ margin: '0 0 10px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {d.children.map((c) => (
                    <li key={c.adId} style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                      → {c.variantCode} · {VARIABLE_LABEL[c.changedVariable] ?? c.changedVariable}
                      {c.verdict && <span style={{ color: 'var(--muted)' }}> · {VERDICT_LABEL[c.verdict] ?? c.verdict}</span>}
                    </li>
                  ))}
                </ul>
              )}

              {!gagnante ? (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55 }}>
                  On n’itère que sur une gagnante · repartir d’une perdante reproduit ce qui n’a pas marché, en plus cher.
                  Reprends l’angle dans le Studio pour ouvrir une piste neuve.
                </p>
              ) : !ouvrirIteration ? (
                <button type="button" onClick={() => setOuvrirIteration(true)} style={boutonSecondaire}>
                  Créer l’itération
                </button>
              ) : (
                <>
                  <Label>Mode</Label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(['more', 'better', 'new'] as const).map((m) => (
                      <button key={m} type="button" onClick={() => setMode(m)} title={MODE_LABEL[m]!.aide} style={{
                        padding: '6px 13px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        border: '1px solid ' + (mode === m ? 'transparent' : 'var(--line-2)'),
                        background: mode === m ? 'var(--grad-accent)' : 'var(--paper)',
                        color: mode === m ? '#0d070c' : 'var(--ink-2)',
                      }}>{MODE_LABEL[m]!.titre}</button>
                    ))}
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{MODE_LABEL[mode]!.aide}</p>

                  <Label>Variable changée · une seule</Label>
                  <select value={variable} onChange={(e) => setVariable(e.target.value)} style={champ}>
                    {Object.entries(VARIABLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>

                  <Label>Nouvelle valeur</Label>
                  <input value={valeurVariable} onChange={(e) => setValeurVariable(e.target.value)}
                    placeholder="Ex : accroche chiffrée « 3 erreurs qui… »" style={champ} />

                  <Label>Hypothèse</Label>
                  <textarea value={hypothese} onChange={(e) => setHypothese(e.target.value)} rows={2}
                    placeholder="Ex : une accroche chiffrée fera passer le hook rate de 24 % à 30 %."
                    style={{ ...champ, resize: 'vertical' }} />

                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button type="button" onClick={iterer} disabled={busy} style={{ ...bouton, opacity: busy ? 0.6 : 1 }}>
                      {busy ? 'Création…' : 'Créer'}
                    </button>
                    <button type="button" onClick={() => setOuvrirIteration(false)} style={boutonSecondaire}>Annuler</button>
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                    L’itération naît en brouillon, avec l’offre et la page héritées · il ne restera que ce qui change à produire.
                  </p>
                </>
              )}
            </Section>
          </>
        )}
      </aside>
    </>
  );
}

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>{titre}</h3>
      {children}
    </section>
  );
}

function Chiffre({ l, v, sub }: { l: string; v: string; sub?: string }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px', background: 'var(--paper)' }}>
      <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontWeight: 700 }}>{l}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', marginTop: 2 }}>{v}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)', margin: '12px 0 5px' }}>{children}</div>;
}

const champ: CSSProperties = {
  width: '100%', padding: '8px 11px', borderRadius: 9, border: '1px solid var(--line-2)',
  background: 'var(--paper)', color: 'var(--ink)', fontSize: 12.5, outline: 'none', fontFamily: 'inherit',
};

const bouton: CSSProperties = {
  padding: '9px 18px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)',
  color: '#0d070c', fontWeight: 800, fontSize: 12.5, cursor: 'pointer',
};

const boutonSecondaire: CSSProperties = {
  padding: '9px 18px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent',
  color: 'var(--ink)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
};

const pastille = (fg: string, bd: string): CSSProperties => ({
  padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 700,
  color: fg, border: `1px solid ${bd}`,
});
