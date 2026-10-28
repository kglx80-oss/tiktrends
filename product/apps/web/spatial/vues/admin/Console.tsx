import { updatePlanConfigAction } from '../../../app/actions/platform';
import { grantTestPackAction, revokeTrialAction } from '../../../app/actions/beta';
import { Lien, Vue } from '../../communs';
import { Barre, Kpis, Pill, TeteAdmin, Vide, type BandeauAdmin, type ClassePill, type KpiAdmin } from './base';

/**
 * « Console » · l'ancienne console ADMIN+ (`/console`), portée dans la section.
 * PRÉSENTATIONNEL. Le diagnostic du déploiement (ce que le serveur exécute
 * vraiment), la vue plateforme du fondateur (indicateurs, espaces, tarifs et
 * allocations · `updatePlanConfigAction`), les comptes de test et beta
 * (`grantTestPackAction`, `revokeTrialAction`), puis l'espace du fondateur.
 * Les actions sont celles qui existaient · chacune repose la garde fondateur
 * et redirige ici avec son message. Aucune offre, aucun prix n'est créé ·
 * le formulaire des tarifs règle les valeurs existantes des formules du code.
 */
export interface PropsConsole {
  bandeau: BandeauAdmin;
  message: { ok: boolean; texte: string } | null;
  deploiement: { etat: { libelle: string; c: ClassePill }; resume: string; cases: ReadonlyArray<{ k: string; v: string }> };
  plateforme: {
    kpis: readonly KpiAdmin[];
    repartition: ReadonlyArray<{ libelle: string; prix: string; n: number; part: number; mrr: string }>;
    espaces: ReadonlyArray<{ id: string; nom: string; formule: string; membres: number; credits: string; actif: boolean; creeLe: string }>;
    tarifs: ReadonlyArray<{ cle: string; libelle: string; prix: number; credits: number }>;
  };
  essais: {
    espaces: ReadonlyArray<{ id: string; nom: string }>;
    creditsDefaut: number;
    joursDefaut: number;
    lignes: ReadonlyArray<{ id: string; nom: string; type: string; formule: string; credits: string; essai: { texte: string; c: ClassePill }; coupable: boolean }>;
  };
  espace: {
    nom: string;
    kpis: readonly KpiAdmin[];
    roles: ReadonlyArray<{ libelle: string; n: number }>;
    membres: ReadonlyArray<{ email: string; nom: string; role: string; inscrit: string; tickets: number; nouveau: boolean }>;
    tickets: ReadonlyArray<{ id: string; titre: string; statut: string; auteur: string; le: string }>;
  };
}

const COL_E = '1.4fr .8fr .6fr .8fr .8fr .8fr';
const COL_B = '1.3fr .7fr .8fr .8fr .9fr auto';
const COL_M = '1.6fr .9fr .8fr .5fr .7fr';

