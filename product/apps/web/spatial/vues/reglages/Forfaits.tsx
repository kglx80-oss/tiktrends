import type { ReactNode } from 'react';
import type { BoutonFormule } from '@tiktrends/core';
import { Anneau, EnTete, Ic, SousNav, Vue, formatNombre } from '../../communs';
import { AnnonceRetour, BoutonServeur } from '../marque/interactifs';
import { RechargeCredits, type PackVue } from './interactifs';

/**
 * « Forfaits & crédits » · `docs/spatial/reference/forfaits.html` (maquette :
 * `vForfaits`). PRÉSENTATIONNEL · les formules, prix et crédits sont ceux de
 * l'application (`lib/rbac.ts`), les packs ceux de `lib/credit-packs.ts`, les
 * boutons ceux de l'écran V5 (Stripe Checkout, portail, recharge). Aucune
 * offre, aucun prix, aucun droit n'est décidé ici.
 */

type ActionFormulaire = (fd: FormData) => Promise<void>;

export interface FormuleVue {
  cle: string;
  nom: string;
  prix: string;
  /** « / mois HT » sous le prix · absent pour une formule gratuite. */
  parMois: boolean;
  credits: string;
  fonctions: readonly string[];
  /** La formule donne-t-elle la Veille et le Radar (descriptif de l'offre) ? */
  radar: boolean;
  actuelle: boolean;
  miseEnAvant: boolean;
  bouton: BoutonFormule;
}

export interface PropsForfaits {
  sousNav: ReadonlyArray<{ href: string; libelle: ReactNode }>;
  plan: { nom: string; dotation: number; solde: number; illimite: boolean; part: number };
  rythme: { parJour: number; jours: number | null; suffisant: boolean };
  formules: readonly FormuleVue[];
  portail: ActionFormulaire | null;
  abonnement: ActionFormulaire | null;
  packs: readonly PackVue[];
  acheter: ActionFormulaire | null;
  raisonAchat: string | null;
  faq: ReadonlyArray<{ question: string; reponse: string }>;
  retours: Record<string, string>;
}

const TAG = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', margin: '2px 0 4px', borderRadius: 14, background: 'color-mix(in srgb,var(--acc) 14%,#ffffff08)', border: '1px solid color-mix(in srgb,var(--acc) 35%,transparent)' } as const;
const TAG_ICO = { display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 10, background: 'linear-gradient(135deg,var(--acc),var(--acc2))', color: 'var(--on)', flex: 'none' } as const;
const RADAR = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', margin: '0 0 4px', borderRadius: 14, background: 'linear-gradient(120deg,#ffd48a2e,#ff9f6e14)', border: '1px solid #ffd48a66' } as const;
const RADAR_ICO = { display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 10, background: 'linear-gradient(135deg,#ffd48a,#ff9f6e)', color: '#2a1a00', flex: 'none' } as const;

export function Forfaits(p: PropsForfaits) {
  const r = p.rythme;
  const bouton = (f: FormuleVue) => {
    const b = f.bouton;
    if (b.type === 'desactive') return <button className="btn" type="button" disabled>{b.libelle}</button>;
    if (b.type === 'portail') return <BoutonServeur className={`btn ${b.primaire ? 'pri' : ''}`.trim()} action={p.portail} raison="Paiement indisponible" attente="Ouverture…">{b.libelle}</BoutonServeur>;
    return <BoutonServeur className="btn pri" action={p.abonnement} champs={{ plan: f.cle }} raison="Paiement indisponible" attente="Redirection…">{b.libelle}</BoutonServeur>;
  };
  return (
    <Vue>
      <EnTete titre="Forfaits & crédits" sous="Plus de crédits, plus de variantes testées" />
      <SousNav items={p.sousNav} actif="/billing" />
      <section className="tile planhero">
        <div className="bhead">
          <Anneau part={p.plan.part} taille={88} libelle={p.plan.illimite ? '∞' : formatNombre(p.plan.solde)} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="lbl">Ton plan</div>
            <h2 style={{ margin: '2px 0 4px' }}>{p.plan.nom} · {formatNombre(p.plan.dotation)} crédits / mois</h2>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              {p.plan.illimite ? 'Crédits illimités sur ce compte.'
                : r.jours === null ? 'Aucune consommation sur les 30 derniers jours.'
                  : <>Au rythme actuel (≈ {formatNombre(r.parJour)} crédit{r.parJour > 1 ? 's' : ''} par jour), il te reste <b style={{ color: 'var(--fg)' }}>{formatNombre(r.jours)} jour{r.jours > 1 ? 's' : ''}</b> de crédits.</>}
            </p>
          </div>
          {p.plan.illimite || r.suffisant
            ? <span className="pill g"><Ic n="check" />Crédits suffisants</span>
            : <span className="pill w"><Ic n="warn" />Crédits bientôt épuisés</span>}
        </div>
      </section>
      <section className="sec">
        <div className="sech">
          <h2>Changer de plan</h2>
          <div className="seg" role="group" aria-label="Facturation" style={{ marginLeft: 'auto' }}>
            <button type="button" aria-pressed="true">Mensuel</button>
            <button type="button" aria-pressed="false" disabled title="La facturation annuelle n’est pas proposée">Annuel</button>
          </div>
        </div>
        <div className="plans">
          {p.formules.map((f) => (
            <article key={f.cle} className={`tile plan ${f.miseEnAvant && !f.actuelle ? 'rec' : ''} ${f.actuelle ? 'cur' : ''}`}>
              {f.actuelle ? <span className="pill g rectag">Plan actuel</span> : f.miseEnAvant ? <span className="pill rectag">Populaire</span> : null}
              <h3>{f.nom}</h3>
              <div className="pp"><b>{f.prix}</b>{f.parMois && <small>/ mois HT</small>}</div>
              <div style={TAG}><span style={TAG_ICO}><Ic n="users" /></span><span style={{ display: 'grid', lineHeight: 1.2 }}><b style={{ font: '600 14px var(--sfd)' }}>{f.credits} crédits / mois</b><small className="faint" style={{ fontSize: 11 }}>partagés par toute l’équipe de l’espace</small></span></div>
              {f.radar && <div style={RADAR}><span style={RADAR_ICO}><Ic n="eye" /></span><span style={{ display: 'grid', lineHeight: 1.2 }}><b style={{ font: '600 13.5px var(--sfd)' }}>Radar &amp; Veille</b><small className="faint" style={{ fontSize: 11 }}>Inclus dans la formule</small></span></div>}
              <ul>{f.fonctions.map((x) => <li key={x}><Ic n="check" />{x}</li>)}</ul>
              {bouton(f)}
            </article>
          ))}
        </div>
      </section>
      <section className="sec">
        <div className="sech"><h2>Recharger des crédits</h2><span className="faint" style={{ fontSize: '12.5px' }}>Sans changer de plan · les crédits achetés restent après le renouvellement</span></div>
        <RechargeCredits packs={p.packs} acheter={p.acheter} raison={p.raisonAchat} />
      </section>
      <section className="sec grid3 faq">
        {p.faq.map((q) => (
          <div className="tile" key={q.question}><h3 style={{ fontSize: 14, margin: '0 0 6px' }}>{q.question}</h3><p className="muted" style={{ fontSize: '12.5px', margin: 0 }}>{q.reponse}</p></div>
        ))}
      </section>
      <AnnonceRetour messages={p.retours} />
    </Vue>
  );
}
