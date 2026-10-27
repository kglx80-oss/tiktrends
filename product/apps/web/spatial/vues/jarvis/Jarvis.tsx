'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  amorcesCategorie, CATEGORIES_JARVIS, CATEGORIE_JARVIS_DEFAUT, AUTOMATISATIONS_JARVIS, AUTOMATISATION_A_VENIR, VALEUR_ABSENTE,
  filtrerConversations, quandConversation, extraitConversation, reponseLisible, visibleWhileStreaming, sansTiretCadratin, libelleJour,
  type CategorieJarvis, type EncartKpiJarvis, type IterationRecente,
} from '@tiktrends/core';
import { chatThreadAction, clearChatAction, type ChatTurn } from '../../../app/actions/jarvis-chat';
import { creerConversationAction } from '../../../app/actions/jarvis-conversations';
import { EnTete, Ic, Lien, Vue } from '../../communs';
import { useSpatial } from '../../coquille/contexte';

/**
 * « Jarvis » · `docs/spatial/reference/jarvis.html`, balisage à l'identique.
 *
 * Tout est RÉEL · les archives sont les conversations de la portée (espace +
 * marque + personne, `lib/jarvis/conversations`), la recherche les filtre
 * (`filtrerConversations`, noyau), ouvrir relit le fil (`chatThreadAction`),
 * envoyer passe par la route `/api/jarvis/chat` (barrière de dépense) avec le
 * coût annoncé AVANT l'envoi (`COUT_CONVERSATION_JARVIS`). AUCUN envoi
 * automatique · une piste, une catégorie ou une carte de prompt PRÉPARE la
 * question dans le champ, l'envoi reste un clic.
 *
 * Absents ou désactivés, faute de service réel · la suppression d'une
 * conversation (aucune action n'efface la ligne · « Effacer le fil » efface ses
 * messages, dans la conversation ouverte), le pilote automatique, le rapport, la
 * convention de nommage (désactivés avec leur raison), les chiffres clés (état
 * vide · la dépense pub n'est pas agrégée).
 */

export interface ConversationArchive { id: string | null; titre: string; extrait: string; majLe: string }

export interface PropsJarvis {
  marque: { id: string; nom: string } | null;
  /** Conversations nommées, plus récentes d'abord · `id: null` = le fil principal (messages d'avant les conversations). */
  conversations: ConversationArchive[];
  /** Les lots réels de la marque · `null` quand l'offre ne donne pas les Résultats. */
  iterations: IterationRecente[] | null;
  measuredAds: number;
  kpi: EncartKpiJarvis;
  /** Le coût annoncé avant tout envoi (`COUT_CONVERSATION_JARVIS`). */
  cout: string;
  /** L'horloge du serveur · les dates courtes du premier rendu ne divergent pas au réveil client. */
  maintenant: string;
  /** Une question préparée ailleurs (`/jarvis?q=…`) · préremplit le champ, JAMAIS envoyée seule. */
  brouillon?: string;
}

const heure = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
const lignes = (t: string) => t.split('\n').map((l, i) => <Fragment key={i}>{i > 0 && <br />}{l}</Fragment>);

