'use client';

import { useState, type ReactNode } from 'react';
import {
  ETAPES_VIDEO, ETAPE_VIDEO_TITRE, ETAPE_VIDEO_ROLE,
  manqueVideo, etapeVideoComplete, etapeVideoSuivante, etapeVideoPrecedente,
  premiereVideoIncomplete, peutGenererVideo, recapitulatifVideo,
  type EtapeVideo, type EtatAssistantVideo,
} from '@tiktrends/core';

/**
 * Le studio Vidéo, guidé · une décision à la fois, sur le moteur `assistant-video`.
 *
 * Même parti pris que l'assistant Image · il ne DÉCIDE rien (l'ordre, ce qui
 * complète et ce qui manque viennent du noyau), il rend et refuse d'avancer avec
 * une raison écrite. Il pilote l'état du studio par rappels · aucune action
 * serveur, donc rendable et testé. La galerie d'images de départ est injectée
 * telle quelle (slot) · un seul endroit pour l'importer et la choisir.
 */

interface Props {
  ouvert: boolean;
  onFermer: () => void;
  etat: EtatAssistantVideo;
  aiReady?: boolean;
  suggesting?: boolean;
  onMode: (m: 'i2v' | 't2v') => void;
  slotDepart: ReactNode;
  onDescription: (v: string) => void;
  onSuggest?: () => void;
  directions?: { key: string; label: string; hint: string }[];
  directionValue?: string;
  onDirection?: (k: string) => void;
  onRatio: (r: string) => void;
  onDuree: (d: number) => void;
  ratios: string[];
  durees: number[];
  coutParVideo: number;
  busy: boolean;
  onGenerer: () => void;
}

const fond: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 };
const boite: React.CSSProperties = { width: 'min(680px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 30px 90px -30px rgba(0,0,0,.7)' };
const champ: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--bg, #0d070c)', color: 'var(--ink)', fontSize: 13.5, outline: 'none', fontFamily: 'inherit' };
const Label = ({ children }: { children: ReactNode }) => <label style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 6, fontWeight: 700 }}>{children}</label>;

