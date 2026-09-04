'use client';

import { useMemo, useState } from 'react';
import {
  ETAPES, ETAPE_ROLE, ETAPE_TITRE, dureeAttendue, etapeComplete, etapePrecedente,
  etapeSuivante, manque, peutGenerer, premiereIncomplete, recapitulatif,
  AD_DIRECTIONS, PRODUCTION_MODES, PRODUCTION_LABEL, PRODUCTION_RESUME, garanties, reserves,
  imageModelByKey, imageTimeoutMs, IMAGE_MODELS,
  type Etape, type EtatAssistant,
} from '@tiktrends/core';
import type { AdTemplate } from '@tiktrends/ai';

/**
 * L'assistant · une décision par écran.
 *
 * ── Pourquoi il existe ───────────────────────────────────────────────────────
 *
 * Le composeur a grossi réglage par réglage jusqu'à onze décisions posées sur
 * une seule barre, toutes visibles en même temps, aucune ordonnée. Le verdict
 * reçu tient en trois mots : « c'est incompréhensible ». Il est juste.
 *
 * ── Ce qu'il ne fait pas ─────────────────────────────────────────────────────
 *
 * Il ne remplace pas le composeur · celui-ci reste, pour qui connaît. Un
 * assistant qui supprime le chemin rapide punit celui qui savait déjà.
 *
 * Il ne décide pas non plus des règles : l'ordre des étapes, ce qui rend une
 * étape complète et ce qui manque viennent tous du noyau, où un test les
 * exerce. Ce fichier ne fait que les montrer.
 */

export interface AssistantProps {
  ouvert: boolean;
  onFermer: () => void;
  etat: EtatAssistant;
  /** Les produits de la marque · pour l'étape 1. */
  produits: Array<{ id: string; name: string; imageUrl?: string | null; imageUrls?: string[] | null }>;
  gabaritsDispo: readonly AdTemplate[];
  /** Le libellé d'un gabarit · l'assistant ne détient pas ce vocabulaire. */
  libelleGabarit: (t: AdTemplate) => string;
  onProduit: (id: string) => void;
  onGabarit: (t: AdTemplate) => void;
  onAngle: (v: string) => void;
  onOffre: (v: string) => void;
  onDirection: (v: string) => void;
  onMode: (v: string) => void;
  onNombre: (n: number) => void;
  onMoteur: (v: string) => void;
  onGenerer: () => void;
  busy: boolean;
}

