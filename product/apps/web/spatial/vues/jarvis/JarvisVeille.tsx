'use client';

import { Fragment, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { reponseLisible, sansTiretCadratin, visibleWhileStreaming } from '@tiktrends/core';
import { chatThreadAction, type ChatTurn } from '../../../app/actions/jarvis-chat';
import { creerConversationAction } from '../../../app/actions/jarvis-conversations';
import { preparerCreation } from '../../../app/actions/studios/sources';
import { creerStudioDepuisJarvis } from '../../../app/actions/jarvis-veille-studio';
import { lireEntreeJarvisVeille } from '../../../lib/veille-jarvis';
import { EnTete, Ic, Lien, Vue } from '../../communs';

/**
 * « Jarvis · depuis la Veille » (vague 3) · écran sans fragment de maquette,
 * composé avec le langage de l'écran Jarvis (`.jchat`, `.jm`, `.jcomp`). La
 * source (une annonce de la Veille ou une sauvegarde) est TRANSMISE à la route
 * (`veille`) · Jarvis examine le visuel à l'envoi (`preparerVeilleVisuelle`,
 * côté route). La demande est un BROUILLON visible · rien ne part sans clic, le
 * coût est dit avant. Pour « cloner », la réponse ouvre le passage vers les
 * Studios (`creerStudioDepuisJarvis`, mêmes gardes que l'ancien écran).
 */

export interface PropsJarvisVeille {
  marque: { id: string; nom: string };
  action: string;
  libelleAction: string;
  source: { annonceur: string; extrait: string };
  /** Les paramètres de l'adresse (action, ref ou annonce, rv) · transmis tels quels à la route. */
  params: Record<string, string>;
  retour: string;
  brouillon: string;
  cout: string;
}

const lignes = (t: string) => t.split('\n').map((l, i) => <Fragment key={i}>{i > 0 && <br />}{l}</Fragment>);
const PISTES_CLONER = ['Garder la composition', 'Adapter les textes', 'Choisir mon produit'];
const PISTES = ['Choisir le style visuel', 'Écrire le scénario', 'Proposer trois variantes'];

export function JarvisVeille(p: PropsJarvisVeille) {
  const [saisie, setSaisie] = useState((p.brouillon.split('\n\n')[0] ?? '').slice(0, 4000));
  const [conversation, setConversation] = useState<string | null>(null);
  const [tours, setTours] = useState<ChatTurn[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [partiel, setPartiel] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const verrou = useRef(false);

  async function envoyer(e?: FormEvent) {
    e?.preventDefault();
    const q = saisie.trim();
    if (!q || verrou.current) return;
    verrou.current = true;
    setEnCours(true); setErreur(null); setPartiel(''); setSaisie('');
    setTours((t) => [...t, { id: `local-${Date.now()}`, role: 'user', content: q, at: new Date().toISOString() }]);
    try {
      let cible = conversation;
      if (!cible) {
        const r = await creerConversationAction(p.marque.id);
        if (r.error || !r.id) { setErreur(r.error ?? 'Impossible d’ouvrir la conversation.'); setSaisie(q); return; }
        cible = r.id; setConversation(cible);
      }
      const res = await fetch('/api/jarvis/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: q, conversationId: cible, veille: p.params, brandId: p.marque.id, sources: ['fiche'] }),
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
      const r = await chatThreadAction(cible);
      if (r.thread) setTours(r.thread.turns);
    } catch {
      setErreur('La connexion s’est interrompue. Vérifie la conversation avant de réessayer.');
    } finally {
      setEnCours(false);
      verrou.current = false;
    }
  }

  const derniere = tours.at(-1);
  const proposition = derniere?.role === 'assistant' ? reponseLisible(derniere.content).texte : null;

  return (
    <Vue>
      <EnTete titre="Jarvis" sous={`${p.libelleAction} · depuis la Veille`} outils="credits" />
      <p style={{ margin: '0 0 6px' }}><Lien className="btn sm" href={p.retour}><Ic n="back" />Retour à la Veille</Lien></p>
      <section className="tile" aria-label="Source de la demande" style={{ display: 'grid', gap: 6 }}>
        <strong>{p.libelleAction} · {p.source.annonceur || 'Annonceur'}</strong>
        <p className="muted" style={{ fontSize: '13px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{p.source.extrait || 'Cette source ne contient pas de texte publicitaire.'}</p>
        <small className="faint">Texte publicitaire, pas une transcription audio. Relis et adapte la demande ci-dessous avant de l’envoyer à Jarvis.</small>
      </section>
      <section className="sec">
        <div className="tile jchat" aria-label="Conversation Jarvis">
          <header className="jch">
            <span className="orb">J</span>
            <div style={{ flex: 1, minWidth: 0, display: 'grid' }}><strong>{p.libelleAction}</strong><small className="faint">S’appuie sur : Fiche marque · la source transmise</small></div>
          </header>
          <div className="jmsgs">
            {tours.length === 0 && !enCours && (
              <div className="jm"><span className="orb">J</span><div className="jm-c"><div className="jb">
                {p.action === 'cloner'
                  ? `Conservons la composition de cette référence pour créer une version pour ${p.marque.nom}. Jarvis examinera le visuel à ton envoi et te proposera les éléments à garder et à remplacer.`
                  : `Précise ton intention. Je peux t’aider à choisir le style visuel, écrire le scénario et préparer des variantes pour ${p.marque.nom}.`}
              </div></div></div>
            )}
            {tours.map((t) => t.role === 'user'
              ? <div className="jm me" key={t.id}><div className="jb">{lignes(t.content)}</div></div>
              : <div className="jm" key={t.id}><span className="orb">J</span><div className="jm-c"><div className="jb">{lignes(reponseLisible(t.content).texte)}</div></div></div>)}
            {partiel && <div className="jm"><span className="orb">J</span><div className="jm-c"><div className="jb">{lignes(sansTiretCadratin(visibleWhileStreaming(partiel)))}</div></div></div>}
            {enCours && !partiel && <div className="jm"><span className="orb">J</span><div className="jm-c"><div className="jb jtyping"><i /><i /><i /></div></div></div>}
          </div>
          {p.action === 'cloner' && proposition && !enCours && !erreur && <VersStudio key={derniere!.id} params={p.params} brandId={p.marque.id} proposition={proposition} />}
          <form className="jcomp" onSubmit={(e) => void envoyer(e)} autoComplete="off">
            {erreur && <p className="faint" role="alert" style={{ margin: '0 0 8px', fontSize: '12.5px' }}>{erreur}</p>}
            <div className="cats" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {(p.action === 'cloner' ? PISTES_CLONER : PISTES).map((q) => (
                <button key={q} type="button" className="chip" disabled={enCours} onClick={() => setSaisie((v) => `${v}\n${q}`.slice(0, 4000))}>{q}</button>
              ))}
            </div>
            <textarea className="ta" value={saisie} onChange={(e) => setSaisie(e.target.value)} rows={4} maxLength={4000} disabled={enCours} aria-label="Ta demande à Jarvis" />
            <div className="member" style={{ marginTop: 8 }}>
              <small className="faint" style={{ fontSize: 11 }}>{p.cout}</small>
              <button className="btn pri sm" type="submit" style={{ marginLeft: 'auto' }} disabled={enCours || !saisie.trim()} title={p.cout}><Ic n="arrow" />Envoyer</button>
            </div>
          </form>
        </div>
      </section>
    </Vue>
  );
}

/**
 * Le passage vers les Studios · la proposition de Jarvis devient la direction
 * visuelle d'un projet (`creerStudioDepuisJarvis`, clé de clic idempotente).
 * Aucune génération ici · le prix de génération est annoncé dans le Studio.
 */
function VersStudio({ params, brandId, proposition }: { params: Record<string, string>; brandId: string; proposition: string }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [brief, setBrief] = useState('');
  const [kind, setKind] = useState('image');
  const [style, setStyle] = useState('');
  const [textes, setTextes] = useState('');
  const [format, setFormat] = useState('1:1');
  const [produit, setProduit] = useState('');
  const [produits, setProduits] = useState<Array<{ id: string; nom: string }>>([]);
  const [prep, setPrep] = useState('');
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');
  const [incertain, setIncertain] = useState(false);
  const cle = useRef<string | null>(null);
  const verrou = useRef(false);

  async function ouvrir() {
    setBrief(proposition); setOuvert(true);
    const source = lireEntreeJarvisVeille(params);
    if (!source) return;
    try {
      const r = await preparerCreation({ sources: [source.source], brandId });
      if (!r.ok) { setPrep(r.message); return; }
      setProduits(r.produits.map((x) => ({ id: x.id, nom: x.nom })));
    } catch { setPrep('Les produits n’ont pas pu être chargés. Tu pourras choisir le produit dans le Studio.'); }
  }
  async function creer() {
    if (verrou.current) return;
    verrou.current = true; setCharge(true); setErreur('');
    cle.current ??= crypto.randomUUID();
    try {
      const r = await creerStudioDepuisJarvis({ params, brandId, objectif: 'Créer une adaptation visuelle pour la marque cible à partir de la composition approuvée.', kind, cleClic: cle.current, productId: produit || undefined, directionVisuelle: { composition: brief, styleIntent: style, formats: [format], texts: textes.split('\n').map((t) => t.trim()).filter(Boolean) } });
      if (!r.ok) { setErreur(r.message); if ('code' in r && r.code === 'INVALID_SCHEMA') setIncertain(false); return; }
      router.push(`/studio/projets/${r.projet.id}${kind === 'image' ? '/produit' : ''}`);
    } catch { setIncertain(true); setErreur('Connexion interrompue. Réessaie avec ces mêmes choix : le Studio vérifiera si le projet a déjà été créé.'); }
    finally { verrou.current = false; setCharge(false); }
  }
  const fige = charge || incertain;
  return (
    <section className="tile" aria-label="Passer au Studio" style={{ display: 'grid', gap: 10, margin: '0 0 10px' }}>
      {!ouvert ? <button type="button" className="btn pri" onClick={() => void ouvrir()}><Ic n="brush" />Créer ce visuel</button> : (
        <>
          <label className="field">Le visuel à créer<textarea className="ta" aria-label="Composition à transmettre au Studio" value={brief} disabled={fige} onChange={(e) => setBrief(e.target.value)} rows={4} /></label>
          <small className="faint">{brief.length > 2000 ? 'La proposition est trop longue : garde uniquement la description du visuel et les textes à afficher (2 000 caractères maximum).' : 'Tu peux ajuster cette proposition avant de continuer.'}</small>
          <div className="fields">
            <label className="field">Proportions<select aria-label="Proportions" value={format} disabled={fige} onChange={(e) => setFormat(e.target.value)}>{['1:1', '4:5', '9:16', '16:9'].map((f) => <option key={f}>{f}</option>)}</select></label>
            <label className="field">Produit de ta marque<select aria-label="Produit de ta marque" value={produit} disabled={fige} onChange={(e) => setProduit(e.target.value)}><option value="">Choisir dans le Studio</option>{produits.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}</select></label>
            <label className="field">Type de création<select aria-label="Format de la création" value={kind} disabled={fige} onChange={(e) => setKind(e.target.value)}><option value="image">Image statique</option><option value="video">Vidéo</option></select></label>
          </div>
          <label className="field">Style visuel<input aria-label="Style visuel" value={style} maxLength={2000} disabled={fige} onChange={(e) => setStyle(e.target.value)} placeholder="Ex. photo lumineuse, fond crème" /></label>
          <label className="field">Textes à afficher (une ligne par texte)<textarea className="ta" aria-label="Textes à afficher" rows={3} value={textes} disabled={fige} onChange={(e) => setTextes(e.target.value)} placeholder="Accroche validée pour ta marque" /></label>
          {prep && <small role="status" className="faint">{prep}</small>}
          <small className="faint">Étape suivante : confirme la photo du produit. Jarvis préparera ensuite le visuel avec un coût annoncé, puis tu valideras le prix de génération.</small>
          <button type="button" className="btn pri" disabled={charge || !brief.trim() || brief.length > 2000} onClick={() => void creer()}>{charge ? 'Création du projet…' : kind === 'image' ? 'Continuer vers ma photo produit' : 'Ouvrir le Studio vidéo'}</button>
          {erreur && <p role="alert" style={{ fontSize: '12.5px', color: 'var(--bad)' }}>{erreur}</p>}
        </>
      )}
    </section>
  );
}
