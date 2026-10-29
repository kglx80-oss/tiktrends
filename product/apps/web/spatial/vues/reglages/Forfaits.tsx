import type { ReactNode } from 'react';
import type { BoutonFormule, BoutonForfaitV2 } from '@tiktrends/core';
import { Anneau, EnTete, Ic, Lien, SousNav, Vue, formatNombre } from '../../communs';
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
  bouton: BoutonFormule | BoutonForfaitV2;
  /** Offre V2 · la période sous le prix (« / mois TTC »), à la place de « / mois HT ». */
  periode?: string;
  /** Offre V2 · ce qui est prélevé (« soit 243,60 € par an »). */
  sousPrix?: string | null;
  /** Offre V2 · la phrase de la carte, sous le nom. */
  accroche?: string;
  /** Offre V2 · ce qui est compté et refusé au-delà · une liste « Limites » distincte des « Fonctions ». */
  limites?: readonly string[];
  /** Offre V2 · « Sans engagement, annulable à tout moment », sous le bouton. */
  engagement?: string;
  /** L'étiquette de la carte mise en avant (« Populaire » aujourd'hui, « Le plus populaire » en V2). */
  etiquette?: string | null;
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
  /**
   * Offre V2 (sous `TARIFS_V2`) · la bascule mensuel / annuel, en liens (la page
   * se relit côté serveur) · absente = l'offre d'aujourd'hui, « Annuel » désactivé.
   */
  facturation?: { actuelle: 'mensuel' | 'annuel'; mensuel: string; annuel: string; remise: string } | null;
  /** Préavis de bascule d'un abonné actuel vers l'offre V2 (`preavisBascule`, sous `TARIFS_V2`) · absent sinon. */
  preavis?: { titre: string; texte: string; droits: readonly string[] } | null;
  /** Le titre de la section des cartes · « Changer de forfait » en V2, « Changer de plan » aujourd'hui. */
  titrePlans?: string;
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
    return <BoutonServeur className="btn pri" action={p.abonnement} champs={p.facturation ? { plan: f.cle, facturation: p.facturation.actuelle } : { plan: f.cle }} raison="Paiement indisponible" attente="Redirection…">{b.libelle}</BoutonServeur>;
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
      {p.preavis && (
        <section className="tile sec" data-preavis="bascule" style={{ display: 'grid', gap: 8 }}>
          <div className="sech" style={{ margin: 0 }}><span className="pill w"><Ic n="cal" />Échéance</span><h2 style={{ margin: 0 }}>{p.preavis.titre}</h2></div>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>{p.preavis.texte}</p>
          <ul style={{ margin: 0 }}>{p.preavis.droits.map((x) => <li key={x}><Ic n="check" />{x}</li>)}</ul>
        </section>
      )}
      <section className="sec">
        <div className="sech">
          <h2>{p.titrePlans ?? 'Changer de plan'}</h2>
          {p.facturation ? (
            <div className="seg" role="group" aria-label="Facturation" style={{ marginLeft: 'auto' }} data-facturation={p.facturation.actuelle}>
              <Lien href={p.facturation.mensuel} aria-current={p.facturation.actuelle === 'mensuel' ? 'page' : undefined}>Mensuel</Lien>
              <Lien href={p.facturation.annuel} aria-current={p.facturation.actuelle === 'annuel' ? 'page' : undefined}>Annuel <span className="pill g" style={{ marginLeft: 6 }}>{p.facturation.remise}</span></Lien>
            </div>
          ) : (
            <div className="seg" role="group" aria-label="Facturation" style={{ marginLeft: 'auto' }}>
              <button type="button" aria-pressed="true">Mensuel</button>
              <button type="button" aria-pressed="false" disabled title="La facturation annuelle n’est pas proposée">Annuel</button>
            </div>
          )}
        </div>
        <div className="plans">
          {p.formules.map((f) => (
            <article key={f.cle} className={`tile plan ${f.miseEnAvant && !f.actuelle ? 'rec' : ''} ${f.actuelle ? 'cur' : ''}`}>
              {f.actuelle ? <span className="pill g rectag">Plan actuel</span> : f.miseEnAvant ? <span className="pill rectag">{f.etiquette ?? 'Populaire'}</span> : null}
              <h3>{f.nom}</h3>
              {f.accroche && <small className="muted" style={{ fontSize: 12.5, marginTop: -6 }} data-accroche>{f.accroche}</small>}
              <div className="pp"><b>{f.prix}</b>{f.parMois && <small>{f.periode ?? '/ mois HT'}</small>}</div>
              {f.sousPrix && <small className="faint" style={{ fontSize: 11.5, marginTop: -4 }} data-sous-prix>{f.sousPrix}</small>}
              <div style={TAG}><span style={TAG_ICO}><Ic n="users" /></span><span style={{ display: 'grid', lineHeight: 1.2 }}><b style={{ font: '600 14px var(--sfd)' }}>{f.credits} crédits / mois</b><small className="faint" style={{ fontSize: 11 }}>partagés par toute l’équipe de l’espace</small></span></div>
              {f.radar && <div style={RADAR}><span style={RADAR_ICO}><Ic n="eye" /></span><span style={{ display: 'grid', lineHeight: 1.2 }}><b style={{ font: '600 13.5px var(--sfd)' }}>Radar &amp; Veille</b><small className="faint" style={{ fontSize: 11 }}>Inclus dans la formule</small></span></div>}
              {f.limites ? (
                <>
                  <div className="lbl" data-liste="fonctions">Fonctions</div>
                  <ul>{f.fonctions.map((x) => <li key={x}><Ic n="check" />{x}</li>)}</ul>
                  <div className="lbl" data-liste="limites">Limites</div>
                  <ul>{f.limites.map((x) => <li key={x}><Ic n="lock" />{x}</li>)}</ul>
                </>
              ) : <ul>{f.fonctions.map((x) => <li key={x}><Ic n="check" />{x}</li>)}</ul>}
              {bouton(f)}
              {f.engagement && <small className="faint" style={{ fontSize: 11.5, textAlign: 'center' }} data-engagement>{f.engagement}</small>}
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