export function AssistantVideo(p: Props) {
  const [etape, setEtape] = useState<EtapeVideo>('depart');
  if (!p.ouvert) return null;

  const bloquant = manqueVideo(etape, p.etat);
  const suivante = etapeVideoSuivante(etape);
  const precedente = etapeVideoPrecedente(etape);
  const derniere = suivante === null;
  const restant = derniere ? premiereVideoIncomplete(p.etat) : null;
  const pret = derniere ? peutGenererVideo(p.etat) && !p.busy : !bloquant;

  return (
    <div style={fond} onClick={p.onFermer}>
      <div style={boite} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {ETAPES_VIDEO.map((e, i) => {
              const fait = etapeVideoComplete(e, p.etat);
              const ici = e === etape;
              const ouvrable = ETAPES_VIDEO.slice(0, i).every((q) => etapeVideoComplete(q, p.etat));
              return (
                <button key={e} type="button" disabled={!ouvrable} onClick={() => ouvrable && setEtape(e)}
                  title={ouvrable ? ETAPE_VIDEO_TITRE[e] : 'Termine les étapes précédentes.'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999,
                    fontSize: 11.5, fontWeight: ici ? 800 : 600, cursor: ouvrable ? 'pointer' : 'default',
                    border: `1px solid ${ici ? 'transparent' : 'var(--line-2)'}`,
                    background: ici ? 'var(--grad-accent)' : 'transparent',
                    color: ici ? 'var(--on-accent)' : ouvrable ? 'var(--ink-2)' : 'var(--muted)', opacity: ouvrable ? 1 : 0.5,
                  }}>
                  <span style={{ fontWeight: 800 }}>{fait && !ici ? '✓' : i + 1}</span>{ETAPE_VIDEO_TITRE[e]}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={p.onFermer} aria-label="Fermer" style={{ border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{ETAPE_VIDEO_TITRE[etape]}</h3>
          <p style={{ margin: '4px 0 16px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>{ETAPE_VIDEO_ROLE[etape]}</p>

          {etape === 'depart' && (
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {([['i2v', 'Image → Vidéo'], ['t2v', 'Texte → Vidéo']] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => p.onMode(k)} style={{
                    fontSize: 12.5, fontWeight: p.etat.mode === k ? 800 : 600, padding: '8px 13px', borderRadius: 12, cursor: 'pointer',
                    border: `1px solid ${p.etat.mode === k ? 'transparent' : 'var(--line-2)'}`,
                    background: p.etat.mode === k ? 'var(--grad-accent)' : 'transparent', color: p.etat.mode === k ? 'var(--on-accent)' : 'var(--ink-2)',
                  }}>{label}</button>
                ))}
              </div>
              {p.etat.mode === 'i2v' && <div>{p.slotDepart}</div>}
              {p.etat.mode === 't2v' && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>La vidéo part de ta description seule · aucune image de départ.</p>}
            </div>
          )}

          {etape === 'mouvement' && (
            <div style={{ display: 'grid', gap: 10 }}>
              <Label>{p.etat.mode === 'i2v' ? 'Le mouvement' : 'Décris la vidéo'} {p.etat.mode === 'i2v' && <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· facultatif</span>}</Label>
              <textarea value={p.etat.description} onChange={(e) => p.onDescription(e.target.value)} rows={4}
                placeholder={p.etat.mode === 'i2v' ? 'ex : léger zoom, la vapeur monte, ambiance chaleureuse' : 'ex : gros plan sur une boisson, lumière du matin, léger travelling avant'}
                style={{ ...champ, resize: 'vertical' }} />
              {p.onSuggest && (
                <button type="button" onClick={p.onSuggest} disabled={!p.aiReady || p.suggesting} style={{
                  justifySelf: 'start', fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 999,
                  border: '1px solid var(--line-2)', background: 'transparent', color: p.aiReady ? 'var(--accent-strong)' : 'var(--muted)',
                  cursor: p.aiReady && !p.suggesting ? 'pointer' : 'default',
                }}>✦ {p.suggesting ? 'Rédaction…' : 'Proposer un mouvement'}</button>
              )}
              {p.directions && p.onDirection && (
                <div style={{ marginTop: 4 }}>
                  <Label>Type de mouvement <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· caméra, rythme, énergie</span></Label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
                    {[{ key: '', label: 'Libre', hint: 'Le moteur choisit le mouvement.' }, ...p.directions].map((d) => {
                      const on = (p.directionValue ?? '') === d.key;
                      return (
                        <button key={d.key || 'libre'} type="button" onClick={() => p.onDirection!(d.key)} style={{
                          display: 'grid', gap: 3, padding: '9px 11px', borderRadius: 12, textAlign: 'left',
                          border: `1px solid ${on ? 'var(--accent-strong)' : 'var(--line-2)'}`, background: on ? 'rgba(254,44,85,.06)' : 'transparent', cursor: 'pointer',
                        }}>
                          <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>{d.label}</span>
                          <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.35 }}>{d.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {etape === 'format' && (
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <Label>Format</Label>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {p.ratios.map((r) => (<button key={r} type="button" onClick={() => p.onRatio(r)} style={pastille(p.etat.ratio === r)}>{r}</button>))}
                </div>
              </div>
              <div>
                <Label>Durée <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· elle décide du prix</span></Label>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {p.durees.map((d) => (<button key={d} type="button" onClick={() => p.onDuree(d)} style={pastille(p.etat.duree === d)}>{d} s</button>))}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 5, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--paper)' }}>
                {recapitulatifVideo(p.etat).map((l) => (
                  <div key={l.etape} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
                    <span style={{ color: 'var(--muted)' }}>{l.titre}</span>
                    <span style={{ color: 'var(--ink-2)', fontWeight: 600, textAlign: 'right' }}>{l.valeur}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--line)', display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => precedente && setEtape(precedente)} disabled={!precedente} style={{
              padding: '10px 16px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'transparent',
              color: precedente ? 'var(--ink-2)' : 'var(--muted)', fontWeight: 700, fontSize: 13, cursor: precedente ? 'pointer' : 'default', opacity: precedente ? 1 : 0.4,
            }}>← Retour</button>
            <span style={{ flex: 1 }} />
            {derniere && <span style={{ fontSize: 12, color: 'var(--muted)' }}><b style={{ color: 'var(--ink-2)' }}>{p.coutParVideo} crédits</b> · une à trois minutes</span>}
            <button type="button" onClick={derniere ? p.onGenerer : () => suivante && setEtape(suivante)} disabled={!pret} style={{
              padding: '11px 22px', borderRadius: 12, border: 'none', fontWeight: 800, fontSize: 14,
              background: pret ? 'var(--grad-accent)' : 'var(--line-2)', color: pret ? 'var(--on-accent)' : 'var(--muted)', cursor: pret ? 'pointer' : 'default',
            }}>{p.busy ? 'Génération…' : derniere ? 'Générer la vidéo' : 'Suivant →'}</button>
          </div>
          {(bloquant || (restant && restant !== etape)) && !p.busy && (
            <p style={{ margin: 0, fontSize: 11.5, color: '#ffb3c0', textAlign: 'right' }}>
              {bloquant || `Étape « ${ETAPE_VIDEO_TITRE[restant!]} » incomplète · ${manqueVideo(restant!, p.etat)}`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function pastille(on: boolean): React.CSSProperties {
  return {
    padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${on ? 'transparent' : 'var(--line-2)'}`,
    background: on ? 'var(--grad-accent)' : 'transparent', color: on ? 'var(--on-accent)' : 'var(--ink-2)',
  };
}