export function AssistantPub(p: AssistantProps) {
  const [etape, setEtape] = useState<Etape>('produit');
  if (!p.ouvert) return null;

  const bloquant = manque(etape, p.etat);
  const suivante = etapeSuivante(etape);
  const precedente = etapePrecedente(etape);
  const derniere = suivante === null;

  return (
    <div style={fond} onClick={p.onFermer}>
      <div style={boite} onClick={(e) => e.stopPropagation()}>
        <Entete etape={etape} etat={p.etat} onAller={setEtape} onFermer={p.onFermer} />

        <div style={{ padding: '18px 22px', overflowY: 'auto', flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--ink)' }}>{ETAPE_TITRE[etape]}</h3>
          <p style={{ margin: '4px 0 16px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>{ETAPE_ROLE[etape]}</p>

          {etape === 'produit' && <EtapeProduit p={p} />}
          {etape === 'message' && <EtapeMessage p={p} />}
          {etape === 'style' && <EtapeStyle p={p} />}
          {etape === 'fabrication' && <EtapeFabrication p={p} />}
          {etape === 'volume' && <EtapeVolume p={p} />}
        </div>

        <Pied
          p={p} etape={etape} bloquant={bloquant} derniere={derniere}
          onPrecedente={() => precedente && setEtape(precedente)}
          onSuivante={() => suivante && setEtape(suivante)}
          precedente={precedente}
        />
      </div>
    </div>
  );
}

/* ------------------------------- Le fil d'étapes ---------------------------- */

/**
 * Le fil.
 *
 * Une étape déjà faite se rouvre d'un clic · revenir en arrière est le geste le
 * plus fréquent dans un assistant, et l'interdire force à tout recommencer.
 * Une étape dont les précédentes ne sont pas faites, non · c'est la règle
 * demandée, et elle vient du noyau.
 */
function Entete({ etape, etat, onAller, onFermer }: {
  etape: Etape; etat: EtatAssistant; onAller: (e: Etape) => void; onFermer: () => void;
}) {
  return (
    <div style={{ padding: '14px 22px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
        {ETAPES.map((e, i) => {
          const fait = etapeComplete(e, etat);
          const ici = e === etape;
          const ouvrable = ETAPES.slice(0, i).every((q) => etapeComplete(q, etat));
          return (
            <button key={e} type="button" disabled={!ouvrable} onClick={() => ouvrable && onAller(e)}
              title={ouvrable ? ETAPE_TITRE[e] : 'Termine les étapes précédentes.'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999,
                fontSize: 11.5, fontWeight: ici ? 800 : 600, cursor: ouvrable ? 'pointer' : 'default',
                border: `1px solid ${ici ? 'transparent' : 'var(--line-2)'}`,
                background: ici ? 'var(--grad-accent)' : 'transparent',
                color: ici ? '#0d070c' : ouvrable ? 'var(--ink-2)' : 'var(--muted)',
                opacity: ouvrable ? 1 : 0.5,
              }}>
              <span style={{ fontWeight: 800 }}>{fait && !ici ? '✓' : i + 1}</span>
              {ETAPE_TITRE[e]}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={onFermer} aria-label="Fermer" style={{
        border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1,
      }}>×</button>
    </div>
  );
}

/* ---------------------------------- Le pied -------------------------------- */

function Pied({ p, etape, bloquant, derniere, precedente, onPrecedente, onSuivante }: {
  p: AssistantProps; etape: Etape; bloquant: string; derniere: boolean;
  precedente: Etape | null; onPrecedente: () => void; onSuivante: () => void;
}) {
  const spec = imageModelByKey(p.etat.moteur);
  const total = spec.credits * Math.max(1, p.etat.nombre);
  const duree = dureeAttendue(p.etat.nombre, imageTimeoutMs(spec));
  const pret = derniere ? peutGenerer(p.etat) && !p.busy : !bloquant;
  // Sur le dernier écran, ce qui manque peut venir d'une étape antérieure · on
  // le nomme, sinon le refus final est aussi opaque que celui qu'on a corrigé
  // sur le bouton de génération.
  const restant = derniere ? premiereIncomplete(p.etat) : null;

  return (
    <div style={{ padding: '14px 22px', borderTop: '1px solid var(--line)', display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={onPrecedente} disabled={!precedente} style={{
          padding: '10px 16px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'transparent',
          color: precedente ? 'var(--ink-2)' : 'var(--muted)', fontWeight: 700, fontSize: 13,
          cursor: precedente ? 'pointer' : 'default', opacity: precedente ? 1 : 0.4,
        }}>← Retour</button>

        <span style={{ flex: 1 }} />

        {derniere && (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            <b style={{ color: 'var(--ink-2)' }}>{total} crédits</b> · {duree}
          </span>
        )}

        <button type="button" onClick={derniere ? p.onGenerer : onSuivante} disabled={!pret} style={{
          padding: '11px 22px', borderRadius: 12, border: 'none', fontWeight: 800, fontSize: 14,
          background: pret ? 'var(--grad-accent)' : 'var(--line-2)',
          color: pret ? '#0d070c' : 'var(--muted)', cursor: pret ? 'pointer' : 'default',
        }}>
          {p.busy ? 'Génération…' : derniere ? `Générer ${p.etat.nombre} pub${p.etat.nombre > 1 ? 's' : ''}` : 'Suivant →'}
        </button>
      </div>

      {/* Ce qui manque, écrit sous le bouton · jamais un refus muet. */}
      {(bloquant || (restant && restant !== etape)) && !p.busy && (
        <p style={{ margin: 0, fontSize: 11.5, color: '#ffb3c0', textAlign: 'right' }}>
          {bloquant || `Étape « ${ETAPE_TITRE[restant!]} » incomplète · ${manque(restant!, p.etat)}`}
        </p>
      )}
      {p.busy && (
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', textAlign: 'right' }}>
          Les images arrivent par groupes de trois · {duree}. Tu peux fermer cette fenêtre, la génération continue.
        </p>
      )}
    </div>
  );
}

/* -------------------------------- Les étapes ------------------------------- */

function EtapeProduit({ p }: { p: AssistantProps }) {
  if (!p.produits.length) {
    return (
      <Note>
        Cette marque n’a pas encore de produit. On peut générer sans · le modèle composera une scène
        sans packaging. Ajoute un produit et sa photo pour que ton emballage soit reproduit à l’identique.
      </Note>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {p.produits.map((prod) => {
        const on = p.etat.productId === prod.id;
        const photo = prod.imageUrls?.[0] || prod.imageUrl || null;
        return (
          <button key={prod.id} type="button" onClick={() => p.onProduit(prod.id)} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, textAlign: 'left',
            border: `1px solid ${on ? 'var(--accent-strong)' : 'var(--line-2)'}`,
            background: on ? 'rgba(230,0,126,.06)' : 'transparent', cursor: 'pointer',
          }}>
            <div style={{ width: 44, height: 44, borderRadius: 9, background: 'var(--paper)', flexShrink: 0, overflow: 'hidden' }}>
              { }
              {photo && <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{prod.name}</div>
              <div style={{ fontSize: 11.5, color: photo ? '#7ee8bf' : '#ffca6b' }}>
                {photo ? 'Photo présente · ton emballage sera reproduit' : 'Sans photo · le modèle inventera l’emballage'}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function EtapeMessage({ p }: { p: AssistantProps }) {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <Label>Type de pub <Facultatif>· au moins un</Facultatif></Label>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {p.gabaritsDispo.map((t) => {
            const on = p.etat.gabarits.includes(t);
            return (
              <button key={t} type="button" onClick={() => p.onGabarit(t)} style={pastille(on)}>
                {p.libelleGabarit(t)}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <Label>Angle <Facultatif>· facultatif, Jarvis sait écrire sans</Facultatif></Label>
        <textarea value={p.etat.angle} onChange={(e) => p.onAngle(e.target.value)} rows={2}
          placeholder="ex : Focus sans caféine ni crash, pour créateurs en surrégime"
          style={champ} />
      </div>
      <div>
        <Label>Offre <Facultatif>· facultative</Facultatif></Label>
        <input value={p.etat.offre} onChange={(e) => p.onOffre(e.target.value)}
          placeholder="ex : -20 %, code LANCEMENT, 2+1 offert" style={champ} />
      </div>
    </div>
  );
}

function EtapeStyle({ p }: { p: AssistantProps }) {
  const choix = useMemo(() => [{ key: '', label: '✦ Variées', hint: 'Chaque pub du lot prend une direction différente.' }, ...AD_DIRECTIONS], []);
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {choix.map((d) => {
        const on = (p.etat.direction || '') === d.key;
        return (
          <button key={d.key || 'auto'} type="button" onClick={() => p.onDirection(d.key)} style={{
            display: 'grid', gap: 2, padding: '9px 12px', borderRadius: 11, textAlign: 'left',
            border: `1px solid ${on ? 'var(--accent-strong)' : 'var(--line-2)'}`,
            background: on ? 'rgba(230,0,126,.06)' : 'transparent', cursor: 'pointer',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{d.label}</span>
            <span style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.4 }}>{d.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

function EtapeFabrication({ p }: { p: AssistantProps }) {
  return (
    <div style={{ display: 'grid', gap: 9 }}>
      {PRODUCTION_MODES.map((m) => {
        const on = p.etat.mode === m;
        return (
          <button key={m} type="button" onClick={() => p.onMode(m)} style={{
            display: 'grid', gap: 4, padding: '12px 14px', borderRadius: 12, textAlign: 'left',
            border: `1px solid ${on ? 'var(--accent-strong)' : 'var(--line-2)'}`,
            background: on ? 'rgba(230,0,126,.06)' : 'transparent', cursor: 'pointer',
          }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{PRODUCTION_LABEL[m]}</span>
            <span style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.45 }}>{PRODUCTION_RESUME[m]}</span>
            <span style={{ fontSize: 11.5, color: '#7ee8bf', lineHeight: 1.45 }}>Garanti · {garanties(m).join(' · ')}</span>
            <span style={{ fontSize: 11.5, color: '#ffca6b', lineHeight: 1.45 }}>Pas garanti · {reserves(m).join(' · ')}</span>
          </button>
        );
      })}
    </div>
  );
}

function EtapeVolume({ p }: { p: AssistantProps }) {
  const spec = imageModelByKey(p.etat.moteur);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <Label>Combien de visuels</Label>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 6, 8].map((n) => (
            <button key={n} type="button" onClick={() => p.onNombre(n)} style={pastille(p.etat.nombre === n)}>{n}</button>
          ))}
        </div>
      </div>
      <div>
        <Label>Moteur d’image</Label>
        <div style={{ display: 'grid', gap: 7 }}>
          {IMAGE_MODELS.map((m) => {
            const on = p.etat.moteur === m.key;
            return (
              <button key={m.key} type="button" onClick={() => p.onMoteur(m.key)} style={{
                display: 'grid', gap: 2, padding: '9px 12px', borderRadius: 11, textAlign: 'left',
                border: `1px solid ${on ? 'var(--accent-strong)' : 'var(--line-2)'}`,
                background: on ? 'rgba(230,0,126,.06)' : 'transparent', cursor: 'pointer',
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                  {m.label}{m.recommended ? ' · recommandé' : ''}
                  <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{' · '}{m.credits} cr. par pub</span>
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.4 }}>
                  {m.note} · {dureeAttendue(1, imageTimeoutMs(m))} par image
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Le récapitulatif · cinq décisions oubliées ne valent pas mieux qu'onze
          décisions simultanées. On relit avant de payer. */}
      <div style={{ padding: '11px 13px', borderRadius: 11, border: '1px solid var(--line)', background: 'var(--paper)' }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 6 }}>RÉCAPITULATIF</div>
        <div style={{ display: 'grid', gap: 4 }}>
          {recapitulatif(p.etat, {
            produit: p.produits.find((x) => x.id === p.etat.productId)?.name,
            direction: AD_DIRECTIONS.find((d) => d.key === p.etat.direction)?.label,
            mode: PRODUCTION_LABEL[p.etat.mode as 'composee' | 'entiere'],
            moteur: spec.label,
          }).map((l) => (
            <div key={l.etape} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
              <span style={{ width: 150, color: 'var(--muted)', flexShrink: 0 }}>{l.titre}</span>
              <span style={{ color: 'var(--ink-2)' }}>{l.valeur}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Habillage -------------------------------- */

const fond: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(4,2,6,.72)', zIndex: 60,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const boite: React.CSSProperties = {
  width: 'min(680px, 100%)', maxHeight: 'min(88vh, 860px)', display: 'flex', flexDirection: 'column',
  border: '1px solid var(--line-2)', borderRadius: 18, background: 'var(--surface)', overflow: 'hidden',
};
const champ: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 11, border: '1px solid var(--line-2)',
  background: 'var(--bg, #0d070c)', color: 'var(--ink)', fontSize: 13, outline: 'none',
  fontFamily: 'inherit', resize: 'vertical',
};
const pastille = (on: boolean): React.CSSProperties => ({
  padding: '7px 13px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
  fontWeight: on ? 800 : 600,
  border: `1px solid ${on ? 'transparent' : 'var(--line-2)'}`,
  background: on ? 'var(--grad-accent)' : 'transparent', color: on ? '#0d070c' : 'var(--ink-2)',
});

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 7 }}>{children}</div>;
}
function Facultatif({ children }: { children: React.ReactNode }) {
  return <span style={{ fontWeight: 400, color: 'var(--muted)' }}>{children}</span>;
}
function Note({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, padding: '11px 13px', borderRadius: 11, border: '1px solid var(--line)', background: 'var(--paper)', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
      {children}
    </p>
  );
}
