'use client';

import { useState, type ReactNode } from 'react';
import {
  ETAPES_IMAGE, ETAPE_IMAGE_TITRE, ETAPE_IMAGE_ROLE,
  manqueImage, etapeImageComplete, etapeImageSuivante, etapeImagePrecedente,
  premiereImageIncomplete, peutGenererImage, recapitulatifImage,
  type EtapeImage, type EtatAssistantImage,
} from '@tiktrends/core';
import { Icon } from '../../../../components/Icon';
import { GrilleMoteurs } from '../../../../components/GrilleMoteurs';

/**
 * Le studio Image, guidé · une décision à la fois.
 *
 * Même parti pris que l'assistant de Pubs IA · la barre à plat empile produit,
 * photo, description, direction, format, nombre, moteur · on les prend un par
 * un, dans l'ordre qui contraint le reste (moteur d'étapes pur `assistant-image`).
 *
 * Il ne DÉCIDE rien lui-même · l'ordre, ce qui complète une étape et ce qui
 * manque viennent du noyau. Ici on rend, et on refuse d'avancer avec une raison
 * écrite, jamais un bouton grisé muet. Les vrais champs (photo, description…)
 * pilotent l'état du studio par rappels · le composant reste rendable et testé.
 */

interface Props {
  ouvert: boolean;
  onFermer: () => void;
  etat: EtatAssistantImage;
  produits: { id: string; name: string; hasImage: boolean }[];
  productId: string;
  aiReady: boolean;
  suggesting?: boolean;
  onMode: (m: 'i2i' | 't2i') => void;
  onProduit: (id: string) => void;
  slotPhoto: ReactNode;
  onDescription: (v: string) => void;
  onSuggest?: () => void;
  onDirection: (k: string) => void;
  onRatio: (r: string) => void;
  onNombre: (n: number) => void;
  onMoteur: (m: string) => void;
  ratios: string[];
  moteurs: { key: string; label: string; recommended?: boolean }[];
  directions: { key: string; label: string; hint: string }[];
  coutParVisuel: number;
  duree: string;
  busy: boolean;
  onGenerer: () => void;
}

const fond: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 };
const boite: React.CSSProperties = { width: 'min(680px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 30px 90px -30px rgba(0,0,0,.7)' };
const champ: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--bg, #0d070c)', color: 'var(--ink)', fontSize: 13.5, outline: 'none', fontFamily: 'inherit' };
const Label = ({ children }: { children: ReactNode }) => <label style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 6, fontWeight: 700 }}>{children}</label>;

