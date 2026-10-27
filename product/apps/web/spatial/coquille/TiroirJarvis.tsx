'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { brouillonAvecSuggestion, sousTitreTiroirJarvis, suggestionsTiroirJarvis, texteFluxJarvis, texteTourJarvis, verrouAction } from '@tiktrends/core';
import { chatThreadAction, type ChatThread } from '../../app/actions/jarvis-chat';
import { COUT_CONVERSATION_JARVIS } from '../../lib/veille-jarvis';
import { Ic, Lien } from '../communs/base';

/**
 * Le tiroir Jarvis de la maquette (`#jdraw` · script « Jarvis contextuel »,
 * `paint` / `openJ` · fragments `_jarvis*.html`), branché sur la VRAIE
 * conversation de la marque active :
 *  · lecture · `chatThreadAction` (base seule, aucun appel IA à l'ouverture) ·
 *    la conversation reprise est celle que l'écran Jarvis a laissée ouverte
 *    (même clé `tt_jarvis_conv_<marque>`) ;
 *  · envoi · `/api/jarvis/chat` (barrière de dépense `guardedAnthropic`, sous
 *    le plafond IA), réponse lue au fil de l'eau, UNIQUEMENT sur un clic ou
 *    Entrée · une suggestion remplit le champ, elle n'envoie rien ;
 *  · coût annoncé sous le champ AVANT l'envoi (`COUT_CONVERSATION_JARVIS`).
 *
 * La « Création express » ouverte de la maquette (style, produit, format,
 * accroche, « Créer · 16 crédits ») simule un devis · le tiroir garde sa forme
 * repliée, qui mène au VRAI assistant de création (`/studio/projets/nouveau`,
 * où le prix est annoncé avant de lancer). Les gestes proposés par Jarvis
 * (boutons d'action d'une réponse) restent sur l'écran Jarvis plein écran.
 */

export interface TourTiroir { id: string; moi: boolean; texte: string }

export interface VueTiroirJarvisProps {
  sousTitre: string;
  creer: string | null;
  tours: TourTiroir[];
  /** Réponse en cours · `''` avant le premier morceau (points d'attente), `null` hors envoi. */
  partiel: string | null;
  statut: string | null;
  erreur: string | null;
  suggestions: string[];
  saisie: string;
  enCours: boolean;
  onSaisie: (v: string) => void;
  onEnvoyer: () => void;
  onSuggestion: (q: string) => void;
  onCopier: (texte: string) => void;
  onCreer: () => void;
  onFermer: () => void;
  champ?: React.Ref<HTMLInputElement>;
  fil?: React.Ref<HTMLDivElement>;
}

const CREER: CSSProperties = { all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 18, background: 'linear-gradient(135deg,color-mix(in srgb,var(--acc) 26%,transparent),transparent 75%),#ffffff0a', border: '1px solid color-mix(in srgb,var(--acc) 45%,transparent)' };
const CREER_IC: CSSProperties = { display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 10, background: 'linear-gradient(135deg,var(--acc),var(--acc2))', color: 'var(--on)' };
const COUT: CSSProperties = { display: 'block', margin: '8px 4px 0', fontSize: 11, lineHeight: 1.45 };

/** Le contenu du tiroir · présentationnel (rendu tel quel par la garde de parité). */
export function VueTiroirJarvis(p: VueTiroirJarvisProps) {
  return (
    <>
      <header className="jdh">
        <span className="orb">J</span>
        <div style={{ flex: 1, minWidth: 0, display: 'grid' }}><strong>Jarvis</strong><small>{p.sousTitre}</small></div>
        <Lien className="btn sm icon" href="/jarvis" aria-label="Ouvrir Jarvis en plein écran" title="Plein écran"><Ic n="arrow" /></Lien>
        <button className="btn sm icon" type="button" data-jdx="1" aria-label="Fermer" onClick={p.onFermer}><Ic n="x" /></button>
      </header>
      <div className="jdb" id="jdb" ref={p.fil}>
        {p.creer && (
          <button type="button" data-jqopen="1" style={CREER} onClick={p.onCreer}>
            <span style={CREER_IC}><Ic n="brush" /></span><strong style={{ font: '600 13px var(--sfd)', flex: 1 }}>Crée ta pub dans le style de ton choix</strong><Ic n="plus" />
          </button>
        )}
        {p.statut && <p className="faint" role="status" style={{ margin: 0, fontSize: 12.5 }}>{p.statut}</p>}
        {p.tours.map((t) => t.moi
          ? <div key={t.id} className="jm me"><div className="jb">{t.texte}</div></div>
          : (
            <div key={t.id} className="jm"><span className="orb">J</span><div className="jm-c"><div className="jb">{t.texte}</div><div className="jm-a"><button type="button" className="jact" data-jdcopy="" onClick={() => p.onCopier(t.texte)}><Ic n="copy" />Copier</button></div></div></div>
          ))}
        {p.partiel !== null && (
          <div className="jm"><span className="orb">J</span><div className="jm-c">{p.partiel ? <div className="jb">{p.partiel}</div> : <div className="jb jtyping"><i /><i /><i /></div>}</div></div>
        )}
        {p.erreur && <p className="faint" role="alert" style={{ margin: 0, fontSize: 12.5 }}>{p.erreur}</p>}
        {p.suggestions.length > 0 && (
          <div className="jdq">{p.suggestions.map((q) => <button key={q} type="button" className="chip" data-jdq={q} disabled={p.enCours} onClick={() => p.onSuggestion(q)}>{q}</button>)}</div>
        )}
      </div>
      <form className="jdf" id="jdform" autoComplete="off" onSubmit={(e) => { e.preventDefault(); p.onEnvoyer(); }}>
        <div className="jin">
          <input id="jdin" ref={p.champ} placeholder="Une question pour Jarvis…" aria-label="Question à Jarvis" maxLength={4000}
            value={p.saisie} disabled={p.enCours} onChange={(e) => p.onSaisie(e.target.value)} />
          <button className="btn pri sm" type="submit" aria-label="Envoyer" disabled={p.enCours || !p.saisie.trim()}><Ic n="arrow" /></button>
        </div>
        <small className="faint" style={COUT}>{COUT_CONVERSATION_JARVIS}</small>
      </form>
    </>
  );
}

