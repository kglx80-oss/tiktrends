'use client';

import { useState, useTransition } from 'react';
import { Ic, Lien } from '../../communs';
import { replyTicketAction, setTicketStatusAction } from '../../../app/actions/support';

/**
 * Le poste SAV · onglets, liste, fil et réponse, sur les tickets RÉELS
 * (tables `tickets`, `ticket_messages`). Les gestes passent par les actions
 * existantes du support (`replyTicketAction`, `setTicketStatusAction`), qui
 * gardent leur règle · un ticket ne se traite que depuis SON espace. Pour un
 * autre espace, la réponse est désactivée et dit pourquoi · aucun envoi n'est
 * simulé.
 */

export interface TicketSav {
  id: string;
  onglet: 'open' | 'in_progress' | 'resolved';
  pastille: { libelle: string; classe: '' | 'r' | 'w' | 'c' };
  depuis: string;
  titre: string;
  ligne: string;
  espace: string;
  initiales: string;
  /** Rang de la teinte d'avatar (palette de la maquette). */
  teinte: number;
  numero: string;
  etat: { libelle: string; classe: '' | 'g' | 'r' };
  ouvertPar: string;
  ouvertLe: string;
  messages: ReadonlyArray<{ equipe: boolean; auteur: string; quand: string; corps: string }>;
  resolu: string | null;
  attente: { classe: 'g' | 'w' | 'r'; texte: string };
  client: { forfait: string; mrr: string; sante: { libelle: string; classe: 'g' | 'w' | 'r' }; credits: string };
  /** `null` · la réponse est possible ; sinon la raison affichée. */
  bloque: string | null;
}

/** Les teintes d'avatar de la maquette. */
const TEINTES = ['#f6c98b', '#8fd8ff', '#c4b5fd', '#7ef0b0'] as const;
const teinte = (i: number) => TEINTES[Math.abs(i) % TEINTES.length];

