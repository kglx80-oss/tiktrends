import { Ic, Vue } from '../../communs';
import { Pill, TeteAdmin, Vide, type BandeauAdmin } from './base';
import { VerifierStripe } from './paiements-client';

/**
 * « Stripe & Whop » · `docs/spatial/reference/a-paiements.html`. PRÉSENTATIONNEL.
 *
 * Réel · Stripe (configuration, abonnés actifs, MRR, défauts de paiement,
 * derniers webhooks reçus, rapprochement formule ↔ abonnement), le diagnostic
 * existant de la chaîne. Whop · aucune intégration dans l'outil · la carte le
 * dit. Sans source · relances de paiement (gérées par Stripe), virements,
 * correction automatique d'un écart.
 */
const STRIPE = <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z" /></svg>;
const LogoStripe = ({ s }: { s: number }) => <span className="alogo" style={{ width: s, height: s, background: '#635bff' }}><span style={{ width: Math.round(s * 0.5), height: Math.round(s * 0.5), display: 'block' }}>{STRIPE}</span></span>;
const LogoWhop = ({ s }: { s: number }) => <span className="alogo" style={{ width: s, height: s, background: '#ff6243', color: '#fff', font: `800 ${Math.round(s * 0.3)}px/1 var(--sfd)`, letterSpacing: '-.04em' }}>whop</span>;

export interface CartePaiement {
  cle: 'stripe' | 'whop';
  nom: string;
  sous: string;
  connecte: boolean;
  etat: string;
  stats: ReadonlyArray<{ libelle: string; valeur: string }>;
  note: string;
  /** Tableau de bord du prestataire (lien externe) · `null` sans intégration. */
  ouvrir: string | null;
  verifier: boolean;
}

export interface PropsPaiements {
  bandeau: BandeauAdmin;
  cartes: readonly CartePaiement[];
  defauts: { legende: string; lignes: ReadonlyArray<{ id: string; nom: string; forfait: string; prix: string; motif: string; statut: string; lien: string | null }> };
  webhooks: { etat: { libelle: string; classe: '' | 'g' | 'w' }; lignes: ReadonlyArray<{ id: string; type: string; quand: string }> };
  rapprochement: { lignes: ReadonlyArray<{ libelle: string; valeur: string; etat: { libelle: string; classe: '' | 'g' | 'w' } }>; ecarts: readonly string[] };
}

export function Paiements(p: PropsPaiements) {
  return (
    <Vue>
      <TeteAdmin titre="Stripe & Whop" sous="paiements" actif="/admin/paiement" bandeau={p.bandeau} />
      <div className="agrid2">
        {p.cartes.map((c) => (
          <section className="tile apay" key={c.cle}>
            <div className="amh">
              {c.cle === 'stripe' ? <LogoStripe s={52} /> : <LogoWhop s={52} />}
              <div style={{ flex: 1, minWidth: 0 }}><strong style={{ font: '600 17.5px var(--sfd)' }}>{c.nom}</strong><small className="faint" style={{ display: 'block' }}>{c.sous}</small></div>
              <span className={`pill ${c.connecte ? 'g' : ''}`}>{c.connecte && <Ic n="check" />}{c.etat}</span>
            </div>
            <div className="amst">{c.stats.map((s) => <span key={s.libelle}><small>{s.libelle}</small><b>{s.valeur}</b></span>)}</div>
            <p className="muted" style={{ margin: 0, fontSize: '12.5px' }}>{c.note}</p>
            {(c.ouvrir || c.verifier) && (
              <div className="kc">
                {c.ouvrir && <a className="btn sm" href={c.ouvrir} target="_blank" rel="noopener noreferrer">Ouvrir {c.nom}</a>}
                {c.verifier && <VerifierStripe />}
              </div>
            )}
          </section>
        ))}
      </div>
      <section className="tile sec">
        <div className="sech"><h2>Paiements en défaut</h2><span className="faint" style={{ fontSize: '12.5px' }}>{p.defauts.legende}</span></div>
        <div className="atable" id="afail">
          {p.defauts.lignes.map((l) => (
            <div className="atr" key={l.id} style={{ gridTemplateColumns: 'auto 1.2fr 1fr .8fr 1.4fr 1fr auto' }}>
              <span><LogoStripe s={26} /></span><span><b>{l.nom}</b></span><span>{l.forfait}</span><span>{l.prix}</span><span className="faint">{l.motif}</span>
              <span><Pill c="w">{l.statut}</Pill></span>
              <span>{l.lien ? <a className="btn sm pri" href={l.lien} target="_blank" rel="noopener noreferrer">Ouvrir dans Stripe</a> : null}</span>
            </div>
          ))}
          {p.defauts.lignes.length === 0 && <Vide>Aucun abonnement en défaut de paiement · Stripe relance lui-même les cartes refusées.</Vide>}
        </div>
      </section>
      <div className="agrid2 sec">
        <section className="tile">
          <div className="sech"><h2>Webhooks reçus</h2><Pill c={p.webhooks.etat.classe}>{p.webhooks.etat.libelle}</Pill></div>
          <div className="atable">
            {p.webhooks.lignes.map((w) => (
              <div className="atr" key={w.id} style={{ gridTemplateColumns: 'auto 1.8fr 1fr auto' }}><span><LogoStripe s={24} /></span><span className="mono">{w.type}</span><span className="faint">{w.quand}</span><span className="pulse" /></div>
            ))}
            {p.webhooks.lignes.length === 0 && <Vide>Aucun événement Stripe reçu pour l’instant.</Vide>}
          </div>
        </section>
        <section className="tile">
          <div className="sech"><h2>Rapprochement</h2></div>
          <div className="atable">
            {p.rapprochement.lignes.map((r) => (
              <div className="atr" key={r.libelle} style={{ gridTemplateColumns: '1.4fr 1fr 1fr' }}><span><b>{r.libelle}</b></span><span>{r.valeur}</span><span><Pill c={r.etat.classe}>{r.etat.libelle}</Pill></span></div>
            ))}
          </div>
          {p.rapprochement.ecarts.length > 0 && <Vide>En écart (formule payante sans abonnement Stripe actif) · {p.rapprochement.ecarts.join(', ')}.</Vide>}
        </section>
      </div>
    </Vue>
  );
}
