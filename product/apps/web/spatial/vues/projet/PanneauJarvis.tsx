'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CIBLE_CONCEPT, demandeProposition, texteTourJarvis, verrouAction, visibleWhileStreaming, sansTiretCadratin, type ConceptActionKey } from '@tiktrends/core';
import { chatThreadAction } from '../../../app/actions/jarvis-chat';
import { proposerPatch } from '../../../app/actions/studios/propositions';
import { useSpatial } from '../../coquille/contexte';
import { Ic } from '../../communs';
import { Ad, Message } from './briques';
import { boutonAction, replacerFocus } from './action-serveur';
import { useNaviguer } from './naviguer';
import type { ActionConceptSpatiale, PropsJarvisProjet } from './types';

/**
 * Le panneau Jarvis du projet (`aside.tile.jpanel` de la maquette).
 *
 *  · le message · la DERNIÈRE réponse de Jarvis dans le fil LIÉ au projet
 *    (`chatThreadAction({ projectId })`, lu côté serveur), ou l'invitation ;
 *  · la suggestion · la première proposition OUVERTE du projet, à relire et
 *    trancher dans l'onglet Brief (rien n'est appliqué d'ici) ;
 *  · les puces · « Écrire à Jarvis » (ouvre le fil et le champ) puis les
 *    actions TYPÉES du concept (`actionsConceptResolues`, noyau) · une action
 *    payante ouvre d'abord sa confirmation, avec le coût maximal annoncé ;
 *    l'appel ne part qu'au second clic, par `proposerPatch` (garde + barrière).
 *
 * L'envoi d'un message passe par la MÊME route que Jarvis (`/api/jarvis/chat`,
 * barrière de dépense) avec `projectId` · il ne tombe jamais dans le fil
 * principal de la marque.
 */

type Confirmation = ActionConceptSpatiale | null;

