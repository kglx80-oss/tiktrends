'use client';

import { useId, useState, useTransition } from 'react';
import type { ChatMessage } from '@tiktrends/ai';
import { askAssistant } from '../../../app/actions/assistant';
import { Ic } from '../../communs';

/**
 * L'assistant de l'Accueil · portée de l'ancienne interface, pour le rôle que
 * l'action serveur admet (`refusAssistant` · Membre ou plus) quand Jarvis lui
 * est fermé (offre ou matrice d'équipe). Chaque question passe par l'action
 * EXISTANTE `askAssistant` (barrière de dépense `guardedAnthropic`, débit
 * atomique du barème, remboursement en cas d'échec) · le prix est dit AVANT
 * l'envoi, sous le titre. Rien n'est envoyé sans un clic.
 * Module client · il n'exporte que des composants (garde `spatial-fondation`).
 */
const CACHE: React.CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

export function AssistantAccueil({ pret, prix, suggestions }: { pret: boolean; prix: string; suggestions: readonly string[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [valeur, setValeur] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, demarrer] = useTransition();
  const champ = useId();

  function envoyer(q: string) {
    const question = q.trim();
    if (!question || enCours || !pret) return;
    setErreur('');
    const historique = messages;
    setMessages((m) => [...m, { role: 'user', content: question }]);
    setValeur('');
    demarrer(async () => {
      const r = await askAssistant(historique, question);
      if (r.error) setErreur(r.error);
      else if (r.reply) setMessages((m) => [...m, { role: 'assistant', content: r.reply! }]);
    });
  }

  return (
    <section className="sec" data-section="assistant">
      <div className="jhero jhome">
        <span className="orb">A</span>
        <h2>Demande à l’assistant</h2>
        <p className="faint" style={{ fontSize: '12.5px' }} data-prix="assistant">{pret ? prix : 'L’assistant s’active dès que la clé IA du serveur est posée · rien n’est débité d’ici là.'}</p>
        {messages.length > 0 && (
          <div className="feed" aria-live="polite" style={{ maxHeight: 340, overflowY: 'auto', textAlign: 'left' }}>
            {messages.map((m, i) => (
              <div className="it" key={i}>
                <span className="ico"><Ic n={m.role === 'user' ? 'users' : 'spark'} /></span>
                <div><p style={{ whiteSpace: 'pre-wrap' }}>{m.content}</p><small>{m.role === 'user' ? 'Toi' : 'Assistant'}</small></div>
              </div>
            ))}
            {enCours && <p className="faint" style={{ fontSize: '12.5px' }}>L’assistant réfléchit…</p>}
          </div>
        )}
        <form className="composer" autoComplete="off" onSubmit={(e) => { e.preventDefault(); envoyer(valeur); }}>
          {/* Un libellé PERSISTANT, associé au champ · le placeholder disparaît dès qu'on tape (N08). */}
          <label htmlFor={champ} style={CACHE}>Ta question à l’assistant</label>
          <input id={champ} value={valeur} onChange={(e) => setValeur(e.target.value)} disabled={!pret || enCours} placeholder={pret ? 'Pose ta question…' : 'Assistant en veille (clé IA requise)'} maxLength={4000} />
          <button className="btn pri sm" type="submit" disabled={!pret || enCours || !valeur.trim()} aria-label="Envoyer la question à l’assistant"><Ic n="arrow" /></button>
        </form>
        {erreur && <p role="alert" style={{ fontSize: '12.5px', color: 'var(--bad)' }}>{erreur}</p>}
        {messages.length === 0 && (
          <div className="cats">
            {suggestions.map((s) => <button type="button" className="chip" key={s} disabled={!pret || enCours} onClick={() => envoyer(s)}>{s}</button>)}
          </div>
        )}
      </div>
    </section>
  );
}