export function PosteSav({ onglets, tickets, reponsesTypes }: {
  onglets: ReadonlyArray<{ statut: TicketSav['onglet']; libelle: string; n: number }>;
  tickets: readonly TicketSav[];
  reponsesTypes: ReadonlyArray<{ libelle: string; texte: string }>;
}) {
  const [onglet, setOnglet] = useState<TicketSav['onglet']>(onglets.find((o) => o.n > 0)?.statut ?? 'open');
  const liste = tickets.filter((t) => t.onglet === onglet);
  const [choisi, setChoisi] = useState<string | null>(liste[0]?.id ?? null);
  const [texte, setTexte] = useState('');
  const [enCours, demarrer] = useTransition();
  const t = liste.find((x) => x.id === choisi) ?? liste[0] ?? null;

  const envoyer = () => {
    if (!t || t.bloque || !texte.trim()) return;
    const fd = new FormData(); fd.set('ticketId', t.id); fd.set('body', texte.trim());
    demarrer(() => replyTicketAction(fd));
  };
  const resoudre = () => {
    if (!t || t.bloque) return;
    const fd = new FormData(); fd.set('ticketId', t.id); fd.set('status', 'resolved');
    demarrer(() => setTicketStatusAction(fd));
  };

  return (
    <div className="sav sec">
      <section className="tile savl">
        <div className="seg" role="group" aria-label="Filtrer les tickets" style={{ width: '100%' }}>
          {onglets.map((o) => (
            <button key={o.statut} type="button" data-atf={o.statut} aria-pressed={onglet === o.statut} style={{ flex: 1 }}
              onClick={() => { setOnglet(o.statut); setChoisi(tickets.find((x) => x.onglet === o.statut)?.id ?? null); setTexte(''); }}>{o.libelle} · {o.n}</button>
          ))}
        </div>
        <div className="savlist">
          {liste.map((x) => (
            <button key={x.id} type="button" className={`savi ${t?.id === x.id ? 'on' : ''}`} data-atk={x.id} onClick={() => { setChoisi(x.id); setTexte(''); }}>
              <div className="savh"><span className={`pill ${x.pastille.classe}`}>{x.pastille.libelle}</span><small>{x.depuis}</small></div>
              <strong>{x.titre}</strong><small className="faint">{x.ligne}</small>
            </button>
          ))}
          {liste.length === 0 && <p className="faint" style={{ fontSize: '12.5px', margin: '6px 0 0' }}>Aucun ticket dans cet onglet.</p>}
        </div>
      </section>
      <section className="tile savd">
        {t ? (
          <>
            <header className="savdh">
              <span className="savav" style={{ background: teinte(t.teinte) }}>{t.initiales}</span>
              <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 4 }}>
                <div className="kc"><span className={`pill ${t.pastille.classe}`}>{t.pastille.libelle}</span><span className={`pill ${t.etat.classe}`}>{t.etat.libelle}</span><span className="faint" style={{ fontSize: 12 }}>{t.numero} · {t.depuis}</span></div>
                <h2 style={{ margin: '2px 0 0' }}>{t.titre}</h2>
                <small className="faint">{t.espace} · ouvert par {t.ouvertPar}</small>
              </div>
              <div className="kc">
                {t.onglet !== 'resolved' && !t.bloque && <button className="btn sm pri" type="button" disabled={enCours} onClick={resoudre}><Ic n="check" />Résoudre</button>}
              </div>
            </header>
            <div className="savsla"><div className="savslab"><i className={t.attente.classe} style={{ width: '100%' }} /></div><span>{t.attente.texte}</span></div>
            <div className="savbody">
              <div className="savconv">
                <div className="savsys">Ticket ouvert par {t.ouvertPar} · {t.ouvertLe}</div>
                {t.messages.map((m, i) => m.equipe ? (
                  <div className="savmsg a" key={i}><div className="savbub"><small>{m.auteur} · {m.quand}</small><p>{m.corps}</p></div><span className="savav sm" style={{ background: 'linear-gradient(135deg,var(--acc),var(--acc2))', color: 'var(--on)' }}>T</span></div>
                ) : (
                  <div className="savmsg c" key={i}><span className="savav sm" style={{ background: teinte(t.teinte) }}>{t.initiales}</span><div className="savbub"><small>{m.auteur} · {m.quand}</small><p>{m.corps}</p></div></div>
                ))}
                {t.resolu && <div className="savsys g"><Ic n="check" />{t.resolu}</div>}
              </div>
              <aside className="savctx">
                <div className="savcard">
                  <span className="lbl" style={{ margin: 0 }}>Client</span>
                  <div className="savkv"><span>Forfait</span><b>{t.client.forfait}</b><span>MRR</span><b>{t.client.mrr}</b><span>Signaux</span><b><span className={`pill ${t.client.sante.classe}`}>{t.client.sante.libelle}</span></b><span>Crédits utilisés</span><b>{t.client.credits}</b></div>
                  <Lien className="btn sm" href="/admin/signups" style={{ justifyContent: 'center' }}><Ic n="eye" />Voir les comptes</Lien>
                </div>
              </aside>
            </div>
            <div className="savr">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="seg" role="group" aria-label="Type de message"><button type="button" aria-pressed="true">Répondre</button></div>
                <div className="kc" style={{ marginLeft: 'auto' }}>
                  {reponsesTypes.map((r) => <button key={r.libelle} type="button" className="chip" disabled={!!t.bloque} onClick={() => setTexte(r.texte)}>{r.libelle}</button>)}
                </div>
              </div>
              <textarea id="areply" className="" value={texte} disabled={!!t.bloque || enCours} onChange={(e) => setTexte(e.target.value)}
                placeholder={t.bloque ?? `Répondre à ${t.espace}…`} aria-label={`Réponse au ticket ${t.numero}`} />
              <div className="kc">
                <button className="btn pri sm" type="button" style={{ marginLeft: 'auto' }} disabled={!!t.bloque || enCours || !texte.trim()} onClick={envoyer}><Ic n="arrow" />{enCours ? 'Envoi…' : 'Envoyer'}</button>
              </div>
            </div>
          </>
        ) : (
          <p className="faint" style={{ fontSize: '12.5px', margin: 0 }}>Aucun ticket à afficher.</p>
        )}
      </section>
    </div>
  );
}
