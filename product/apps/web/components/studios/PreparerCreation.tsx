'use client';

import { useRef, useState, type CSSProperties } from 'react';
import {
  reponseApplicable, LIBELLES_MODALITE, LIBELLES_ELEMENT, MODALITES_SOURCE, LIBELLES_TYPE_PROJET, dateCourteUtc, CIBLE_TACTILE_MIN,
  type HypotheseQualifiee, type DemandeEnCours,
} from '@tiktrends/core';
import { preparerCreation, proposerHypotheses, creerProjetDepuisSources } from '../../app/actions/studios/sources';
import type { Preparation } from '../../lib/studios/sources/preparation';
import { Modal } from '../Modal';
import { Icon } from '../Icon';
import { btn, btnGhost, input, lbl, tuile, cadreSignal } from '../ui';

/**
 * « Préparer une création » · le panneau qui part d'une annonce de Veille ou
 * d'une sauvegarde (cahier 01 §4.2).
 *
 * Il montre, AVANT toute écriture : la source et sa date, la marque cible (et
 * comment en changer), les ressources réellement disponibles (et ce qui est
 * absent), les hypothèses proposées ou à rédiger, et les produits de la marque
 * avec leurs faits connus et leurs manques. Puis il crée le projet · une fois,
 * même sur double clic (clé de clic tirée à l'ouverture).
 *
 * ── Marque changée pendant une réponse (FLOW-03) ─────────────────────────────
 *
 * Chaque demande part avec un numéro et la marque du moment ; sa réponse n'est
 * appliquée que si elle est la dernière ET que la marque n'a pas changé ET que
 * le serveur a répondu pour cette marque (`reponseApplicable`, noyau). Changer
 * de marque vide les propositions et le produit choisis ; une hypothèse
 * RÉDIGÉE reste dans le brouillon de sa marque d'origine.
 *
 * Fermer le panneau ne touche ni la recherche, ni les filtres, ni la position
 * dans la Veille : rien n'a navigué.
 */

export interface AnnoncePanneau {
  id: string;
  platform: string;
  mediaType?: string | null;
  thumbnailUrl?: string | null;
  mediaUrl?: string | null;
  advertiserName?: string | null;
  body?: string | null;
  callToAction?: string | null;
  landingDomain?: string | null;
  landingUrl?: string | null;
  daysRunning?: number | null;
}

interface Saisie { statement: string; variable: string; control: string; treatment: string; metric: string; decisionRule: string }
const SAISIE_VIDE: Saisie = { statement: '', variable: '', control: '', treatment: '', metric: '', decisionRule: '' };

type Choix = { type: 'proposee'; id: string } | { type: 'saisie' } | null;
type Erreur = { message: string; traceId?: string } | null;

const champ: CSSProperties = { ...input, fontSize: 16 };
const titreSection: CSSProperties = { margin: '0 0 8px', fontSize: 13, fontWeight: 700, letterSpacing: '.02em', color: 'var(--ink)' };
const bloc: CSSProperties = { display: 'grid', gap: 8, marginBottom: 18 };
const note: CSSProperties = { fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, margin: 0 };

