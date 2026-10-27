'use client';

import { useState } from 'react';
import { DUREES_PARTAGE, echeancePartage } from '@tiktrends/core';
import { createShareLinkAction, revokeShareLinkAction, type ShareLink } from '../../../app/actions/adsmap-share';
import { EnTete, Ic, SousNav, Vue } from '../../communs';
import { useSpatial } from '../../coquille/contexte';
import { useGeste, Retour } from './geste';
import type { SousNavResultats } from './communs';

/**
 * « Partager au client » · les liens de partage de l'ancienne Adsmap (panneau
 * « Partager au client »). Une page en lecture seule, sans compte, qui montre ce
 * qui a été testé et ce qui a gagné, en marque blanche. Créer, copier, révoquer
 * passent par les actions existantes (`adsmap-share`, réservées aux admins) ·
 * une échéance est toujours posée.
 */

export interface PropsPartage {
  sousNav: SousNavResultats;
  sous: string;
  liens: readonly ShareLink[];
  erreur: string | null;
}

export function Partage(p: PropsPartage) {
  const { occupe, message, geste } = useGeste();
  const { toast } = useSpatial();
  const [jours, setJours] = useState(90);
  const adresse = (t: string) => `${window.location.origin}/c/${t}`;
  return (
    <Vue>
      <EnTete titre="Partager au client" sous={p.sous} />
      <SousNav items={p.sousNav} actif="/adsmap" />
      <section className="tile sec">
        <div className="lbl">Ce qui part, et ce qui ne part pas</div>
        <p style={{ fontSize: '13px' }}>Une page en lecture seule, sans compte à créer. Le client y voit <b>ce qui a été testé et ce qui a gagné</b>.</p>
        <ul className="check2">
          <li><span className="cb ok"><Ic n="check" /></span><span>Aucune dépense, aucun coût par achat, aucun budget · ta marge se lit dans ces colonnes.</span><span /></li>
          <li><span className="cb ok"><Ic n="check" /></span><span>Aucune hypothèse, aucun apprentissage · c’est ta méthode, c’est ce qu’il paie.</span><span /></li>
          <li><span className="cb ok"><Ic n="check" /></span><span>Aucun test en cours · seuls les verdicts que tu as arbitrés apparaissent.</span><span /></li>
        </ul>
        <div className="foot2" style={{ marginTop: 12 }}>
          <div className="seg" role="group" aria-label="Durée de validité">
            {DUREES_PARTAGE.map(([j, l]) => <button type="button" key={j} aria-pressed={jours === j} onClick={() => setJours(j)}>{l}</button>)}
          </div>
          <button type="button" className="btn sm pri" disabled={!!occupe} onClick={() => { void geste('creer', () => createShareLinkAction(jours), () => 'Lien créé · copie-le pour le client'); }}>
            <Ic n="plus" />{occupe === 'creer' ? 'Création…' : 'Créer un lien'}
          </button>
          <small>Une échéance est toujours posée · un lien sans date traîne dans un fil de messages et finit par montrer à un ancien client ce que tu fais aujourd’hui.</small>
        </div>
        <Retour message={message} />
      </section>
      <div className="sech sec"><h2>Liens</h2></div>
      {p.erreur ? (
        <section className="tile"><p role="alert" className="muted">{p.erreur}</p></section>
      ) : p.liens.length === 0 ? (
        <section className="tile"><p className="muted">Aucun lien actif · crée le premier ci-dessus pour partager tes créas gagnantes en marque blanche, sans jamais donner accès à l’outil.</p></section>
      ) : (
        <div className="mtable">
          <div className="mrow h" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr) auto' }}><span>Lien</span><span>Échéance</span><span /></div>
          {p.liens.map((l) => (
            <div className="mrow" key={l.id} style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr) auto' }}>
              <code style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>/c/{l.token}</code>
              <span className={l.expired ? 'pill r' : 'faint'} style={{ justifySelf: 'start' }}>{echeancePartage(l)}</span>
              <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                {!l.expired && (
                  <button type="button" className="btn sm" onClick={() => { navigator.clipboard?.writeText(adresse(l.token)).then(() => toast('Lien copié'), () => toast('Copie impossible ici · sélectionne le lien à la main')); }}><Ic n="copy" />Copier</button>
                )}
                <button type="button" className="btn sm" disabled={!!occupe} onClick={() => { void geste(`revoquer-${l.id}`, () => revokeShareLinkAction(l.id), () => 'Lien révoqué · il ne s’ouvre plus'); }}>Révoquer</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </Vue>
  );
}
