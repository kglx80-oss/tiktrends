import type { PropositionPresentee } from '../../../lib/studios/propositions/types';
import { AvantApres } from './AvantApres';
import { PlanImpactVue } from './PlanImpactVue';
import { COULEUR_ETAT, boutonPrimaire, boutonSecondaire, carte, desactive, mini, pastille, rangee, signal, texte } from './styles';

/**
 * Une proposition · cible ET version de base en tête (« Plan 2 · version 7 »),
 * état en toutes lettres, avant/après par chemin, plan d'impact, puis les deux
 * gestes (Appliquer, Rejeter) seulement si elle est encore à trancher. Une base
 * périmée est annoncée AVANT le clic.
 */

const date = (iso: string | null) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }); } catch { return iso; }
};

export interface PropsCarte {
  p: PropositionPresentee;
  versionCouranteN: number;
  peutAgir: boolean;
  raisonSansDroit?: string;
  enCours?: 'appliquer' | 'rejeter' | null;
  onAppliquer?: (p: PropositionPresentee) => void;
  onRejeter?: (p: PropositionPresentee) => void;
}

export function CarteProposition({ p, versionCouranteN, peutAgir, raisonSansDroit, enCours, onAppliquer, onRejeter }: PropsCarte) {
  const ouverte = p.etat === 'proposed';
  const idRaison = `raison-${p.id}`;
  const bloque = !peutAgir || !!enCours;
  return (
    <article style={carte} aria-labelledby={`titre-${p.id}`} data-proposition={p.id} data-etat={p.etat}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h3 id={`titre-${p.id}`} style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{p.libelleCibleVersion}</h3>
          <p style={mini}>{p.libelleOrigine} · {date(p.creeLe)}</p>
        </div>
        <span style={pastille(COULEUR_ETAT[p.etat] ?? 'var(--line-2)')}>{p.libelleEtat}</span>
      </header>

      {p.explication && <p style={{ ...texte, whiteSpace: 'pre-wrap' }}>{p.explication}</p>}

      {ouverte && p.perimee && (
        <p role="note" style={signal('warn')}>
          Base périmée · cette proposition vise la version {p.baseVersion.n}, le projet est en version {versionCouranteN}. L’appliquer renverra un conflit · recharge puis redemande.
        </p>
      )}
      {p.etat === 'expired' && (
        <p role="note" style={signal('warn')}>Expirée{p.expireLe ? ` le ${date(p.expireLe)}` : ''} · elle ne peut plus être appliquée. Demande une nouvelle proposition sur la version courante.</p>
      )}
      {p.etat === 'approved' && p.versionAppliquee && (
        <p role="note" style={signal('ok')}>Appliquée · version {p.versionAppliquee.n} créée{p.decideLe ? ` le ${date(p.decideLe)}` : ''}. Rien n’a été généré ni débité.</p>
      )}
      {p.etat === 'rejected' && <p style={mini}>Rejetée{p.decideLe ? ` le ${date(p.decideLe)}` : ''} · rien n’a été modifié.</p>}

      <AvantApres changements={p.changements} />
      {ouverte && <PlanImpactVue impact={p.impact} />}
      {p.sources.length > 0 && <p style={mini}>Sources citées · {p.sources.join(', ')}</p>}

      {ouverte && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={rangee}>
            <button type="button" style={{ ...boutonPrimaire, ...(bloque ? desactive : {}) }} disabled={bloque} aria-busy={enCours === 'appliquer'}
              aria-describedby={!peutAgir ? idRaison : undefined} onClick={() => onAppliquer?.(p)}>
              {enCours === 'appliquer' ? 'Application…' : 'Appliquer'}
            </button>
            <button type="button" style={{ ...boutonSecondaire, ...(bloque ? desactive : {}) }} disabled={bloque} aria-busy={enCours === 'rejeter'}
              aria-describedby={!peutAgir ? idRaison : undefined} onClick={() => onRejeter?.(p)}>
              {enCours === 'rejeter' ? 'Rejet…' : 'Rejeter'}
            </button>
          </div>
          {!peutAgir && <p id={idRaison} style={mini}>{raisonSansDroit ?? 'Ton rôle permet de lire les propositions, pas de les trancher.'}</p>}
        </div>
      )}
    </article>
  );
}
