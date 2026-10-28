'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  amorcesCategorie, CATEGORIES_JARVIS, CATEGORIE_JARVIS_DEFAUT, AUTOMATISATIONS_JARVIS, AUTOMATISATION_A_VENIR, VALEUR_ABSENTE,
  filtrerConversations, quandConversation, extraitConversation, reponseLisible, visibleWhileStreaming, sansTiretCadratin, libelleJour,
  conceptPropose, citationsReponse, titreValide, ACTION_PREMIERE_MARQUE, TITRE_ONBOARDING_JARVIS, SOUS_TITRE_ONBOARDING_JARVIS, ENTREES_ONBOARDING_JARVIS,
  type CategorieJarvis, type EncartKpiJarvis, type IterationRecente, type ConceptPropose,
} from '@tiktrends/core';
import { chatThreadAction, clearChatAction, onboardingThreadAction, clearOnboardingAction, type ChatTurn } from '../../../app/actions/jarvis-chat';
import { creerConversationAction, renommerConversationAction } from '../../../app/actions/jarvis-conversations';
import { draftConceptAction, type DraftView } from '../../../app/actions/adsmap-draft';
import { Brouillon } from '../resultats/Brouillon';
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
 * Vague 3 · les gestes de l'ancien écran, portés ici · RENOMMER une conversation
 * (`button.jx` de la maquette, `renommerConversationAction`), « Écrire ce
 * concept » quand une réponse le propose (`draftConceptAction`, coût annoncé
 * AVANT le clic), les sources citées, la puce « Fiche marque » (le contexte
 * réel envoyé à la route), la colonne de contexte (projets, fiche, sources) et,
 * SANS marque, la vraie conversation d'accueil (`onboardingThreadAction`).
 *
 * Absents ou désactivés, faute de service réel · la suppression d'une
 * conversation (aucune action n'efface la ligne · « Effacer le fil » efface ses
 * messages, dans la conversation ouverte), le pilote automatique, le rapport, la
 * convention de nommage (désactivés avec leur raison), les chiffres clés (état
 * vide · la dépense pub n'est pas agrégée).
 */

export interface ConversationArchive { id: string | null; titre: string; extrait: string; majLe: string }

/** La colonne de contexte · les vrais projets Studios de la marque, la vraie complétude de la fiche. */
export interface AnnexesJarvis {
  projets: ReadonlyArray<{ id: string; titre: string; href: string }>;
  completude: { score: number; faits: number; total: number; ficheHref: string } | null;
}

/** Sans marque · le fil d'accueil réel (portée espace + personne) et ses amorces. */
export interface AccueilJarvis { tours: ChatTurn[]; amorces: string[] }

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
  /** La colonne de contexte (absente : la colonne reste celle de la maquette). */
  annexes?: AnnexesJarvis;
  /** Sans marque · la conversation d'accueil. Absente : le champ reste fermé. */
  accueil?: AccueilJarvis;
}

const heure = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
const lignes = (t: string) => t.split('\n').map((l, i) => <Fragment key={i}>{i > 0 && <br />}{l}</Fragment>);