const cleConversation = (brandId: string) => `tt_jarvis_conv_${brandId}`;

/**
 * Le tiroir, avec son état réel. Monté une fois par la coquille · `ouvert`
 * bascule `hidden` · le fil est lu à la PREMIÈRE ouverture (jamais avant),
 * puis gardé jusqu'au rechargement.
 */
export function TiroirJarvis({ ouvert, marque, creer, brouillon, onFermer, onNaviguer, toast }: {
  ouvert: boolean;
  marque: { id: string; nom: string } | null;
  creer: string | null;
  /** Préremplissage demandé par une vue (`ouvrirJarvis(brouillon)`) · jamais envoyé seul. */
  brouillon: { texte: string; n: number } | null;
  onFermer: () => void;
  onNaviguer: (href: string) => void;
  toast: (m: string) => void;
}) {
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [saisie, setSaisie] = useState('');
  const [partiel, setPartiel] = useState<string | null>(null);
  const verrou = useRef(verrouAction());
  const champ = useRef<HTMLInputElement>(null);
  const fil = useRef<HTMLDivElement>(null);

  const charger = useCallback(async (id: string | null) => {
    const r = await chatThreadAction(id);
    if (r.error) { setErreur(r.error); return; }
    setErreur(null);
    const t = r.thread ?? null;
    setThread(t);
    if (t && marque) {
      setConversationId(t.conversationId);
      try { localStorage.setItem(cleConversation(marque.id), t.conversationId ?? '__principal__'); } catch { /* sans effet */ }
    }
  }, [marque]);

  useEffect(() => {
    if (!ouvert || charge) return;
    setCharge(true);
    let sauve: string | null = null;
    try { const v = marque ? localStorage.getItem(cleConversation(marque.id)) : null; if (v && v !== '__principal__') sauve = v; } catch { /* sans effet */ }
    void charger(sauve).catch(() => setErreur('Jarvis n’a pas pu ouvrir la conversation. Réessaie.'));
  }, [ouvert, charge, charger, marque]);

  useEffect(() => { if (ouvert) setTimeout(() => champ.current?.focus(), 50); }, [ouvert]);
  useEffect(() => { if (brouillon) setSaisie((s) => brouillonAvecSuggestion(s, brouillon.texte)); }, [brouillon]);
  useEffect(() => { const f = fil.current; if (f) f.scrollTop = f.scrollHeight; }, [thread?.turns.length, partiel, ouvert]);

  async function envoyer() {
    const q = saisie.trim();
    if (!q || !marque) return;
    if (!verrou.current.tenter()) return;
    setSaisie(''); setErreur(null); setPartiel('');
    setThread((t) => (t ? { ...t, turns: [...t.turns, { id: `local-${Date.now()}`, role: 'user', content: q, at: new Date().toISOString() }] } : t));
    try {
      const res = await fetch('/api/jarvis/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: q, conversationId, brandId: marque.id, sources: ['fiche'] }),
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setErreur(j?.error ?? 'Jarvis n’a pas pu répondre.');
        return;
      }
      const lecteur = res.body.getReader();
      const dec = new TextDecoder();
      let recu = '';
      for (;;) {
        const { done, value } = await lecteur.read();
        if (done) break;
        recu += dec.decode(value, { stream: true });
        setPartiel(recu);
      }
      await charger(conversationId);
    } catch {
      setErreur('La connexion s’est interrompue. Vérifie la conversation avant de réessayer.');
    } finally {
      setPartiel(null);
      verrou.current.relacher();
    }
  }

  const tours: TourTiroir[] = (thread?.turns ?? []).map((t) => ({ id: t.id, moi: t.role === 'user', texte: t.role === 'user' ? t.content : texteTourJarvis(t.content) }));
  const enCours = partiel !== null;

  return (
    <aside id="jdraw" className="jdraw glass" aria-label="Jarvis" hidden={!ouvert}>
      {ouvert && (
        <VueTiroirJarvis
          sousTitre={sousTitreTiroirJarvis(thread?.brandName ?? marque?.nom ?? null)}
          creer={creer}
          tours={tours}
          partiel={partiel === null ? null : texteFluxJarvis(partiel)}
          statut={!thread && !erreur ? 'Ouverture de la conversation…' : null}
          erreur={erreur}
          suggestions={suggestionsTiroirJarvis(thread?.starters)}
          saisie={saisie}
          enCours={enCours}
          onSaisie={setSaisie}
          onEnvoyer={() => void envoyer()}
          onSuggestion={(q) => { setSaisie((s) => brouillonAvecSuggestion(s, q)); champ.current?.focus(); }}
          onCopier={(t) => {
            try { void navigator.clipboard.writeText(t).then(() => toast('Réponse copiée'), () => toast('Copie impossible ici')); } catch { toast('Copie impossible ici'); }
          }}
          onCreer={() => { if (creer) onNaviguer(creer); }}
          onFermer={onFermer}
          champ={champ}
          fil={fil}
        />
      )}
    </aside>
  );
}
