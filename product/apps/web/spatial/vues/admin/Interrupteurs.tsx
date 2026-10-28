import { CAPACITES_STUDIOS, DEFINITIONS_CAPACITES, EXPERIENCES_TOUJOURS_ACTIVES, type DecisionCapacite, type SourceDecision } from '@tiktrends/core';
import type { LigneEspaceInterrupteurs, VueInterrupteurs } from '../../../lib/studios/interrupteurs';
import { Lien, Vue } from '../../communs';
import { Pill, TeteAdmin, Vide, type BandeauAdmin } from './base';
import { ReglageBudgetEssai, ReglageEspace } from './interrupteurs-client';

/**
 * « Interrupteurs Studios » · ancien `/admin/studios-interrupteurs` (F1, cahier
 * 01 §14). PRÉSENTATIONNEL · l'état des interrupteurs tel que le serveur et le
 * worker le décident (environnement, décision générale par capacité, par
 * espace), puis le réglage d'un espace. Le statut est toujours ÉCRIT
 * (« Active », « Coupée ») avec sa source · la couleur n'en porte aucun seul.
 */
export const LIBELLES_SOURCE: Readonly<Record<SourceDecision, string>> = {
  toujours: 'toujours active',
  inconnue: 'capacité inconnue',
  coupure_globale: 'coupée partout (environnement)',
  coupure_espace: 'coupée pour cet espace (réglage plateforme)',
  generalisation: 'généralisée (environnement)',
  pilote_env: 'espace pilote (environnement)',
  pilote_espace: 'espace pilote (réglage plateforme)',
  defaut: 'défaut',
};

/** Budget d'essai d'un espace, sérialisable pour l'écran (montants en dollars). */
export interface BudgetEssaiAffiche { plafondUsd: number; depuis: string; engageUsd: number; restantUsd: number; motif: string }

export interface PropsInterrupteurs {
  bandeau: BandeauAdmin;
  vue: VueInterrupteurs;
  detail: LigneEspaceInterrupteurs | null;
  budget: BudgetEssaiAffiche | null;
  peutEcrire: boolean;
  recherche: string;
}

const usd = (n: number) => `${n.toFixed(2).replace('.', ',')} $`;
const CHEMIN = '/admin/studios-interrupteurs';

function Etat({ d }: { d: DecisionCapacite }) {
  return <span data-active={d.active ? 'oui' : 'non'} data-source={d.source}><Pill c={d.active ? 'g' : ''}>{d.active ? 'Active' : 'Coupée'}</Pill><small className="faint"> · {LIBELLES_SOURCE[d.source]}</small></span>;
}

