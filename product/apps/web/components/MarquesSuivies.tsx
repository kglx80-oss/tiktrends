'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { Icon } from './Icon';
import { bibliothequePub, siteMarque, consigneAngleMarche, formatDominant, briefConcurrentBloque, cibleSelonPointeur, echecRetraitSuivi, lienNouveauProjet, type BriefConcurrent } from '@tiktrends/core';
import { useIsMobile } from './useIsMobile';
import { BrandRemoveButton } from './InspoButtons';
import { briefMarqueAction } from '../app/actions/brief-marque';
import { useRetraitsOnglet } from './SavedTabs';
import { focusApresRetrait } from './focusApresRetrait';
import { demanderFocusApresVidage } from './focusVidage';

interface MarqueLite { id: string; platform: string; name: string; logoUrl?: string | null; domain?: string | null }

/**
 * Les marques suivies · chaque puce ouvre un brief À LA DEMANDE (sans IA).
 * On lit la forme du compte concurrent · combien de pubs tiennent, la part de
 * vidéo, les angles dominants, les CTA, les sites. Rien de payant · seule la
 * recherche est appelée quand on clique « analyser ».
 */
export function MarquesSuivies({ brands, vide }: { brands: MarqueLite[]; vide?: ReactNode }) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  // Lot 16 · un concurrent retiré quitte la liste TOUT DE SUITE (puce, compteur
  // de l'onglet, état vide) · avant, seul le ✕ disparaissait et le reste
  // attendait un `router.refresh()` qui calait 4 fois sur 12 (mesuré).
  const [retirees, setRetirees] = useState<ReadonlySet<string>>(new Set());
  const [echecRetrait, setEchecRetrait] = useState<string | null>(null);
  const grilleRef = useRef<HTMLDivElement>(null);
  const signalerRetraits = useRetraitsOnglet();
  const visibles = brands.filter((b) => !retirees.has(b.id));
  const retiresEncoreServis = brands.length - visibles.length;
  useEffect(() => { signalerRetraits('marques', retiresEncoreServis); }, [signalerRetraits, retiresEncoreServis]);
  // Le ✕ cliqué part avec sa puce · APRÈS le rendu qui l'a retirée, le focus
  // passe à la puce qui prend sa place, sinon à l'onglet (aide des galeries,
  // lot 13). Décidé pendant le clic, il visait encore la puce retirée.
  const rangFocus = useRef<number | null>(null);
  useEffect(() => {
    if (rangFocus.current === null) return;
    const rang = rangFocus.current; rangFocus.current = null;
    focusApresRetrait(grilleRef.current, rang, document.getElementById('onglet-marques'));
  }, [visibles.length]);
  const surRetrait = (b: MarqueLite, rang: number) => (etat: 'retire' | 'annule') => {
    if (etat === 'retire') {
      setEchecRetrait(null);
      setRetirees((s) => new Set(s).add(b.id));
      if (ouvert === b.id) setOuvert(null);
      rangFocus.current = rang;
      // Le dernier visible part · si toute la bibliothèque est vide, le rendu
      // serveur remplacera les onglets (N05) · l'état vide reprendra le focus.
      if (visibles.length === 1) demanderFocusApresVidage();
    } else {
      setRetirees((s) => { const n = new Set(s); n.delete(b.id); return n; });
      setEchecRetrait(echecRetraitSuivi(b.name));
    }
  };
  const [brief, setBrief] = useState<BriefConcurrent | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, start] = useTransition();
  // Verrou SYNCHRONE · `enCours` (isPending) ne bascule qu'au prochain rendu, donc
  // plusieurs appels dispatché·s dans la même tâche le liraient encore à false et
  // lanceraient plusieurs briefs. Le ref, lui, est posé tout de suite · une seule
  // analyse part, quoi qu'il arrive. Le garde `briefConcurrentBloque` (partagé avec
  // le `disabled`) reste pour l'état visuel.
  const verrou = useRef(false);
  // 44 px au doigt, densité gardée à la souris · « analyser » et « voir »
  // mesuraient 17 px (recette #106, point 6).
  const tactile = useIsMobile('(pointer: coarse), (max-width: 768px)');
  const action = { display: 'inline-flex', alignItems: 'center', minHeight: cibleSelonPointeur(tactile), padding: '0 6px' } as const;

  function analyser(b: MarqueLite) {
    if (ouvert === b.id) { setOuvert(null); return; }
    // Une analyse est déjà en cours sur une AUTRE marque · ne pas en lancer une
    // seconde (double-clic, ou clic rapide d'une autre puce). On attend qu'elle
    // finisse · fermer la puce ouverte reste possible (branche ci-dessus).
    if (verrou.current || briefConcurrentBloque({ enCours, ouvert, cible: b.id })) return;
    verrou.current = true;
    setOuvert(b.id); setBrief(null); setErreur(null);
    start(async () => {
      try {
        const r = await briefMarqueAction({ platform: b.platform, name: b.name });
        if (r.error) setErreur(r.error); else setBrief(r.brief ?? null);
      } finally {
        verrou.current = false;
      }
    });
  }

  const active = visibles.find((b) => b.id === ouvert) || null;

  if (visibles.length === 0 && vide) return <>{vide}</>;

  return (
    <div style={{ marginBottom: 30 }}>
      {echecRetrait && <p role="alert" style={{ margin: '0 0 10px', fontSize: 13, color: '#ff9db0' }}>{echecRetrait}</p>}
      <div ref={grilleRef} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {visibles.map((b, rang) => {
          const biblio = bibliothequePub({ platform: b.platform, name: b.name });
          const site = siteMarque({ landingDomain: b.domain });
          return (
            // Un nom long (mesuré · 6 lignes à 390, le ✕ voisin coupé au bord)
            // tient sur 2 lignes au plus, nom complet au survol, et les actions
            // passent à la ligne au lieu de sortir de l'écran.
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 8px', maxWidth: '100%', minWidth: 0, border: '1px solid var(--line)', borderRadius: 22, padding: '6px 8px 6px 6px', background: ouvert === b.id ? 'var(--accent-soft)' : 'var(--surface)' }}>
              {b.logoUrl

                ? <img src={b.logoUrl} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
                : <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--paper)' }} />}
              <span title={b.name} style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', minWidth: 0, maxWidth: 260, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }}>{b.name}</span>
              <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--muted)' }}>{b.platform}</span>
              {(() => {
                const bloque = briefConcurrentBloque({ enCours, ouvert, cible: b.id });
                return (
                  <button type="button" onClick={() => analyser(b)} disabled={bloque} aria-expanded={ouvert === b.id} style={{ ...action, fontSize: 11, fontWeight: 700, color: ouvert === b.id ? 'var(--accent-strong)' : 'var(--ink-2)', background: 'none', border: 'none', cursor: bloque ? 'default' : 'pointer', opacity: bloque ? .5 : 1 }}>
                    {ouvert === b.id ? (enCours ? 'analyse…' : '× fermer') : 'analyser'}
                  </button>
                );
              })()}
              <a href={`/veille?q=${encodeURIComponent(b.name)}&searchIn=brand&p=${b.platform}`} style={{ ...action, fontSize: 11, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none' }}>voir</a>
              {biblio && <a href={biblio.url} target="_blank" rel="noreferrer" style={{ ...action, fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', textDecoration: 'none', whiteSpace: 'nowrap' }}>bibliothèque ↗</a>}
              {site && <a href={site} target="_blank" rel="noreferrer" style={{ ...action, fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', textDecoration: 'none', whiteSpace: 'nowrap' }}>site ↗</a>}
              <BrandRemoveButton platform={b.platform} name={b.name} onRetrait={surRetrait(b, rang)} />
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
                const consigne = consigneAngleMarche({ angleLabel: brief.angles[0]?.label, marque: active.name, partVideo: brief.partVideo });
                const fmt = formatDominant(brief.partVideo);
                return consigne && brief.angles[0] ? (
                  <a href={lienNouveauProjet({ type: fmt === 'video' ? 'video' : 'ads', angle: consigne })} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
                    padding: '9px 16px', borderRadius: 10, border: 'none', background: 'var(--grad-accent)',
                    color: 'var(--on-accent)', fontWeight: 800, fontSize: 12.5, textDecoration: 'none',
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="sparkles" size={13} /> Préparer une créa</span> · {brief.angles[0].label}{fmt ? ` · en ${fmt}` : ''}
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
