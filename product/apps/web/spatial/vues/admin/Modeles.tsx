import { Vue } from '../../communs';
import { Pill, TeteAdmin, Vide, type BandeauAdmin } from './base';
import { identiteFournisseur } from './fournisseurs';

/**
 * « Modèles IA connectés » · `docs/spatial/reference/a-modeles.html`. PRÉSENTATIONNEL.
 *
 * Réel · les modèles APPELÉS sur 30 jours (`ai_spend`), leur coût, leur poste
 * principal, leur latence et leur taux d'échec quand les exécutions de prompts
 * les mesurent (`studio_prompt_runs`), la présence des clés sur le serveur.
 * L'interrupteur montre l'état (appelé ou en veille) · il ne se bascule pas :
 * l'activation d'un modèle se règle dans le code et sur le serveur. Sans
 * source · ordre de secours, ajout d'un modèle, rotation et renouvellement des
 * clés (posées par le propriétaire dans `.env.deploy`).
 */
export interface PropsModeles {
  bandeau: BandeauAdmin;
  legende: string;
  modeles: ReadonlyArray<{ id: string; fournisseur: string; nom: string; actif: boolean; poste: string; latence: string; echecs: string; cout: string }>;
  cles: ReadonlyArray<{ nom: string; etat: string; detail: string }>;
}

export function Modeles(p: PropsModeles) {
  return (
    <Vue>
      <TeteAdmin titre="Modèles IA connectés" sous="modèles" actif="/admin/ia-studios" bandeau={p.bandeau} />
      <section className="tile">
        <div className="sech"><h2>Modèles et rôles</h2><span className="faint" style={{ fontSize: '12.5px' }}>{p.legende}</span></div>
        <div className="amods">
          {p.modeles.map((m) => {
            const id = identiteFournisseur(m.fournisseur);
            return (
              <article key={m.id} className={`tile amod ${m.actif ? 'on' : ''}`}>
                <div className="amh">
                  <span className="alogo" style={{ width: 42, height: 42, background: id.fond, color: '#fff', font: '700 16px/1 var(--sfd)' }}>{id.lettre}</span>
                  <div style={{ flex: 1, minWidth: 0 }}><strong>{m.nom}</strong><small className="faint" style={{ display: 'block' }}>{id.societe}</small></div>
                  <button className="tg" type="button" role="switch" aria-checked={m.actif} aria-label={`${m.nom} · ${m.actif ? 'appelé sur 30 jours' : 'en veille'}`} title="État lu · l’activation se règle sur le serveur" disabled><i /></button>
                </div>
                <p className="muted">{m.poste}</p>
                <div className="amst"><span><small>Latence</small><b>{m.latence}</b></span><span><small>Échecs</small><b>{m.echecs}</b></span><span><small>Coût · 30 j</small><b>{m.cout}</b></span></div>
                <Pill c={m.actif ? 'g' : ''}>{m.actif ? 'Actif' : 'En veille'}</Pill>
              </article>
            );
          })}
          {p.modeles.length === 0 && <Vide>Aucun modèle n’a été appelé sur les 30 derniers jours.</Vide>}
        </div>
      </section>
      <section className="tile sec">
        <div className="sech"><h2>Clés API</h2></div>
        <div className="atable">
          {p.cles.map((c) => (
            <div className="atr" key={c.nom} style={{ gridTemplateColumns: '1.2fr 1.2fr 1fr auto' }}><span><b>{c.nom}</b></span><span className="mono faint">{c.etat}</span><span className="faint">{c.detail}</span><span /></div>
          ))}
        </div>
      </section>
    </Vue>
  );
}

