'use client';

import { useState, useTransition } from 'react';
import { bibliothequePub, siteMarque, consigneAngleMarche, type BriefConcurrent } from '@tiktrends/core';
import { BrandRemoveButton } from './InspoButtons';
import { briefMarqueAction } from '../app/actions/brief-marque';

interface MarqueLite { id: string; platform: string; name: string; logoUrl?: string | null; domain?: string | null }

/**
 * Les marques suivies · chaque puce ouvre un brief À LA DEMANDE (sans IA).
 * On lit la forme du compte concurrent · combien de pubs tiennent, la part de
 * vidéo, les angles dominants, les CTA, les sites. Rien de payant · seule la
 * recherche est appelée quand on clique « analyser ».
 */
export function MarquesSuivies({ brands }: { brands: MarqueLite[] }) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [brief, setBrief] = useState<BriefConcurrent | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, start] = useTransition();

  function analyser(b: MarqueLite) {
    if (ouvert === b.id) { setOuvert(null); return; }
    setOuvert(b.id); setBrief(null); setErreur(null);
    start(async () => {
      const r = await briefMarqueAction({ platform: b.platform, name: b.name });
      if (r.error) setErreur(r.error); else setBrief(r.brief ?? null);
    });
  }

  const active = brands.find((b) => b.id === ouvert) || null;

  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {brands.map((b) => {
          const biblio = bibliothequePub({ platform: b.platform, name: b.name });
          const site = siteMarque({ landingDomain: b.domain });
          return (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--line)', borderRadius: 999, padding: '6px 8px 6px 6px', background: ouvert === b.id ? 'var(--accent-soft)' : 'var(--surface)' }}>
              {b.logoUrl

                ? <img src={b.logoUrl} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
                : <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--paper)' }} />}
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{b.name}</span>
              <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--muted)' }}>{b.platform}</span>
              <button type="button" onClick={() => analyser(b)} style={{ fontSize: 11, fontWeight: 700, color: ouvert === b.id ? 'var(--accent-strong)' : 'var(--ink-2)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {ouvert === b.id ? '× fermer' : 'analyser'}
              </button>
              <a href={`/veille?q=${encodeURIComponent(b.name)}&searchIn=brand&p=${b.platform}`} style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none' }}>voir</a>
              {biblio && <a href={biblio.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', textDecoration: 'none' }}>bibliothèque ↗</a>}
              {site && <a href={site} target="_blank" rel="noreferrer" style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', textDecoration: 'none' }}>site ↗</a>}
              <BrandRemoveButton platform={b.platform} name={b.name} />
            </div>
          );
        })}
      </div>

      {active && (
        <div style={{ marginTop: 14, border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Brief · {active.name}</h3>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>lecture immédiate · sans IA</span>
          </div>

          {enCours && <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Analyse en cours…</p>}
          {erreur && <p style={{ fontSize: 13, color: '#ff9db0', margin: 0 }}>{erreur}</p>}

          {brief && !enCours && (
            <div style={{ display: 'grid', gap: 16 }}>
              {/* Chiffres de forme */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                <Chiffre v={String(brief.total)} label="Pubs lues" />
                <Chiffre v={`${brief.gagnants}/${brief.total}`} label="Éprouvées" accent />
                <Chiffre v={Math.round(brief.partVideo * 100) + ' %'} label="Vidéo" />
                <Chiffre v={brief.ancienneteMediane + ' j'} label="Ancienneté médiane" />
                <Chiffre v={brief.doyenneJours + ' j'} label="La doyenne" />
              </div>

              {/* Angles dominants */}
              {brief.angles.length > 0 && (
                <div>
                  <div style={titre}>Angles dominants</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {brief.angles.map((a) => (
                      <div key={a.angle} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, color: 'var(--ink)', width: 150, flexShrink: 0 }}>{a.label}</span>
                        <div style={{ flex: 1, height: 8, background: 'var(--paper)', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ width: Math.round(a.part * 100) + '%', height: '100%', background: 'var(--grad-accent)' }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--muted)', width: 54, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{a.n} · {Math.round(a.part * 100)} %</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Du brief à la créa · on arme le studio avec l'angle DOMINANT de
                  la marque · on reprend l'angle, jamais les mots (la consigne le
                  dit au studio). */}
              {(() => {
                const consigne = consigneAngleMarche({ angleLabel: brief.angles[0]?.label, marque: active.name });
                return consigne && brief.angles[0] ? (
                  <a href={`/studio/ads?angle=${encodeURIComponent(consigne)}`} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
                    padding: '9px 16px', borderRadius: 10, border: 'none', background: 'var(--grad-accent)',
                    color: '#0d070c', fontWeight: 800, fontSize: 12.5, textDecoration: 'none',
                  }}>
                    ✨ Génère une créa dans l'angle dominant · {brief.angles[0].label}
                  </a>
                ) : null;
              })()}

              {/* CTA + domaines */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                {brief.ctas.length > 0 && (
                  <div>
                    <div style={titre}>Appels à l'action</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {brief.ctas.map((c) => <span key={c.cta} style={puce}>{c.cta} <b style={{ color: 'var(--muted)' }}>×{c.n}</b></span>)}
                    </div>
                  </div>
                )}
                {brief.domaines.length > 0 && (
                  <div>
                    <div style={titre}>Sites d'atterrissage</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {brief.domaines.map((d) => (
                        <a key={d} href={'https://' + d} target="_blank" rel="noreferrer" style={{ ...puce, color: 'var(--accent-strong)', textDecoration: 'none' }}>{d} ↗</a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Chiffre({ v, label, accent }: { v: string; label: string; accent?: boolean }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--line)' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent ? 'var(--accent-strong)' : 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

const titre = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 8, fontWeight: 700 } as const;
const puce = { fontSize: 12, padding: '4px 10px', borderRadius: 999, border: '1px solid var(--line-2)', color: 'var(--ink-2)', background: 'var(--surface)' } as const;