export function Interrupteurs({ bandeau, vue, detail, budget, peutEcrire, recherche }: PropsInterrupteurs) {
  return (
    <Vue>
      <TeteAdmin titre="Interrupteurs Studios" sous="interrupteurs" actif={CHEMIN} bandeau={bandeau} />
      <p className="muted" style={{ margin: '0 0 14px', fontSize: '12.5px' }}>Chaque capacité des Studios s’ouvre en trois temps · interne, espaces pilotes, puis tous après recette. Ce qui dépend d’un fournisseur non validé en réel est coupé par défaut. L’administration n’est jamais coupée.</p>
      <section className="tile" id="capacites">
        <div className="sech"><h2>Capacités et état général</h2></div>
        <div className="atable">
          {CAPACITES_STUDIOS.map((c) => {
            const d = DEFINITIONS_CAPACITES[c];
            return (
              <div className="atr" key={c} data-capacite={c} style={{ gridTemplateColumns: '1.4fr 1.2fr' }}>
                <span style={{ whiteSpace: 'normal' }}><b>{d.libelle}</b><small className="faint" style={{ display: 'block' }}>{d.couvre}. {d.maturite === 'complete' ? 'Complète · allumée par défaut' : `En recette · coupée par défaut (${d.raison})`} · portée {d.portee === 'espace' ? 'espace' : 'plateforme'}</small></span>
                <span><Etat d={vue.global[c]} /></span>
              </div>
            );
          })}
        </div>
        <small className="faint" style={{ display: 'block', marginTop: 10 }}>Jamais coupés · {EXPERIENCES_TOUJOURS_ACTIVES.map((x) => ({ admin_ia_studios: 'administration IA et Studios' })[x]).join(', ')}.</small>
      </section>
      <section className="tile sec" id="environnement">
        <div className="sech"><h2>Environnement du serveur</h2><Pill>Lecture seule</Pill></div>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: '12.5px' }}>Lu à chaque geste par le serveur, au démarrage par le worker. Il se change dans le fichier d’environnement du déploiement, pas ici.</p>
        <div className="atable">
          {vue.env.map((v) => (
            <div className="atr" key={v.nom} data-env={v.nom} style={{ gridTemplateColumns: '1fr 1.4fr' }}>
              <span className="mono">{v.nom}</span>
              <span style={{ whiteSpace: 'normal' }}>{v.valeurs.length ? v.valeurs.join(', ') : 'non posée'}{v.inconnues.length > 0 && <> <Pill c="r">ignorées (inconnues) · {v.inconnues.join(', ')}</Pill></>}</span>
            </div>
          ))}
        </div>
      </section>
      {detail && (
        <section className="tile sec" id="detail-espace">
          <div className="sech"><h2>Espace · {detail.nom}</h2><span className="faint mono" style={{ fontSize: 12 }}>{detail.id}</span></div>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: '12.5px' }}>Offre {detail.plan}{detail.pilote ? ' · espace pilote (environnement)' : ''}</p>
          <div className="atable">
            {CAPACITES_STUDIOS.map((c) => <div className="atr" key={c} data-detail-capacite={c} style={{ gridTemplateColumns: '1.4fr 1.2fr' }}><span><b>{DEFINITIONS_CAPACITES[c].libelle}</b></span><span><Etat d={detail.decisions[c]} /></span></div>)}
          </div>
          {peutEcrire
            ? <ReglageEspace workspaceId={detail.id} nom={detail.nom} actives={detail.reglages.actives} coupees={detail.reglages.coupees} />
            : <p className="faint" style={{ margin: '10px 0 0', fontSize: 12 }}>Lecture seule · le réglage d’un espace demande la permission de configuration des fournisseurs.</p>}
          <div className="tile sec" data-budget-essai={budget ? 'pose' : 'absent'} style={{ background: 'var(--glass3)' }}>
            <div className="sech"><h2 style={{ fontSize: 15 }}>Budget d’essai de l’espace</h2></div>
            {budget
              ? <p className="muted" style={{ margin: 0, fontSize: '12.5px' }} data-budget-restant={budget.restantUsd.toFixed(2)}><b>{usd(budget.engageUsd)} engagés sur {usd(budget.plafondUsd)}</b> · reste {usd(budget.restantUsd)} · cumul depuis le {new Date(budget.depuis).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}, toutes dépenses IA de l’espace comprises (réservations incertaines au maximum). Motif · {budget.motif || '·'}</p>
              : <p className="muted" style={{ margin: 0, fontSize: '12.5px' }}>Aucun budget d’essai · seul le plafond global de l’application borne la dépense de cet espace.</p>}
            {peutEcrire && <ReglageBudgetEssai workspaceId={detail.id} nom={detail.nom} plafondActuel={budget?.plafondUsd ?? null} />}
          </div>
        </section>
      )}
      <section className="tile sec" id="espaces">
        <div className="sech"><h2>Espaces</h2>{vue.total > vue.espaces.length && <span className="faint" style={{ fontSize: '12.5px' }}>{vue.espaces.length} affichés sur {vue.total} · affine la recherche</span>}</div>
        <form method="get" action={CHEMIN} className="kc" style={{ alignItems: 'center', marginBottom: 12 }}>
          <label className="jsearch" style={{ flex: '1 1 240px' }}><input name="q" defaultValue={recherche} placeholder="Chercher un espace (nom ou identifiant)" aria-label="Chercher un espace (nom ou identifiant)" /></label>
          <button className="btn sm" type="submit">Chercher</button>
        </form>
        <div className="atable">
          {vue.espaces.map((w) => {
            const ecarts = CAPACITES_STUDIOS.filter((c) => w.decisions[c].source !== 'defaut');
            return (
              <div className="atr" key={w.id} data-espace={w.id} style={{ gridTemplateColumns: '1.1fr 1.8fr auto' }}>
                <span><b>{w.nom}</b><small className="faint" style={{ display: 'block' }}>offre {w.plan}{w.pilote ? ' · pilote' : ''}{w.regle ? ' · réglé' : ''}</small></span>
                <span className="muted" style={{ whiteSpace: 'normal', fontSize: 12 }}>{ecarts.length ? ecarts.map((c) => `${DEFINITIONS_CAPACITES[c].libelle} · ${w.decisions[c].active ? 'active' : 'coupée'}`).join(' ; ') : 'Défauts seulement · nouveautés en recette coupées.'}</span>
                <span><Lien className="btn sm" href={`${CHEMIN}?espace=${w.id}#detail-espace`}>Voir et régler</Lien></span>
              </div>
            );
          })}
          {vue.espaces.length === 0 && <Vide>Aucun espace ne correspond.</Vide>}
        </div>
      </section>
    </Vue>
  );
}
