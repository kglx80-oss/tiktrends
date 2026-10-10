import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { CAPACITES_STUDIOS, CIBLE_TACTILE_MIN, DEFINITIONS_CAPACITES, EXPERIENCES_TOUJOURS_ACTIVES, type DecisionCapacite, type SourceDecision } from '@tiktrends/core';
import type { LigneEspaceInterrupteurs, VueInterrupteurs } from '../../../../lib/studios/interrupteurs';
import { h1 } from '../../../../components/ui';
import { FormulaireBudgetEssai, FormulaireEspace } from './Formulaire';

/**
 * ADMIN · « Interrupteurs Studios » · présentation seule (rendue telle quelle
 * dans les tests). La page (`page.tsx`) pose la garde plateforme et lit l'état.
 *
 * Le statut est toujours ÉCRIT (« Active », « Coupée ») avec sa source : la
 * couleur n'en porte aucun seul.
 */

const bloc: CSSProperties = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: '16px 18px', boxSizing: 'border-box', minWidth: 0, marginBottom: 14 };
const carte: CSSProperties = { background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 14px', boxSizing: 'border-box', minWidth: 0, display: 'grid', gap: 6 };
const titreBloc: CSSProperties = { margin: '0 0 10px', fontSize: 17, fontWeight: 600, color: 'var(--ink)' };
const texte: CSSProperties = { margin: 0, fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55, overflowWrap: 'anywhere' };
const mono: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 12.5, overflowWrap: 'anywhere' };
const grille = (min: number): CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))`, gap: 10 });
const lien: CSSProperties = { display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, padding: '0 14px', borderRadius: 999, border: '1px solid var(--line-2)', color: 'var(--ink)', fontWeight: 700, fontSize: 13, textDecoration: 'none' };

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

function Etat({ d }: { d: DecisionCapacite }) {
  return (
    <span data-active={d.active ? 'oui' : 'non'} data-source={d.source} style={{ fontSize: 12.5, fontWeight: 700, color: d.active ? 'var(--ok, #3fb97a)' : 'var(--ink-2)' }}>
      {d.active ? 'Active' : 'Coupée'} <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· {LIBELLES_SOURCE[d.source]}</span>
    </span>
  );
}

function Bloc({ titre, id, children }: { titre: string; id: string; children: ReactNode }) {
  return <section aria-labelledby={id} style={bloc}><h2 id={id} style={titreBloc}>{titre}</h2>{children}</section>;
}

export function EnTeteInterrupteurs({ retour = { href: '/admin', libelle: '← Tableau de bord' } }: { retour?: { href: string; libelle: string } }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={h1}>Interrupteurs Studios</h1>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: 'var(--on-accent)', background: 'var(--grad-accent)' }}>ADMIN+</span>
        <Link href={retour.href} style={{ ...lien, marginLeft: 'auto' }}>{retour.libelle}</Link>
      </div>
      <p style={{ ...texte, marginTop: 6, maxWidth: 760, fontSize: 14 }}>
        Chaque capacité des nouveaux Studios s’ouvre en trois temps · interne, espaces pilotes, puis tous après recette. Ce qui dépend d’un fournisseur non validé en réel est coupé par défaut. Cet espace d’administration n’est jamais coupé.
      </p>
    </div>
  );
}

/** Budget d'essai d'un espace, sérialisable pour l'écran (montants en dollars). */
export interface BudgetEssaiAffiche { plafondUsd: number; depuis: string; engageUsd: number; restantUsd: number; motif: string }

const usd = (n: number) => `${n.toFixed(2).replace('.', ',')} $`;

/**
 * Budget d'ESSAI de l'espace · ce que la barrière vérifie avant chaque appel
 * payant de cet espace (site et worker), en plus du plafond global.
 */
export function BlocBudgetEssai({ budget, workspaceId, nom, peutEcrire }: { budget: BudgetEssaiAffiche | null; workspaceId: string; nom: string; peutEcrire: boolean }) {
  return (
    <div style={{ ...carte, marginTop: 14 }} data-budget-essai={budget ? 'pose' : 'absent'}>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Budget d’essai de l’espace</span>
      {budget ? (
        <p style={texte} data-budget-restant={budget.restantUsd.toFixed(2)}>
          <strong style={{ color: 'var(--ink)' }}>{usd(budget.engageUsd)} engagés sur {usd(budget.plafondUsd)}</strong> · reste {usd(budget.restantUsd)} · cumul depuis le {new Date(budget.depuis).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}, toutes dépenses IA de l’espace comprises (réservations incertaines au maximum). Motif · {budget.motif || '·'}
        </p>
      ) : (
        <p style={texte}>Aucun budget d’essai · seul le plafond global de l’application borne la dépense de cet espace.</p>
      )}
      {peutEcrire && <FormulaireBudgetEssai workspaceId={workspaceId} nom={nom} plafondActuel={budget?.plafondUsd ?? null} />}
    </div>
  );
}

export function EcranInterrupteurs({ vue, detail, peutEcrire, recherche, budget = null }: { vue: VueInterrupteurs; detail: LigneEspaceInterrupteurs | null; peutEcrire: boolean; recherche: string; budget?: BudgetEssaiAffiche | null }) {
  return (
    <div>
      <Bloc titre="Capacités et état général" id="capacites">
        <div style={grille(260)}>
          {CAPACITES_STUDIOS.map((c) => {
            const d = DEFINITIONS_CAPACITES[c];
            return (
              <div key={c} style={carte} data-capacite={c}>
                <strong style={{ fontSize: 14, color: 'var(--ink)' }}>{d.libelle}</strong>
                <p style={texte}>{d.couvre}.</p>
                <p style={{ ...texte, fontSize: 12.5 }}>{d.maturite === 'complete' ? 'Complète · allumée par défaut' : `En recette · coupée par défaut (${d.raison})`} · portée {d.portee === 'espace' ? 'espace' : 'plateforme'}</p>
                <Etat d={vue.global[c]} />
              </div>
            );
          })}
        </div>
        <p style={{ ...texte, marginTop: 10, fontSize: 12.5 }}>Jamais coupés : {EXPERIENCES_TOUJOURS_ACTIVES.map((x) => ({ admin_ia_studios: 'ADMIN IA et Studios' })[x]).join(', ')}.</p>
      </Bloc>

      <Bloc titre="Environnement du serveur" id="environnement">
        <p style={texte}>Lu à chaque geste par le serveur, au démarrage par le worker. Il se change dans le fichier d’environnement du déploiement, pas ici.</p>
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 6 }}>
          {vue.env.map((v) => (
            <li key={v.nom} style={{ ...texte, display: 'flex', gap: 8, flexWrap: 'wrap' }} data-env={v.nom}>
              <code style={mono}>{v.nom}</code>
              <span>{v.valeurs.length ? v.valeurs.join(', ') : 'non posée'}</span>
              {v.inconnues.length > 0 && <span role="alert" style={{ color: 'var(--err)' }}>· ignorées (inconnues) : {v.inconnues.join(', ')}</span>}
            </li>
          ))}
        </ul>
      </Bloc>

      {detail && (
        <Bloc titre={`Espace · ${detail.nom}`} id="detail-espace">
          <p style={{ ...texte, marginBottom: 10 }}><code style={mono}>{detail.id}</code> · offre {detail.plan}{detail.pilote ? ' · espace pilote (environnement)' : ''}</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, ...grille(240) }}>
            {CAPACITES_STUDIOS.map((c) => (
              <li key={c} style={carte} data-detail-capacite={c}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{DEFINITIONS_CAPACITES[c].libelle}</span>
                <Etat d={detail.decisions[c]} />
              </li>
            ))}
          </ul>
          {peutEcrire
            ? <FormulaireEspace workspaceId={detail.id} nom={detail.nom} actives={detail.reglages.actives} coupees={detail.reglages.coupees} />
            : <p style={{ ...texte, marginTop: 10 }}>Lecture seule · le réglage d’un espace demande la permission de configuration des fournisseurs.</p>}
          <BlocBudgetEssai budget={budget} workspaceId={detail.id} nom={detail.nom} peutEcrire={peutEcrire} />
        </Bloc>
      )}

      <Bloc titre="Espaces" id="espaces">
        <form method="get" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <label style={{ display: 'grid', gap: 4, flex: '1 1 240px' }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Chercher un espace (nom ou identifiant)</span>
            <input name="q" defaultValue={recherche} style={{ minHeight: CIBLE_TACTILE_MIN, fontSize: 16, padding: '0 12px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink)' }} />
          </label>
          <button type="submit" style={{ ...lien, background: 'transparent', cursor: 'pointer' }}>Chercher</button>
        </form>
        {vue.espaces.length === 0
          ? <p style={texte} data-etat="vide">Aucun espace ne correspond.</p>
          : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, ...grille(280) }}>
              {vue.espaces.map((w) => {
                const ecarts = CAPACITES_STUDIOS.filter((c) => w.decisions[c].source !== 'defaut');
                return (
                  <li key={w.id} style={carte} data-espace={w.id}>
                    <strong style={{ fontSize: 14, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{w.nom}</strong>
                    <span style={{ ...texte, fontSize: 12.5 }}>offre {w.plan}{w.pilote ? ' · pilote' : ''}{w.regle ? ' · réglé' : ''}</span>
                    <p style={{ ...texte, fontSize: 12.5 }}>
                      {ecarts.length
                        ? ecarts.map((c) => `${DEFINITIONS_CAPACITES[c].libelle} · ${w.decisions[c].active ? 'active' : 'coupée'}`).join(' ; ')
                        : 'Défauts seulement · nouveautés en recette coupées.'}
                    </p>
                    <Link href={`/admin/studios-interrupteurs?espace=${w.id}#detail-espace`} style={{ ...lien, width: 'fit-content' }}>Voir et régler</Link>
                  </li>
                );
              })}
            </ul>
          )}
        {vue.total > vue.espaces.length && <p style={{ ...texte, marginTop: 10, fontSize: 12.5 }}>{vue.espaces.length} espaces affichés sur {vue.total} · affine la recherche.</p>}
      </Bloc>
    </div>
  );
}