export function AssistantImage(p: Props) {
  const [etape, setEtape] = useState<EtapeImage>('produit');
  if (!p.ouvert) return null;

  const bloquant = manqueImage(etape, p.etat);
  const suivante = etapeImageSuivante(etape);
  const precedente = etapeImagePrecedente(etape);
  const derniere = suivante === null;
  const libDirection = p.directions.find((d) => d.key === p.etat.direction)?.label;
  const libMoteur = p.moteurs.find((m) => m.key === p.etat.moteur)?.label;
  const total = p.coutParVisuel * Math.max(1, p.etat.nombre);
  const restant = derniere ? premiereImageIncomplete(p.etat) : null;
  const pret = derniere ? peutGenererImage(p.etat) && !p.busy : !bloquant;

  return (
    <div style={fond} onClick={p.onFermer}>
      <div style={boite} onClick={(e) => e.stopPropagation()}>
        {/* Le fil · une étape faite se rouvre, une étape dont les précédentes ne
            le sont pas reste fermée (règle du noyau). */}
        <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {ETAPES_IMAGE.map((e, i) => {
              const fait = etapeImageComplete(e, p.etat);
              const ici = e === etape;
              const ouvrable = ETAPES_IMAGE.slice(0, i).every((q) => etapeImageComplete(q, p.etat));
              return (
                <button key={e} type="button" disabled={!ouvrable} onClick={() => ouvrable && setEtape(e)}
                  title={ouvrable ? ETAPE_IMAGE_TITRE[e] : 'Termine les étapes précédentes.'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999,
                    fontSize: 11.5, fontWeight: ici ? 800 : 600, cursor: ouvrable ? 'pointer' : 'default',
                    border: `1px solid ${ici ? 'transparent' : 'var(--line-2)'}`,
                    background: ici ? 'var(--grad-accent)' : 'transparent',
                    color: ici ? 'var(--on-accent)' : ouvrable ? 'var(--ink-2)' : 'var(--muted)', opacity: ouvrable ? 1 : 0.5,
                  }}>
                  <span style={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>{fait && !ici ? <Icon name="check" size={13} /> : i + 1}</span>{ETAPE_IMAGE_TITRE[e]}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={p.onFermer} aria-label="Fermer" style={{ border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{ETAPE_IMAGE_TITRE[etape]}</h3>
          <p style={{ margin: '4px 0 16px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>{ETAPE_IMAGE_ROLE[etape]}</p>

          {etape === 'produit' && (
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {([['i2i', 'Mise en scène produit'], ['t2i', 'Texte → Image']] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => p.onMode(k)} style={{
                    fontSize: 12.5, fontWeight: p.etat.mode === k ? 800 : 600, padding: '8px 13px', borderRadius: 12, cursor: 'pointer',
                    border: `1px solid ${p.etat.mode === k ? 'transparent' : 'var(--line-2)'}`,
                    background: p.etat.mode === k ? 'var(--grad-accent)' : 'transparent', color: p.etat.mode === k ? 'var(--on-accent)' : 'var(--ink-2)',
                  }}>{label}</button>
                ))}
              </div>
              {p.produits.length > 0 && (
                <div>
                  <Label>Produit de la marque</Label>
                  <select value={p.productId} onChange={(e) => p.onProduit(e.target.value)} style={champ}>
                    <option value="">Aucun (générique)</option>
                    {p.produits.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}{pr.hasImage ? ' · photo' : ''}</option>)}
                  </select>
                </div>
              )}
              {p.etat.mode === 'i2i' && <div>{p.slotPhoto}</div>}
            </div>
          )}

          {etape === 'scene' && (
            <div style={{ display: 'grid', gap: 10 }}>
              <Label>Décris la scène</Label>
              <textarea value={p.etat.description} onChange={(e) => p.onDescription(e.target.value)} rows={4}
                placeholder="ex : posé sur une table en marbre, lumière douce du matin, feuillage flou en arrière-plan"
                style={{ ...champ, resize: 'vertical' }} />
              {p.onSuggest && (
                <button type="button" onClick={p.onSuggest} disabled={!p.aiReady || p.suggesting} style={{
                  justifySelf: 'start', fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 999,
                  border: '1px solid var(--line-2)', background: 'transparent', color: p.aiReady ? 'var(--accent-strong)' : 'var(--muted)',
                  cursor: p.aiReady && !p.suggesting ? 'pointer' : 'default',
                }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><Icon name="sparkles" size={14} /> {p.suggesting ? 'Rédaction…' : 'Proposer une description'}</span></button>
              )}
            </div>
          )}

          {etape === 'style' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
              {[{ key: '', label: 'Variées', hint: 'Le moteur choisit · pas de direction imposée.' }, ...p.directions].map((d) => {
                const on = p.etat.direction === d.key;
                return (
                  <button key={d.key || 'variees'} type="button" onClick={() => p.onDirection(d.key)} style={{
                    display: 'grid', gap: 3, padding: '10px 12px', borderRadius: 12, textAlign: 'left',
                    border: `1px solid ${on ? 'var(--accent-strong)' : 'var(--line-2)'}`, background: on ? 'rgba(254,44,85,.06)' : 'transparent', cursor: 'pointer',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{d.label}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.4 }}>{d.hint}</span>
                  </button>
                );
              })}
            </div>
          )}

          {etape === 'volume' && (
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <Label>Format</Label>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {p.ratios.map((r) => (
                    <button key={r} type="button" onClick={() => p.onRatio(r)} style={pastille(p.etat.ratio === r)}>{r}</button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Nombre de visuels</Label>
                <div style={{ display: 'flex', gap: 7 }}>
                  {[1, 2, 3, 4].map((n) => (
                    <button key={n} type="button" onClick={() => p.onNombre(n)} style={pastille(p.etat.nombre === n)}>{n}</button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Moteur d’image</Label>
                {/* Grille de cartes · même présentation des modèles que le studio
                    Pubs IA, chaque moteur avec l'exemple qui incarne sa force. */}
                <GrilleMoteurs moteurs={p.moteurs} valeur={p.etat.moteur} onChoisir={p.onMoteur} />
              </div>
              {/* Le récapitulatif · relu avant de payer. */}
              <div style={{ display: 'grid', gap: 5, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--paper)' }}>
                {recapitulatifImage(p.etat, { direction: libDirection, moteur: libMoteur }).map((l) => (
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
            {derniere && <span style={{ fontSize: 12, color: 'var(--muted)' }}><b style={{ color: 'var(--ink-2)' }}>{total} crédits</b> · {p.duree}</span>}
            <button type="button" onClick={derniere ? p.onGenerer : () => suivante && setEtape(suivante)} disabled={!pret} style={{
              padding: '11px 22px', borderRadius: 12, border: 'none', fontWeight: 800, fontSize: 14,
              background: pret ? 'var(--grad-accent)' : 'var(--line-2)', color: pret ? 'var(--on-accent)' : 'var(--muted)', cursor: pret ? 'pointer' : 'default',
            }}>{p.busy ? 'Génération…' : derniere ? `Générer ${p.etat.nombre} visuel${p.etat.nombre > 1 ? 's' : ''}` : 'Suivant →'}</button>
          </div>
          {(bloquant || (restant && restant !== etape)) && !p.busy && (
            <p style={{ margin: 0, fontSize: 11.5, color: '#ffb3c0', textAlign: 'right' }}>
              {bloquant || `Étape « ${ETAPE_IMAGE_TITRE[restant!]} » incomplète · ${manqueImage(restant!, p.etat)}`}
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