export function PanneauJarvis(p: PropsJarvisProjet & { ouvrirBrief: () => void }) {
  const router = useRouter();
  const naviguer = useNaviguer();
  const { toast } = useSpatial();
  const [ouvert, setOuvert] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [tours, setTours] = useState(p.fil?.tours ?? []);
  const [conversationId, setConversationId] = useState(p.fil?.conversationId ?? null);
  const [erreur, setErreur] = useState<string | null>(p.erreurFil);
  const [retour, setRetour] = useState<{ ton: 'ok' | 'err'; texte: string; horsLigne?: boolean } | null>(null);
  // Une erreur du fil sans réponse du serveur · rien n'a été refusé, la pastille dit « Hors ligne ».
  const [filHorsLigne, setFilHorsLigne] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [partiel, setPartiel] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);
  const verrou = useRef(verrouAction());
  const fil = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => { fil.current?.scrollTo?.({ top: fil.current.scrollHeight }); }, [tours.length, partiel, ouvert]);

  const relireFil = useCallback(async () => {
    const r = await chatThreadAction({ projectId: p.projectId });
    if (r.error) { setErreur(r.error); return; }
    setErreur(null);
    const t = r.thread;
    setTours(t ? t.turns.map((x) => ({ id: x.id, role: x.role, texte: x.role === 'assistant' ? texteTourJarvis(x.content) : x.content })) : []);
    setConversationId(t?.conversationId ?? null);
  }, [p.projectId]);

  async function envoyer() {
    const q = saisie.trim();
    if (!q || enCours || !verrou.current.tenter()) return;
    setSaisie(''); setEnCours('message'); setPartiel(''); setErreur(null); setFilHorsLigne(false);
    setTours((t) => [...t, { id: `local-${Date.now()}`, role: 'user', texte: q }]);
    try {
      const res = await fetch('/api/jarvis/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: q, conversationId, projectId: p.projectId }),
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
      await relireFil();
    } catch {
      setErreur('La connexion s’est interrompue. Ton message est enregistré, réessaie.'); setFilHorsLigne(true);
    } finally {
      setEnCours(null);
      verrou.current.relacher();
    }
  }

  async function lancer(a: ActionConceptSpatiale) {
    if (!p.versionCourante || a.genre !== 'proposition' || !a.cible) return;
    setEnCours(a.cle); setRetour(null);
    let recues = 0;
    try {
      for (let i = 0; i < a.cible.nombre; i += 1) {
        const demande = demandeProposition(a.cle as ConceptActionKey, i);
        if (!demande) continue;
        const r = await proposerPatch({ projectId: p.projectId, baseVersionId: p.versionCourante.id, cible: CIBLE_CONCEPT, demande, allowedPaths: [a.cible.chemin] });
        if (!r.ok) { setRetour({ ton: 'err', texte: `${r.message}${r.traceId ? ` · identifiant support ${r.traceId}` : ''}` }); break; }
        if (r.statut === 'questions') { setRetour({ ton: 'err', texte: `Jarvis a besoin d’une précision · ${r.questions.join(' · ')}. Rien n’a été enregistré.` }); break; }
        recues += 1;
      }
      if (recues > 0) {
        // La confirmation disparaît avec le bouton pressé · le focus revient à la puce qui l'avait ouverte.
        setConfirmation(null);
        replacerFocus('toujours', `[data-puce="${a.cle}"]`);
        const t = recues === 1 ? 'Proposition reçue · relis-la dans l’onglet Brief. Rien n’est appliqué sans ton geste.' : `${recues} propositions reçues · départage-les dans l’onglet Brief. Rien n’est appliqué sans ton geste.`;
        setRetour({ ton: 'ok', texte: t });
        toast(t);
        router.refresh();
      }
    } catch {
      setRetour({ ton: 'err', texte: 'La réponse a été interrompue · le résultat de la demande est inconnu. Recharge la page avant toute nouvelle demande.', horsLigne: true });
    } finally {
      setEnCours(null);
    }
  }

  const surPuce = (a: ActionConceptSpatiale) => {
    setRetour(null);
    if (a.genre === 'preparation') { if (p.preparerHref) naviguer(p.preparerHref); return; }
    setOuvert(false);
    setConfirmation((c) => (c?.cle === a.cle ? null : a));
  };

  /** Une puce fermée · pour sa raison (état, préparation sans adresse), ou parce qu'une demande part. */
  const fermee = (a: ActionConceptSpatiale) => a.etat !== 'actif' || (a.genre === 'preparation' && !p.preparerHref);
  // Les raisons des puces inactives, dites en clair (une par raison), chacune reliée à ses puces (`aria-describedby`).
  const raisons = [...new Set(p.actions.filter((a) => a.etat !== 'actif' && a.raison).map((a) => a.raison!))];
  const idRaison = (r: string | null) => (r && raisons.includes(r) ? `${id}-raison-${raisons.indexOf(r)}` : undefined);
  const idFil = `${id}-fil-ferme`;
  const annuler = (cle: string) => { setConfirmation(null); replacerFocus('toujours', `[data-puce="${cle}"]`); };

  return (
    <aside className="tile jpanel" aria-label="Jarvis dans ce projet">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {/* L'orbe est un décor · le nom « Jarvis » est écrit juste à côté. */}
        <span className="orb" aria-hidden="true" style={{ width: 34, height: 34, fontSize: '12.5px' }}>J</span>
        <div><strong>Jarvis</strong><p className="faint" style={{ fontSize: '11.5px' }}>{p.sousTitre}</p></div>
      </div>
      <p style={{ fontSize: 13 }}>{p.message}</p>
      {p.suggestion && (
        <div className="sugg">
          <span className="lbl">Proposition · à valider</span>
          {p.suggestion.apercu && <Ad src={p.suggestion.apercu.src} bandeau={p.suggestion.apercu.bandeau} />}
          <p style={{ fontSize: '12.5px' }}>{p.suggestion.texte}</p>
          {/* L'onglet change et ce panneau disparaît · le focus passe à la tuile des propositions, jamais au document. */}
          <button className="btn pri sm" type="button" onClick={() => {
            p.ouvrirBrief();
            setTimeout(() => { const t = document.getElementById('propositions'); t?.scrollIntoView?.({ block: 'start' }); t?.focus({ preventScroll: true }); }, 0);
          }}>
            <Ic n="loop" />Relire et décider
          </button>
        </div>
      )}
      {/* Une puce fermée reste FOCALISABLE (`aria-disabled`, atténuée par la feuille, clic ignoré) · sa raison est écrite dessous. */}
      <div className="kc">
        <button type="button" className="chip" data-puce="ecrire" aria-pressed={ouvert} aria-disabled={!p.conversationOuverte || undefined}
          aria-describedby={!p.conversationOuverte && p.erreurFil ? idFil : undefined} title={p.conversationOuverte ? p.mentionConversation : undefined}
          onClick={() => { if (!p.conversationOuverte) return; setConfirmation(null); setOuvert((o) => !o); }}>Écrire à Jarvis</button>
        {p.actions.map((a) => (
          <button key={a.cle} type="button" className="chip" data-puce={a.cle} aria-pressed={confirmation?.cle === a.cle}
            {...boutonAction({ presse: enCours === a.cle, occupe: !!enCours, ferme: fermee(a), focalisable: 'tout', aspect: 'feuille', surClic: () => surPuce(a) })}
            aria-describedby={a.etat !== 'actif' ? idRaison(a.raison) : undefined} title={fermee(a) ? undefined : a.effet}>{enCours === a.cle ? 'Jarvis prépare…' : a.libelle}</button>
        ))}
      </div>

      {!p.conversationOuverte && p.erreurFil && <p className="faint" id={idFil} data-raison-ferme="ecrire" style={{ fontSize: '11.5px' }}>{p.erreurFil}</p>}
      {raisons.map((r) => <p key={r} id={idRaison(r)} className="faint" style={{ fontSize: '11.5px' }}>{r}</p>)}

      {confirmation && (
        <div className="sugg" data-confirmation={confirmation.cle}>
          <span className="lbl">{confirmation.libelle}</span>
          <p style={{ fontSize: '12.5px' }}>{confirmation.effet}</p>
          {p.mentionCout && <p className="faint" style={{ fontSize: '11.5px' }} data-cout>{p.mentionCout}{confirmation.cible && confirmation.cible.nombre > 1 ? ` · ${confirmation.cible.nombre} appels` : ''}</p>}
          <div className="kc">
            {/* Pendant la demande, « Lancer » garde le focus (`aria-disabled`, `aria-busy`) et ignore un second clic. */}
            <button className="btn pri sm" type="button" data-geste="lancer-demande"
              {...boutonAction({ presse: !!enCours, surClic: () => void lancer(confirmation) })}><Ic n="spark" />{enCours ? 'Jarvis prépare…' : 'Lancer la demande'}</button>
            <button className="btn sm" type="button" {...boutonAction({ occupe: !!enCours })} onClick={() => annuler(confirmation.cle)}>Annuler</button>
          </div>
        </div>
      )}
      {retour && <Message ton={retour.ton} horsLigne={retour.horsLigne}>{retour.texte}</Message>}

      {ouvert && (
        <div style={{ display: 'grid', gap: 10 }} data-fil="projet">
          <div ref={fil} style={{ display: 'grid', gap: 10, maxHeight: '46vh', overflowY: 'auto' }}>
            {tours.length === 0 && !partiel && <p className="faint" style={{ fontSize: '12.5px' }}>Décris ce que tu veux créer pour {p.marque || 'ta marque'} · Jarvis t’aide à cadrer le concept, chaque proposition reste à valider.</p>}
            {tours.map((t) => <div key={t.id} className={`msg ${t.role === 'user' ? 'me' : ''}`}><div className="bub" style={{ fontSize: 13 }}>{t.texte}</div></div>)}
            {partiel && <div className="msg"><div className="bub" style={{ fontSize: 13 }}>{sansTiretCadratin(visibleWhileStreaming(partiel))}</div></div>}
            {enCours === 'message' && !partiel && <p className="faint" style={{ fontSize: '12.5px' }}>Jarvis relit ta marque…</p>}
          </div>
          {erreur && <Message ton="err" horsLigne={filHorsLigne}>{erreur}</Message>}
          {/* Pendant l'envoi, le champ passe en lecture seule (pas `disabled`) · Entrée ne fait pas tomber le focus au document. */}
          <textarea className="ta" value={saisie} rows={2} readOnly={enCours === 'message'} aria-busy={enCours === 'message' || undefined} aria-label="Écrire à Jarvis sur ce projet" placeholder={`Continue le concept pour ${p.marque || 'ta marque'}…`}
            onChange={(e) => setSaisie(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void envoyer(); } }} />
          <div className="kc">
            {/* « Envoyer » vidé par l'envoi reste focalisable (`aria-disabled`) · `envoyer` ignore un clic sans texte ou pendant l'envoi. */}
            <button className="btn pri sm" type="button" data-geste="envoyer"
              {...boutonAction({ presse: enCours === 'message', occupe: !!enCours, ferme: !saisie.trim(), focalisable: 'tout', surClic: () => void envoyer() })}><Ic n="arrow" />{enCours === 'message' ? 'Envoi…' : 'Envoyer'}</button>
          </div>
          <p className="faint" style={{ fontSize: '11.5px' }} data-cout-message>{p.mentionConversation}</p>
        </div>
      )}
    </aside>
  );
}