export function Console(p: PropsConsole) {
  return (
    <Vue>
      <TeteAdmin titre="Console" sous="console plateforme" actif="/console" bandeau={p.bandeau} />
      {p.message && <p role={p.message.ok ? 'status' : 'alert'} className={`pill ${p.message.ok ? 'g' : 'r'}`} style={{ margin: '0 0 14px', whiteSpace: 'normal' }}>{p.message.texte}</p>}
      <section className="tile" data-console="deploiement">
        <div className="sech"><h2>Diagnostic du déploiement</h2><Pill c={p.deploiement.etat.c}>{p.deploiement.etat.libelle}</Pill></div>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: '12.5px' }}>{p.deploiement.resume}</p>
        <div className="akpis">{p.deploiement.cases.map((c) => <div className="tile akpi" key={c.k}><span className="lbl">{c.k}</span><b style={{ fontSize: 15, overflowWrap: 'anywhere' }}>{c.v}</b></div>)}</div>
        <small className="faint" style={{ display: 'block', marginTop: 10 }}>Compare ce commit à origin/main pour savoir si le correctif attendu est en ligne · un écart explique un défaut « déjà corrigé » qui persiste en production.</small>
      </section>

      <section className="sec" data-console="plateforme">
        <Kpis items={p.plateforme.kpis} />
        <div className="agrid2 sec">
          <section className="tile">
            <div className="sech"><h2>Répartition par abonnement</h2></div>
            <div className="atable">
              {p.plateforme.repartition.map((r) => (
                <div className="atr" key={r.libelle} style={{ gridTemplateColumns: '1fr 1.4fr .9fr' }}><span><b>{r.libelle}</b><small className="faint" style={{ display: 'block' }}>{r.prix} / mois</small></span><span><Barre part={r.part} /></span><span>{r.n} · {r.mrr}</span></div>
              ))}
            </div>
          </section>
          <section className="tile">
            <div className="sech"><h2>Tarifs & allocations par formule</h2><Pill c="w">Fondateur</Pill></div>
            <p className="muted" style={{ margin: '0 0 10px', fontSize: '12.5px' }}>Les valeurs des formules existantes · le MRR et la répartition se recalculent dessus. Les abonnés actuels gardent leur prix Stripe.</p>
            <form action={updatePlanConfigAction} style={{ display: 'grid', gap: 10 }} data-console="tarifs">
              <div className="atable">
                <div className="atr ath" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}><span>Formule</span><span>Tarif € / mois</span><span>Crédits / mois</span></div>
                {p.plateforme.tarifs.map((t) => (
                  <div className="atr" key={t.cle} style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                    <span><b>{t.libelle}</b></span>
                    <span className="field"><input name={`price_${t.cle}`} defaultValue={t.prix} inputMode="numeric" aria-label={`Tarif ${t.libelle}`} /></span>
                    <span className="field"><input name={`credits_${t.cle}`} defaultValue={t.credits} inputMode="numeric" aria-label={`Crédits ${t.libelle}`} /></span>
                  </div>
                ))}
              </div>
              <div className="kc"><button className="btn sm pri" type="submit">Enregistrer les tarifs</button></div>
            </form>
          </section>
        </div>
        <section className="tile sec">
          <div className="sech"><h2>Tous les espaces</h2><span className="faint" style={{ fontSize: '12.5px' }}>{p.plateforme.espaces.length}</span></div>
          <div className="atable">
            <div className="atr ath" style={{ gridTemplateColumns: COL_E }}><span>Espace</span><span>Formule</span><span>Membres</span><span>Crédits</span><span>Activité</span><span>Créé</span></div>
            {p.plateforme.espaces.map((e) => (
              <div className="atr" key={e.id} style={{ gridTemplateColumns: COL_E }}><span><b>{e.nom}</b></span><span>{e.formule}</span><span>{e.membres}</span><span>{e.credits}</span><span><Pill c={e.actif ? 'g' : 'w'}>{e.actif ? 'Actif' : 'Inactif 30 j'}</Pill></span><span className="faint">{e.creeLe}</span></div>
            ))}
            {p.plateforme.espaces.length === 0 && <Vide>Aucun espace.</Vide>}
          </div>
        </section>
      </section>

      <section className="tile sec" data-console="essais">
        <div className="sech"><h2>Comptes de test & beta</h2></div>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: '12.5px' }}>Provisionne les premiers accès (membres, staff, beta testeurs) · des crédits de test valables une période donnée. À l’échéance, l’accès se coupe en un clic.</p>
        <form action={grantTestPackAction} className="fields" style={{ alignItems: 'end', marginBottom: 14 }} data-console="accorder">
          <label className="field">Espace<select name="workspaceId">{p.essais.espaces.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}</select></label>
          <label className="field">Crédits de test<input name="credits" type="number" defaultValue={p.essais.creditsDefaut} /></label>
          <label className="field">Durée (jours)<input name="days" type="number" defaultValue={p.essais.joursDefaut} /></label>
          <label className="field">Type<select name="kind" defaultValue="beta"><option value="beta">Beta testeur</option><option value="staff">Staff</option><option value="normal">Normal</option></select></label>
          <div className="kc"><button className="btn sm pri" type="submit">Accorder</button></div>
        </form>
        <div className="atable">
          <div className="atr ath" style={{ gridTemplateColumns: COL_B }}><span>Espace</span><span>Type</span><span>Formule</span><span>Crédits</span><span>Essai</span><span /></div>
          {p.essais.lignes.map((l) => (
            <div className="atr" key={l.id} style={{ gridTemplateColumns: COL_B }}>
              <span><b>{l.nom}</b></span><span>{l.type}</span><span>{l.formule}</span><span>{l.credits}</span><span><Pill c={l.essai.c}>{l.essai.texte}</Pill></span>
              <span>{l.coupable && <form action={revokeTrialAction}><input type="hidden" name="workspaceId" value={l.id} /><button className="btn sm" type="submit" aria-label={`Couper l’essai de ${l.nom}`}>Couper</button></form>}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="sec" data-console="espace">
        <div className="sech"><h2>Ton espace · {p.espace.nom}</h2></div>
        <Kpis items={p.espace.kpis} />
        <div className="kc sec">
          <Lien className="btn sm" href="/credits">Gestion des crédits</Lien>
          <Lien className="btn sm" href="/support">Gestion des tickets</Lien>
          <Lien className="btn sm" href="/team">Équipe & rôles</Lien>
          <Lien className="btn sm" href="/settings">Réglages & intégrations</Lien>
        </div>
        <div className="agrid2 sec">
          <section className="tile">
            <div className="sech"><h2>Équipes & accès</h2><span className="faint" style={{ fontSize: '12.5px' }}>{p.espace.roles.map((r) => `${r.libelle} ${r.n}`).join(' · ')}</span></div>
            <div className="atable">
              <div className="atr ath" style={{ gridTemplateColumns: COL_M }}><span>Personne</span><span>Rôle</span><span>Inscrit</span><span>Tickets</span><span>Statut</span></div>
              {p.espace.membres.map((m) => (
                <div className="atr" key={m.email} style={{ gridTemplateColumns: COL_M }}><span><b>{m.nom}</b><small className="faint" style={{ display: 'block' }}>{m.email}</small></span><span>{m.role}</span><span className="faint">{m.inscrit}</span><span>{m.tickets}</span><span><Pill c={m.nouveau ? 'c' : 'g'}>{m.nouveau ? 'Nouveau' : 'Actif'}</Pill></span></div>
              ))}
            </div>
          </section>
          <section className="tile">
            <div className="sech"><h2>Derniers tickets</h2><Lien className="faint" href="/support" style={{ marginLeft: 'auto', fontSize: 12 }}>Support</Lien></div>
            <div className="atable">
              {p.espace.tickets.map((t) => (
                <div className="atr" key={t.id} style={{ gridTemplateColumns: '1.6fr auto' }}><span><Lien href={`/support/${t.id}`}><b>{t.titre}</b></Lien><small className="faint" style={{ display: 'block' }}>{t.auteur} · {t.le}</small></span><span><Pill>{t.statut}</Pill></span></div>
              ))}
              {p.espace.tickets.length === 0 && <Vide>Aucun ticket.</Vide>}
            </div>
          </section>
        </div>
      </section>
    </Vue>
  );
}