export function Jarvis(p: PropsJarvis) {
  const { toast } = useSpatial();
  const [conversations, setConversations] = useState(p.conversations);
  const [recherche, setRecherche] = useState('');
  // `ouverte` · null = rien d'ouvert (accueil) · { id: null } = le fil principal.
  const [ouverte, setOuverte] = useState<{ id: string | null } | null>(null);
  const sansMarque = !p.marque;
  const parler = !!p.marque || !!p.accueil;
  const [tours, setTours] = useState<ChatTurn[]>(p.accueil?.tours ?? []);
  const [sources, setSources] = useState<Record<string, { titre: string; enService: boolean }>>({});
  const [fiche, setFiche] = useState(true);
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

  const actif = sansMarque ? tours.length > 0 || enCours : !!ouverte && (tours.length > 0 || enCours);
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
    setSources(t.sources ?? {});
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

  /** Sans marque · relit le fil d'accueil (même porte que la route). */
  async function chargerAccueil() {
    const r = await onboardingThreadAction();
    if (r.error) { setErreur(r.error); return; }
    setTours(r.thread?.turns ?? []);
  }

  /** Lit le flux de la route et l'affiche au fil de l'eau. */
  async function lireFlux(res: Response) {
    const lecteur = res.body!.getReader();
    const dec = new TextDecoder();
    let recu = '';
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      recu += dec.decode(value, { stream: true });
      setPartiel(recu);
    }
    setPartiel('');
  }

  /** Sans marque · la conversation d'accueil, même route (sans marque, la route sert le fil d'accueil). */
  async function envoyerAccueil(q: string) {
    setEnCours(true); setErreur(null); setPartiel(''); setSaisie('');
    setTours((t) => [...t, { id: `local-${Date.now()}`, role: 'user', content: q, at: new Date().toISOString() }]);
    try {
      const res = await fetch('/api/jarvis/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: q }) });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setErreur(j?.error ?? 'Jarvis n’a pas pu répondre.');
        return;
      }
      await lireFlux(res);
      await chargerAccueil();
    } catch {
      setErreur('La connexion s’est interrompue. Ta question est enregistrée, réessaie.');
    } finally {
      setEnCours(false);
    }
  }

  /** L'envoi · seulement sur un geste explicite (bouton ou Entrée dans le champ). */
  async function envoyer(texte: string) {
    const q = texte.trim();
    if (!q || enCours) return;
    if (!p.marque) { if (p.accueil) await envoyerAccueil(q); return; }
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
        // La puce « Fiche marque » pilote le contexte RÉEL (`contexteSelonPuces`, côté route).
        body: JSON.stringify({ message: q, conversationId: cible, brandId: p.marque.id, sources: fiche ? ['fiche'] : [] }),
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setErreur(j?.error ?? 'Jarvis n’a pas pu répondre.');
        return;
      }
      await lireFlux(res);
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
    if (enCours) return;
    if (sansMarque) {
      if (!window.confirm('Effacer cette conversation avec Jarvis ? Elle ne pourra pas être récupérée.')) return;
      const r = await clearOnboardingAction();
      if (r.error) { setErreur(r.error); return; }
      await chargerAccueil();
      toast('Messages effacés');
      return;
    }
    if (!ouverte) return;
    if (!window.confirm('Effacer tous les messages de cette conversation ? Ils ne pourront pas être récupérés.')) return;
    const r = await clearChatAction(ouverte.id);
    if (r.error) { setErreur(r.error); return; }
    await charger(ouverte.id);
    toast('Messages effacés');
  }

  /** Renommer · une conversation NOMMÉE seulement (le fil principal n'a pas de ligne à renommer). */
  async function renommer(id: string, actuel: string) {
    if (!p.marque || enCours) return;
    const propose = window.prompt('Renommer la conversation', actuel);
    const titre = propose == null ? null : titreValide(propose);
    if (!titre || titre === actuel) return;
    const r = await renommerConversationAction(p.marque.id, id, titre);
    if (r.error || !r.ok) { setErreur(r.error ?? 'La conversation n’a pas pu être renommée.'); return; }
    setConversations((prec) => prec.map((c) => (c.id === id ? { ...c, titre } : c)));
    toast('Conversation renommée');
  }

  async function copier(t: string) {
    try { await navigator.clipboard.writeText(t); toast('Réponse copiée'); } catch { toast('Copie impossible ici'); }
  }

  let jourPrec = '';
  const messages = tours.map((t, i) => {
    const jour = libelleJour(t.at, maintenant);
    const sep = jour !== jourPrec ? <div className="jday" key={`j-${t.id}`}><span>{jour}</span></div> : null;
    jourPrec = jour;
    if (t.role === 'user') {
      return <Fragment key={t.id}>{sep}<div className="jm me"><div className="jb">{lignes(t.content)}</div><small>{heure(t.at)}</small></div></Fragment>;
    }
    const r = reponseLisible(t.content);
    const question = tours[i - 1]?.role === 'user' ? tours[i - 1]!.content : null;
    const cites = citationsReponse(t.content, question, sources);
    const concept = p.marque ? conceptPropose(t.content) : null;
    return (
      <Fragment key={t.id}>{sep}
        <div className="jm"><span className="orb">J</span><div className="jm-c">
          <div className="jm-h"><strong>Jarvis</strong><small>{heure(t.at)} · {p.marque ? 'fiche marque, résultats' : 'accueil'}</small></div>
          <div className="jb">{lignes(r.texte)}</div>
          {cites.length > 0 && <small className="faint" style={{ display: 'block', marginTop: 6, fontSize: 11 }}>Cité · {cites.join(' · ')}</small>}
          <div className="jm-a">
            <button type="button" className="jact" onClick={() => void copier(r.texte)}><Ic n="copy" />Copier</button>
            {r.actions.map((a) => <Lien key={a.cle} className="jact" href={a.href} title={a.effet}><Ic n="arrow" />{a.libelle}</Lien>)}
            {p.marque && <Lien className="jact" href="/studio/projets/nouveau"><Ic n="brush" />Créer un projet</Lien>}
          </div>
          {concept && <Concept c={concept} />}
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
                {c.id && <button type="button" className="jx" aria-label={`Renommer « ${c.titre} »`} title="Renommer la conversation" onClick={() => void renommer(c.id!, c.titre)} disabled={enCours}><Ic n="text" /></button>}
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
          {p.annexes && p.marque && <Annexes a={p.annexes} marque={p.marque.nom} />}
        </aside>
        <div className="tile jchat">
          <header className="jch">
            <span className="orb">J</span>
            <div style={{ flex: 1, minWidth: 0, display: 'grid' }}><strong>{sansMarque ? (actif ? 'Accueil' : 'Jarvis') : actif ? titreOuvert : 'Jarvis'}</strong><small className="faint">{sansMarque ? 'Sans marque · Jarvis t’aide à démarrer' : 'S’appuie sur : Fiche marque · Résultats mesurés · Veille'}</small></div>
            {p.annexes && p.marque && (
              <button type="button" className="chip" aria-pressed={fiche} onClick={() => setFiche((f) => !f)} disabled={enCours}
                title={fiche ? 'Fiche marque incluse dans le contexte · cliquer pour l’exclure' : 'Fiche marque exclue · cliquer pour l’inclure'}>Fiche marque</button>
            )}
            {actif && <button className="btn sm" type="button" onClick={() => void effacer()} disabled={enCours}><Ic n="x" />Effacer le fil</button>}
            {actif && !sansMarque && <button className="btn sm" type="button" onClick={archiver} disabled={enCours}><Ic n="folder" />Archiver</button>}
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
            ) : p.accueil ? (
              <div className="jempty">
                <span className="orb">J</span>
                <h2>{TITRE_ONBOARDING_JARVIS}</h2>
                <p className="faint">{SOUS_TITRE_ONBOARDING_JARVIS} {p.cout}</p>
                <div className="cats">
                  <Lien className="btn pri sm" href={ACTION_PREMIERE_MARQUE.href}><Ic n="plus" />{ACTION_PREMIERE_MARQUE.label}</Lien>
                  {ENTREES_ONBOARDING_JARVIS.filter((e) => e.href !== ACTION_PREMIERE_MARQUE.href).map((e) => <Lien key={e.cle} className="btn sm" href={e.href} title={e.sous}>{e.titre}</Lien>)}
                </div>
                {p.accueil.amorces.length > 0 && (
                  <div className="cats">
                    {p.accueil.amorces.map((q) => <button key={q} type="button" className="chip" onClick={() => preparer(q)} title="Prépare la question · l’envoi reste à toi">{q}</button>)}
                  </div>
                )}
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
              <input id="jin" ref={champ} value={saisie} onChange={(e) => setSaisie(e.target.value)} maxLength={4000} disabled={!parler || enCours}
                placeholder={parler ? 'Écrire à Jarvis…' : 'Crée d’abord une marque'} aria-label="Ta question à Jarvis" />
              <button className="btn pri sm" type="submit" aria-label="Envoyer" title={p.cout} disabled={!parler || enCours}><Ic n="arrow" /></button>
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

/**
 * « Écrire ce concept » · le seul geste payant d'une réponse. Le coût est dit
 * sur le bouton AVANT le clic (`JARVIS_ACTIONS.draft`) · l'action passe par la
 * barrière de dépense (`guardedAnthropic`). Le brouillon s'affiche tel que
 * l'action le rend (réécriture, accroche, déroulé, hypothèse, réserves).
 */
function Concept({ c }: { c: ConceptPropose }) {
  const [etat, setEtat] = useState<'pret' | 'ecrit'>('pret');
  const [vue, setVue] = useState<DraftView | null>(null);
  const [note, setNote] = useState<string | null>(null);
  async function rediger() {
    if (etat === 'ecrit') return;
    setEtat('ecrit'); setNote(null);
    const r = await draftConceptAction({ origin: 'blank', intent: c.intent });
    setEtat('pret');
    if (r.error) { setNote(r.error); return; }
    setVue(r.view ?? null);
  }
  return (
    <div style={{ marginTop: 8 }}>
      {!vue && (
        <button type="button" className="jact" onClick={() => void rediger()} disabled={etat === 'ecrit'} title={c.effet}>
          <Ic n="spark" />{etat === 'ecrit' ? 'Jarvis écrit…' : `${c.libelle} · ${c.cout}`}
        </button>
      )}
      {!vue && <small className="faint" style={{ display: 'block', marginTop: 4, fontSize: 11 }}>{c.effet}</small>}
      {note && <p className="faint" role="alert" style={{ fontSize: '12px', marginTop: 6 }}>{note}</p>}
      {vue && <Brouillon vue={vue} />}
    </div>
  );
}

/** La colonne de contexte · projets réels, complétude réelle de la fiche, et les écrans qui la nourrissent. */
function Annexes({ a, marque }: { a: AnnexesJarvis; marque: string }) {
  return (
    <>
      {a.projets.length > 0 && (
        <>
          <div className="jgrp">Projets</div>
          <div className="jlist">
            {a.projets.map((pr) => (
              <Lien key={pr.id} className="jit jit-b" href={pr.href} title={pr.titre}>
                <span className="jic"><Ic n="brush" /></span>
                <div className="jit-t"><strong>{pr.titre}</strong></div>
              </Lien>
            ))}
          </div>
        </>
      )}
      <div className="jgrp">Contexte</div>
      <div className="jlist">
        {a.completude && (
          <Lien className="jit jit-b" href={a.completude.ficheHref} title="Compléter la fiche marque">
            <span className="jic"><Ic n="tag" /></span>
            <div className="jit-t"><strong>Fiche marque · {a.completude.score} %</strong><small>{a.completude.faits} éléments sur {a.completude.total} · Jarvis répond mieux avec une fiche complète</small></div>
          </Lien>
        )}
        <Lien className="jit jit-b" href="/jarvis/sources">
          <span className="jic"><Ic n="folder" /></span>
          <div className="jit-t"><strong>Sources et mémoire</strong><small>Ce que Jarvis sait de {marque}, et d’où il le tient</small></div>
        </Lien>
        <Lien className="jit jit-b" href="/brands" title="Marques · changer de marque active">
          <span className="jic"><Ic n="users" /></span>
          <div className="jit-t"><strong>{marque}</strong><small>Changer de marque active</small></div>
        </Lien>
        <Lien className="jit jit-b" href="/onboarding?redo=1">
          <span className="jic"><Ic n="gear" /></span>
          <div className="jit-t"><strong>Personnaliser Jarvis</strong><small>Revoir mes réponses d’accueil</small></div>
        </Lien>
      </div>
    </>
  );
}