export function Jarvis(p: PropsJarvis) {
  const { toast } = useSpatial();
  const [conversations, setConversations] = useState(p.conversations);
  const [recherche, setRecherche] = useState('');
  // `ouverte` · null = rien d'ouvert (accueil) · { id: null } = le fil principal.
  const [ouverte, setOuverte] = useState<{ id: string | null } | null>(null);
  const [tours, setTours] = useState<ChatTurn[]>([]);
  const [saisie, setSaisie] = useState(p.brouillon ?? '');
  const [enCours, setEnCours] = useState(false);
  const [partiel, setPartiel] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [categorie, setCategorie] = useState<CategorieJarvis>(CATEGORIE_JARVIS_DEFAUT);
  const [measuredAds, setMeasuredAds] = useState(p.measuredAds);
  const champ = useRef<HTMLInputElement>(null);
  const fil = useRef<HTMLDivElement>(null);
  const maintenant = useMemo(() => new Date(p.maintenant), [p.maintenant]);

  useEffect(() => { if (fil.current) fil.current.scrollTop = fil.current.scrollHeight; }, [tours.length, partiel]);

  const actif = !!ouverte && (tours.length > 0 || enCours);
  const titreOuvert = ouverte ? (conversations.find((c) => c.id === ouverte.id)?.titre ?? (tours.find((t) => t.role === 'user')?.content.slice(0, 60) || 'Nouvelle conversation')) : 'Jarvis';
  const liste = filtrerConversations(conversations, recherche).filter((c) => !(actif && !recherche.trim() && ouverte && c.id === ouverte.id));
  const amorces = amorcesCategorie(categorie, { measuredAds });
  const metaCat = CATEGORIES_JARVIS.find((c) => c.cle === categorie)!;
  const kpi = p.kpi;

  /** Prépare une question · jamais d'envoi automatique. */
  const preparer = (q: string) => { setSaisie(q); champ.current?.focus(); };

  async function charger(id: string | null) {
    const r = await chatThreadAction(id);
    if (r.error || !r.thread) { setErreur(r.error ?? 'Jarvis n’a pas pu ouvrir la conversation.'); return false; }
    const t = r.thread;
    setTours(t.turns);
    setMeasuredAds(t.measuredAds);
    setOuverte({ id: t.conversationId });
    setConversations((prec) => {
      const extraits = new Map(prec.map((c) => [c.id, c.extrait] as const));
      const dernier = t.turns[t.turns.length - 1]?.content;
      if (dernier) extraits.set(t.conversationId, extraitConversation(dernier));
      const nommees = t.conversations.map((c) => ({ id: c.id as string | null, titre: c.titre, extrait: extraits.get(c.id) ?? '', majLe: c.majLe }));
      const principal = prec.find((c) => c.id === null);
      return principal ? [...nommees, principal] : nommees;
    });
    return true;
  }

  async function ouvrir(id: string | null) {
    if (enCours) return;
    setErreur(null);
    await charger(id);
  }

  /** L'envoi · seulement sur un geste explicite (bouton ou Entrée dans le champ). */
  async function envoyer(texte: string) {
    const q = texte.trim();
    if (!p.marque || !q || enCours) return;
    setEnCours(true); setErreur(null); setPartiel(''); setSaisie('');
    let cible = ouverte?.id ?? null;
    try {
      // Rien d'ouvert · la question ouvre une NOUVELLE conversation nommée (jamais le fil principal).
      if (!ouverte) {
        const r = await creerConversationAction(p.marque.id);
        if (r.error || !r.id) { setErreur(r.error ?? 'Impossible d’ouvrir la conversation.'); setSaisie(q); return; }
        cible = r.id;
        setOuverte({ id: cible });
      }
      setTours((t) => [...t, { id: `local-${Date.now()}`, role: 'user', content: q, at: new Date().toISOString() }]);
      const res = await fetch('/api/jarvis/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: q, conversationId: cible, brandId: p.marque.id, sources: ['fiche'] }),
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
      setPartiel('');
      await charger(cible);
    } catch {
      setErreur('La connexion s’est interrompue. Vérifie la conversation avant de réessayer.');
    } finally {
      setEnCours(false);
    }
  }

  function archiver() {
    if (enCours) return;
    setOuverte(null); setTours([]); setErreur(null);
    toast('Conversation rangée dans les archives');
  }

  async function effacer() {
    if (!ouverte || enCours) return;
    if (!window.confirm('Effacer tous les messages de cette conversation ? Ils ne pourront pas être récupérés.')) return;
    const r = await clearChatAction(ouverte.id);
    if (r.error) { setErreur(r.error); return; }
    await charger(ouverte.id);
    toast('Messages effacés');
  }

  async function copier(t: string) {
    try { await navigator.clipboard.writeText(t); toast('Réponse copiée'); } catch { toast('Copie impossible ici'); }
  }

  let jourPrec = '';
  const messages = tours.map((t) => {
    const jour = libelleJour(t.at, maintenant);
    const sep = jour !== jourPrec ? <div className="jday" key={`j-${t.id}`}><span>{jour}</span></div> : null;
    jourPrec = jour;
    if (t.role === 'user') {
      return <Fragment key={t.id}>{sep}<div className="jm me"><div className="jb">{lignes(t.content)}</div><small>{heure(t.at)}</small></div></Fragment>;
    }
    const r = reponseLisible(t.content);
    return (
      <Fragment key={t.id}>{sep}
        <div className="jm"><span className="orb">J</span><div className="jm-c">
          <div className="jm-h"><strong>Jarvis</strong><small>{heure(t.at)} · fiche marque, résultats</small></div>
          <div className="jb">{lignes(r.texte)}</div>
          <div className="jm-a">
            <button type="button" className="jact" onClick={() => void copier(r.texte)}><Ic n="copy" />Copier</button>
            {r.actions.map((a) => <Lien key={a.cle} className="jact" href={a.href} title={a.effet}><Ic n="arrow" />{a.libelle}</Lien>)}
            <Lien className="jact" href="/studio/projets/nouveau"><Ic n="brush" />Créer un projet</Lien>
          </div>
        </div></div>
      </Fragment>
    );
  });

  return (
    <Vue>
      <EnTete titre="Jarvis" sous="S’appuie uniquement sur ta fiche marque, ta Veille et tes résultats" outils="credits" />
      <section className="jws">
        <aside className="tile jarch" aria-label="Archives Jarvis">
          <button className="btn pri" type="button" onClick={() => { if (!enCours) { setOuverte(null); setTours([]); setErreur(null); champ.current?.focus(); } }} disabled={!p.marque}><Ic n="plus" />Nouvelle conversation</button>
          <label className="jsearch"><Ic n="search" /><input id="jaq" type="search" placeholder="Rechercher dans les échanges" value={recherche} onChange={(e) => setRecherche(e.target.value)} autoComplete="off" /></label>
          <div className="jgrp">Conversations</div>
          <div className="jlist" id="jarchlist">
            {actif && !recherche.trim() && (
              <div className="jit on"><span className="jdot" /><div className="jit-t"><strong>{titreOuvert}</strong><small>En cours · {tours.length} message{tours.length > 1 ? 's' : ''}</small></div></div>
            )}
            {liste.length ? liste.map((c) => (
              <div className="jit" key={c.id ?? 'principal'}>
                <button type="button" className="jit-b" onClick={() => void ouvrir(c.id)}>
                  <span className="jic"><Ic n="chat" /></span>
                  <div className="jit-t"><strong>{c.titre}</strong><small>{c.extrait}</small></div>
                  <span className="jw">{quandConversation(c.majLe, maintenant)}</span>
                </button>
              </div>
            )) : (
              <p className="faint" style={{ fontSize: '12.5px', padding: '6px 8px', margin: 0 }}>{recherche.trim() ? 'Aucune conversation trouvée.' : 'Aucune conversation archivée pour l’instant.'}</p>
            )}
          </div>
          {p.iterations && (
            <>
              <div className="jgrp">Dernières itérations</div>
              <div className="jlist">
                {p.iterations.length ? p.iterations.map((it) => (
                  <Lien key={it.id} className="jit jit-b" href={it.href}>
                    <span className="jic"><Ic n="loop" /></span>
                    <div className="jit-t"><strong>{it.titre}</strong><small><span className={`pill ${it.pastille.classe}`} style={{ padding: '1px 7px', fontSize: 10 }}>{it.pastille.libelle}</span> {it.quand}</small></div>
                  </Lien>
                )) : <p className="faint" style={{ fontSize: '12.5px', padding: '6px 8px', margin: 0 }}>Aucun lot de test pour l’instant.</p>}
              </div>
            </>
          )}
        </aside>
        <div className="tile jchat">
          <header className="jch">
            <span className="orb">J</span>
            <div style={{ flex: 1, minWidth: 0, display: 'grid' }}><strong>{actif ? titreOuvert : 'Jarvis'}</strong><small className="faint">S’appuie sur : Fiche marque · Résultats mesurés · Veille</small></div>
            {actif && <button className="btn sm" type="button" onClick={() => void effacer()} disabled={enCours}><Ic n="x" />Effacer le fil</button>}
            {actif && <button className="btn sm" type="button" onClick={archiver} disabled={enCours}><Ic n="folder" />Archiver</button>}
          </header>
          <div className="jmsgs" id="convo" ref={fil}>
            {actif ? (
              <>
                {messages}
                {partiel && <div className="jm"><span className="orb">J</span><div className="jm-c"><div className="jb">{lignes(sansTiretCadratin(visibleWhileStreaming(partiel)))}</div></div></div>}
                {enCours && !partiel && <div className="jm"><span className="orb">J</span><div className="jm-c"><div className="jb jtyping"><i /><i /><i /></div></div></div>}
              </>
            ) : p.marque ? (
              <div className="jempty">
                <span className="orb">J</span>
                <h2>Comment je peux t’aider sur {p.marque.nom} ?</h2>
                <p className="faint">Pose une question, ou pars d’une piste ci-dessous. {p.cout}</p>
                <div className="cats">
                  {CATEGORIES_JARVIS.map((c) => (
                    <button key={c.cle} type="button" className="chip" aria-pressed={c.cle === categorie} onClick={() => setCategorie(c.cle)}>{c.libelle}</button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="jempty">
                <span className="orb">J</span>
                <h2>Crée ta première marque pour parler à Jarvis</h2>
                <p className="faint">Jarvis s’appuie sur la fiche de ta marque · sans marque, il n’a rien sur quoi s’appuyer.</p>
                <div className="cats"><Lien className="btn pri sm" href="/brands/new"><Ic n="plus" />Créer ma marque</Lien></div>
              </div>
            )}
          </div>
          <form className="jcomp" id="jform" autoComplete="off" onSubmit={(e: FormEvent) => { e.preventDefault(); void envoyer(saisie); }}>
            {erreur && <p className="faint" role="alert" style={{ margin: '0 0 8px', fontSize: '12.5px' }}>{erreur}</p>}
            <div className="jin">
              <input id="jin" ref={champ} value={saisie} onChange={(e) => setSaisie(e.target.value)} maxLength={4000} disabled={!p.marque || enCours}
                placeholder={p.marque ? 'Écrire à Jarvis…' : 'Crée d’abord une marque'} aria-label="Ta question à Jarvis" />
              <button className="btn pri sm" type="submit" aria-label="Envoyer" title={p.cout} disabled={!p.marque || enCours}><Ic n="arrow" /></button>
            </div>
            {actif && <small className="faint" style={{ display: 'block', marginTop: 8, fontSize: 11 }}>{p.cout}</small>}
          </form>
        </div>
      </section>
      <section className="sec">
        <div className="sech"><h2>Prompts {metaCat.libelle}</h2></div>
        <div className="grid3">
          {amorces.map((a) => (
            <button key={a.titre} type="button" className="tile pickc" onClick={() => preparer(a.prompt)} disabled={!p.marque || enCours} title="Prépare la question · l’envoi reste à toi">
              <span className="ico"><Ic n="spark" s={false} /></span><strong>{a.titre}</strong><small>{a.sous}</small>
            </button>
          ))}
        </div>
      </section>
      <section className="sec grid3">
        <div className="tile" style={{ display: 'grid', gap: 10 }}>
          <div className="member"><strong>Pilote automatique</strong><button type="button" className="sw2" role="switch" aria-checked="false" disabled title={AUTOMATISATION_A_VENIR} aria-label="Pilote automatique" style={{ marginLeft: 'auto' }} /></div>
          <p className="muted" style={{ fontSize: '12.5px' }}>Analyses régulières : optimisations, concepts et formats. À venir, rien n’est encore branché.</p>
        </div>
        {AUTOMATISATIONS_JARVIS.filter((a) => a.cle !== 'iterations').map((a) => (
          <div className="tile" style={{ display: 'grid', gap: 10 }} key={a.cle}>
            <div className="member"><strong>{a.titre}</strong><button className="btn sm" type="button" style={{ marginLeft: 'auto' }} disabled title={AUTOMATISATION_A_VENIR}>{a.action}</button></div>
            <p className="muted" style={{ fontSize: '12.5px' }}>{a.sous} · à venir</p>
          </div>
        ))}
      </section>
      <section className="sec">
        <div className="sech"><h2>{kpi.titre}</h2><span className="faint" style={{ fontSize: '12.5px' }}>{kpi.etat === 'vide' ? `${kpi.periode} · ${kpi.plateforme} · aucune source branchée` : `${kpi.periode} · ${kpi.plateforme}`}</span></div>
        <div className="grid4">
          {kpi.etat === 'vide'
            ? kpi.cartes.map((k) => (
              <div className="tile kfig" key={k.cle}>
                <span className="lbl">{k.libelle}</span><span className="v">{VALEUR_ABSENTE}</span>
                <span className="d" style={{ color: 'var(--fg3)' }}>Aucune source</span>
                <Lien className="btn sm" href={kpi.lien} style={{ justifySelf: 'start' }}>{kpi.lienLibelle}</Lien>
              </div>
            ))
            : kpi.kpis.map((k) => (
              <div className="tile kfig" key={k.cle}>
                <span className="lbl">{k.libelle}</span><span className="v">{k.valeur}</span>
                <span className="d" style={{ color: 'var(--fg3)' }}>{kpi.periode}</span>
                <button className="btn sm" type="button" onClick={() => preparer(`Pourquoi mon indicateur ${k.libelle} évolue-t-il ainsi ?`)} disabled={!p.marque || enCours} style={{ justifySelf: 'start' }}>Demander pourquoi</button>
              </div>
            ))}
        </div>
      </section>
    </Vue>
  );
}