function cle(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  return c && 'randomUUID' in c ? `clic-${c.randomUUID()}` : `clic-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sourceDe(annonce: AnnoncePanneau, sauvegardeId: string | null | undefined, retour: string | null | undefined) {
  return sauvegardeId
    ? { type: 'sauvegarde' as const, id: sauvegardeId, retour: retour ?? null }
    : { type: 'veille' as const, annonce, retour: retour ?? null };
}

export function PreparerCreation({ annonce, sauvegardeId, retour, cibles44 = false }: {
  annonce: AnnoncePanneau;
  /** La sauvegarde d'origine · le serveur relit alors le snapshot en base. */
  sauvegardeId?: string | null;
  /** Contexte de retour vers la Veille (critères + ancre), gardé par le projet. */
  retour?: string | null;
  cibles44?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [prep, setPrep] = useState<Preparation | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<Erreur>(null);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [propositions, setPropositions] = useState<{ brandId: string; hypotheses: HypotheseQualifiee[]; jeton: string } | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [proposant, setProposant] = useState(false);
  const [refusIa, setRefusIa] = useState<Erreur>(null);
  const [choix, setChoix] = useState<Choix>(null);
  const [brouillons, setBrouillons] = useState<Record<string, Saisie>>({});
  const [productId, setProductId] = useState<string | null>(null);
  const [kind, setKind] = useState('ads');
  const [titre, setTitre] = useState('');
  const [cleClic, setCleClic] = useState('');
  const [creation, setCreation] = useState<{ etat: 'repos' | 'encours' | 'ok'; projetId?: string; deja?: boolean }>({ etat: 'repos' });

  const marqueRef = useRef<string | null>(null);
  const seqPrep = useRef(0);
  const seqProp = useRef(0);
  const source = sourceDe(annonce, sauvegardeId, retour);

  async function charger(marque: string | null) {
    const demande: DemandeEnCours = { seq: ++seqPrep.current, brandId: marque ?? '' };
    setChargement(true);
    const r = await preparerCreation({ sources: [source], ...(marque ? { brandId: marque } : {}) });
    // La marque initiale n'est connue qu'à la réponse · on ne compare alors que le numéro.
    const courant = { seq: seqPrep.current, brandId: marqueRef.current ?? '' };
    if (marque ? !reponseApplicable(demande, courant, r.ok ? r.brandId : null) : demande.seq !== seqPrep.current) return;
    setChargement(false);
    if (!r.ok) { setErreur({ message: r.message, traceId: r.traceId }); return; }
    setErreur(null);
    setPrep(r);
    if (!marque) { marqueRef.current = r.brandId; setBrandId(r.brandId); }
  }

  function ouvrir() {
    setOuvert(true);
    setCleClic(cle());
    setCreation({ etat: 'repos' });
    setTitre(`D’après ${annonce.advertiserName?.trim() || 'une annonce observée'}`);
    setKind(annonce.mediaType === 'video' ? 'video' : 'ads');
    if (!prep) void charger(null);
  }

  function changerMarque(b: string) {
    if (b === marqueRef.current) return;
    marqueRef.current = b;
    setBrandId(b);
    // Rien de l'ancienne marque ne survit, sauf le brouillon rédigé, rangé sous SA marque.
    setPropositions(null);
    setQuestions([]);
    setRefusIa(null);
    setProductId(null);
    setChoix((c) => (c?.type === 'proposee' ? null : c));
    setProposant(false);
    seqProp.current++;
    void charger(b);
  }

  async function proposer() {
    if (!brandId) return;
    const demande: DemandeEnCours = { seq: ++seqProp.current, brandId };
    setProposant(true);
    setRefusIa(null);
    const r = await proposerHypotheses({ sources: [source], brandId });
    if (!reponseApplicable(demande, { seq: seqProp.current, brandId: marqueRef.current ?? '' }, r.ok ? r.brandId : demande.brandId)) return;
    setProposant(false);
    if (!r.ok) { setRefusIa({ message: r.message, traceId: r.traceId }); setChoix({ type: 'saisie' }); return; }
    setQuestions('questions' in r ? r.questions : []);
    if (r.jeton) setPropositions({ brandId: r.brandId, hypotheses: r.hypotheses, jeton: r.jeton });
  }

  const saisie = (brandId && brouillons[brandId]) || SAISIE_VIDE;
  const majSaisie = (k: keyof Saisie, v: string) => {
    if (!brandId) return;
    setBrouillons((b) => ({ ...b, [brandId]: { ...((b[brandId]) ?? SAISIE_VIDE), [k]: v } }));
  };

  async function creer() {
    if (!brandId || creation.etat === 'encours') return;
    let hypothese: unknown = null;
    if (choix?.type === 'proposee' && propositions && propositions.brandId === brandId) {
      const h = propositions.hypotheses.find((x) => x.id === choix.id);
      if (h) hypothese = { origine: 'proposee', hypothese: h, jeton: propositions.jeton };
    } else if (choix?.type === 'saisie') {
      hypothese = { origine: 'saisie', saisie };
    }
    setCreation({ etat: 'encours' });
    setErreur(null);
    const r = await creerProjetDepuisSources({ sources: [source], brandId, kind, titre, productId, hypothese, cleClic });
    if (!r.ok) {
      setCreation({ etat: 'repos' });
      const detail = r.violations?.map((v) => `${v.chemin} · ${v.raison}`).join(' ; ');
      setErreur({ message: detail ? `${r.message} (${detail})` : r.message, traceId: r.traceId });
      return;
    }
    setCreation({ etat: 'ok', projetId: r.projet.id, deja: r.deja });
  }

  const s = prep?.sources[0] ?? null;
  const produits = prep && brandId === prep.brandId ? prep.produits : [];
  const saisieOk = saisie.statement.trim().length > 0 && saisie.variable.trim().length > 0;
  const hypotheseOk = choix === null || (choix.type === 'saisie' ? saisieOk : !!propositions);
  const nomMarque = prep?.marques.find((m) => m.id === brandId)?.nom ?? '';

  return (
    <>
      <button type="button" onClick={ouvrir} aria-haspopup="dialog"
        style={{ ...btnGhost, width: '100%', fontSize: 12, borderRadius: 10, minHeight: cibles44 ? CIBLE_TACTILE_MIN : 36, gap: 6 }}>
        <Icon name="file" size={13} /> Préparer une création
      </button>
      <Modal open={ouvert} onClose={() => setOuvert(false)} title="Préparer une création" maxWidth={720}
        subtitle="Une source, une hypothèse, un produit de ta marque · le projet garde tout. Rien n’est généré ici.">
        {chargement && !prep && <p role="status" style={note}>Chargement de la source et de ta marque…</p>}
        {erreur && (
          <div role="alert" style={{ ...cadreSignal('rgba(255,77,109,.4)', 'tuile'), background: 'rgba(255,77,109,.10)', color: '#ff9db0', padding: '10px 12px', fontSize: 13, marginBottom: 14 }}>
            {erreur.message}{erreur.traceId ? <span style={{ display: 'block', fontSize: 11.5, marginTop: 4, color: 'var(--ink-2)' }}>Identifiant support : {erreur.traceId}</span> : null}
          </div>
        )}
        {creation.etat === 'ok' && creation.projetId ? (
          <div role="status" style={{ display: 'grid', gap: 12 }}>
            <p style={{ ...note, fontSize: 14, color: 'var(--ink)' }}>
              {creation.deja ? 'Ce projet existait déjà pour ce clic · rien n’a été créé en double.' : 'Projet créé · la source, l’hypothèse et le produit y sont gardés.'}
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a href={`/studio/projets/${creation.projetId}`} style={{ ...btn, textDecoration: 'none' }}>Ouvrir le projet</a>
              <button type="button" onClick={() => setOuvert(false)} style={btnGhost}>Revenir à la Veille</button>
            </div>
          </div>
        ) : prep && s ? (
          <div>
            <section style={bloc} aria-labelledby="pc-source">
              <h3 id="pc-source" style={titreSection}>Source</h3>
              <div style={{ ...tuile, padding: '10px 12px', background: 'var(--bg)', display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{s.annonceur || 'Annonceur inconnu'}</span>
                <span style={note}>
                  {s.type === 'saved_ad' ? 'Annonce sauvegardée' : 'Annonce observée en Veille'} · {s.plateforme} · observée le {dateCourteUtc(s.observeLe)}
                  {s.diffuseeDepuisJours !== null ? ` · diffusée depuis ${s.diffuseeDepuisJours} j (une durée ne prouve pas la rentabilité)` : ''}
                  {s.format ? ` · format « ${s.format.libelle} »` : ''}
                </span>
                <span style={{ ...note, color: 'var(--muted)' }}>Droit : observation publique · on reprend la structure, jamais le produit, la marque ni les allégations.</span>
              </div>
            </section>

            <section style={bloc} aria-labelledby="pc-ressources">
              <h3 id="pc-ressources" style={titreSection}>Ressources réellement disponibles</h3>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {MODALITES_SOURCE.map((m) => {
                  const ok = s.modalites.includes(m);
                  return (
                    <li key={m} data-modalite={m} data-disponible={ok ? 'oui' : 'non'} style={{ fontSize: 12.5, padding: '5px 10px', borderRadius: 999, border: `1px solid ${ok ? 'rgba(24,204,140,.45)' : 'var(--line-2)'}`, color: ok ? '#7ee8bf' : 'var(--muted)' }}>
                      {LIBELLES_MODALITE[m]} · {ok ? 'disponible' : 'absente'}
                    </li>
                  );
                })}
              </ul>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 3 }}>
                {s.observations.map((o) => <li key={o.id} style={note}><b style={{ color: 'var(--ink)' }}>{LIBELLES_ELEMENT[o.element]}</b> · {o.claim}</li>)}
              </ul>
              {s.absents.length > 0 && (
                <details>
                  <summary style={{ ...note, cursor: 'pointer', minHeight: CIBLE_TACTILE_MIN, display: 'flex', alignItems: 'center' }}>Non observable dans cette source ({s.absents.length})</summary>
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 3 }}>
                    {s.absents.map((a) => <li key={a.element} data-absent={a.element} style={note}><b style={{ color: 'var(--ink)' }}>{LIBELLES_ELEMENT[a.element]}</b> · absente · {a.raison}</li>)}
                  </ul>
                </details>
              )}
            </section>

            <section style={bloc} aria-labelledby="pc-marque">
              <h3 id="pc-marque" style={titreSection}>Marque cible</h3>
              {prep.marques.length === 0 ? (
                <p style={note}>Aucune marque accessible · crée d’abord une marque dans l’espace.</p>
              ) : (
                <>
                  <label htmlFor="pc-marque-choix" style={lbl}>Le projet sera créé pour</label>
                  <select id="pc-marque-choix" value={brandId ?? ''} disabled={creation.etat === 'encours'} onChange={(e) => changerMarque(e.target.value)} style={champ}>
                    {prep.marques.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
                  </select>
                  {chargement && <p role="status" style={note}>Chargement des produits de {nomMarque}…</p>}
                </>
              )}
            </section>

            <section style={bloc} aria-labelledby="pc-hypothese">
              <h3 id="pc-hypothese" style={titreSection}>Hypothèse à tester</h3>
              <p style={note}>Au plus trois propositions, une seule variable changée à la fois. Tu choisis, ou tu rédiges la tienne.</p>
              {prep.ia.disponible ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" onClick={proposer} disabled={proposant || !brandId} style={{ ...btnGhost, fontSize: 13 }}>
                    {proposant ? 'Propositions en cours…' : 'Proposer des hypothèses'}
                  </button>
                  <span style={{ ...note, color: 'var(--muted)' }}>Appel texte facturé au plafond de dépense · {prep.ia.plafondUsd.toFixed(2).replace('.', ',')} $ au plus · aucun crédit débité.</span>
                </div>
              ) : (
                <p data-ia="indisponible" style={{ ...note, ...cadreSignal('rgba(245,166,35,.4)', 'tuile'), padding: '8px 10px', background: 'rgba(245,166,35,.08)' }}>{prep.ia.raison}</p>
              )}
              {refusIa && <p role="alert" style={{ ...note, color: '#ffcf8f' }}>{refusIa.message}{refusIa.traceId ? ` · identifiant support : ${refusIa.traceId}` : ''}</p>}
              {questions.length > 0 && (
                <div style={{ ...note }}>Jarvis a besoin de précisions avant de proposer :<ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{questions.map((q) => <li key={q}>{q}</li>)}</ul></div>
              )}
              <div role="radiogroup" aria-label="Hypothèse retenue" style={{ display: 'grid', gap: 8 }}>
                {propositions && propositions.brandId === brandId && propositions.hypotheses.map((h) => (
                  <label key={h.id} data-hypothese={h.id} style={{ ...tuile, display: 'flex', gap: 10, padding: '10px 12px', cursor: 'pointer', background: choix?.type === 'proposee' && choix.id === h.id ? 'var(--accent-soft)' : 'var(--bg)' }}>
                    <input type="radio" name={`pc-h-${annonce.id}`} checked={choix?.type === 'proposee' && choix.id === h.id} onChange={() => setChoix({ type: 'proposee', id: h.id })} style={{ width: 20, height: 20, marginTop: 2 }} />
                    <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
                      <span style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 600 }}>{h.statement}</span>
                      <span style={note}>Variable : {h.variable} · témoin : {h.control || '·'} · traitement : {h.treatment || '·'}</span>
                      <span style={note}>Mesure : {h.metric} · {h.isolee ? 'changement isolé' : 'exploratoire · plusieurs variables, non causal'}</span>
                    </span>
                  </label>
                ))}
                <label style={{ ...tuile, display: 'flex', gap: 10, padding: '10px 12px', cursor: 'pointer', background: choix?.type === 'saisie' ? 'var(--accent-soft)' : 'var(--bg)' }}>
                  <input type="radio" name={`pc-h-${annonce.id}`} checked={choix?.type === 'saisie'} onChange={() => setChoix({ type: 'saisie' })} style={{ width: 20, height: 20, marginTop: 2 }} />
                  <span style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 600 }}>Rédiger mon hypothèse</span>
                </label>
              </div>
              {choix?.type === 'saisie' && (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div><label htmlFor="pc-s-enonce" style={lbl}>Hypothèse (obligatoire)</label>
                    <textarea id="pc-s-enonce" value={saisie.statement} onChange={(e) => majSaisie('statement', e.target.value)} rows={2} style={{ ...champ, minHeight: 64 }} placeholder="Ex. une accroche chiffrée augmente le taux de clic" /></div>
                  <div><label htmlFor="pc-s-variable" style={lbl}>Variable testée (obligatoire, une seule)</label>
                    <input id="pc-s-variable" value={saisie.variable} onChange={(e) => majSaisie('variable', e.target.value)} style={champ} placeholder="Ex. accroche" /></div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 200px' }}><label htmlFor="pc-s-temoin" style={lbl}>Témoin</label>
                      <input id="pc-s-temoin" value={saisie.control} onChange={(e) => majSaisie('control', e.target.value)} style={champ} /></div>
                    <div style={{ flex: '1 1 200px' }}><label htmlFor="pc-s-traitement" style={lbl}>Traitement</label>
                      <input id="pc-s-traitement" value={saisie.treatment} onChange={(e) => majSaisie('treatment', e.target.value)} style={champ} /></div>
                  </div>
                  <div><label htmlFor="pc-s-mesure" style={lbl}>Mesure</label>
                    <select id="pc-s-mesure" value={saisie.metric} onChange={(e) => majSaisie('metric', e.target.value)} style={champ}>
                      <option value="">À choisir plus tard</option>
                      {prep.metriques.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select></div>
                </div>
              )}
            </section>

            <section style={bloc} aria-labelledby="pc-produit">
              <h3 id="pc-produit" style={titreSection}>Produit de {nomMarque || 'la marque'}</h3>
              {produits.length === 0 ? (
                <p style={note}>{chargement ? 'Chargement…' : 'Aucun produit enregistré pour cette marque · le projet indiquera ce manque.'}</p>
              ) : (
                <div role="radiogroup" aria-label="Produit" style={{ display: 'grid', gap: 8 }}>
                  {produits.map((p) => (
                    <label key={p.id} data-produit={p.id} style={{ ...tuile, display: 'flex', gap: 10, padding: '10px 12px', cursor: 'pointer', background: productId === p.id ? 'var(--accent-soft)' : 'var(--bg)' }}>
                      <input type="radio" name={`pc-p-${annonce.id}`} checked={productId === p.id} onChange={() => setProductId(p.id)} style={{ width: 20, height: 20, marginTop: 2 }} />
                      <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
                        <span style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 600, overflowWrap: 'anywhere' }}>{p.nom}</span>
                        <span style={note}>Connu : {p.faits.filter((f) => f.cle !== 'nom').map((f) => `${f.libelle.toLowerCase()} (${f.valeur})`).join(' · ') || 'rien de plus que le nom'}</span>
                        {p.manques.length > 0 && <span style={{ ...note, color: '#ffcf8f' }}>Manque : {p.manques.map((m) => m.libelle.toLowerCase()).join(', ')}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </section>

            <section style={bloc} aria-labelledby="pc-projet">
              <h3 id="pc-projet" style={titreSection}>Projet</h3>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: '2 1 240px' }}><label htmlFor="pc-titre" style={lbl}>Titre</label>
                  <input id="pc-titre" value={titre} maxLength={200} onChange={(e) => setTitre(e.target.value)} style={champ} /></div>
                <div style={{ flex: '1 1 160px' }}><label htmlFor="pc-type" style={lbl}>Type</label>
                  <select id="pc-type" value={kind} onChange={(e) => setKind(e.target.value)} style={champ}>
                    {['ads', 'image', 'video', 'text'].map((k) => <option key={k} value={k}>{LIBELLES_TYPE_PROJET[k]}</option>)}
                  </select></div>
              </div>
            </section>

            <div style={{ position: 'sticky', bottom: -20, background: 'var(--surface)', padding: '12px 0 4px', borderTop: '1px solid var(--line)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={creer} disabled={!brandId || !hypotheseOk || creation.etat === 'encours'} style={{ ...btn, opacity: !brandId || !hypotheseOk ? 0.55 : 1 }}>
                {creation.etat === 'encours' ? 'Création…' : `Créer le projet pour ${nomMarque || 'la marque'}`}
              </button>
              <span style={{ ...note, color: 'var(--muted)' }}>{!hypotheseOk ? 'Hypothèse : énoncé et variable requis.' : 'Gratuit · aucune génération, aucun crédit.'}</span>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
