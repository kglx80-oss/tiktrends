import type { ReactNode } from 'react';
import { EnTete, Ic, SousNav, Vue } from '../../communs';
import { AnnonceRetour } from '../marque/interactifs';
import { BoutonsConnexion, type ActionsConnexionDrive, type ActionsConnexionMeta, type ActionsConnexionShopify } from './interactifs';
import { LOGOS_CONNEXION } from './logos';

/**
 * « Connexions » · `docs/spatial/reference/connexions.html` (maquette : `vConn`).
 * PRÉSENTATIONNEL · l'état vient de `getConnectionState` / `getDriveState` (la
 * marque ACTIVE · les connexions sont par marque), les gestes des actions de
 * `app/actions/connections.ts` et `app/actions/drive.ts`. Dropbox n'a aucun
 * connecteur · sa carte le dit, fermée. Aucun connecteur nouveau n'est créé.
 */

export type CleConnexionSpatiale = 'meta' | 'shopify' | 'gdrive' | 'dropbox';

export interface CarteConnexionVue {
  cle: CleConnexionSpatiale;
  groupe: string;
  nom: string;
  description: string;
  connecte: boolean;
  /** La ligne d'état d'un outil connecté (« boutique · synchronisé le … »). */
  resume: string | null;
  /** Meta non connecté · « Étape 1 » de la maquette. */
  etape1: boolean;
}

export interface PropsConnexions {
  sousNav: ReadonlyArray<{ href: string; libelle: ReactNode }>;
  /** La marque active · `null` sans marque active (tout est fermé, la bannière le dit). */
  marque: string | null;
  cartes: readonly CarteConnexionVue[];
  /** Les outils RÉELLEMENT branchables (Dropbox exclu). */
  branchables: number;
  meta: ActionsConnexionMeta;
  shopify: ActionsConnexionShopify;
  drive: ActionsConnexionDrive;
  retours: Record<string, string>;
}

export function Connexions(p: PropsConnexions) {
  const n = p.cartes.filter((c) => c.connecte).length;
  const metaOk = p.cartes.find((c) => c.cle === 'meta')?.connecte ?? false;
  const raison = p.marque ? null : 'Choisis une marque active · chaque marque a ses propres comptes';
  return (
    <Vue>
      <EnTete titre="Connexions" sous="Branche tes outils une fois : tout remonte seul" />
      <SousNav items={p.sousNav} actif="/connections" />
      {!p.marque
        ? <div className="banner"><Ic n="warn" /><span>Choisis une marque active dans le sélecteur de marque : Meta, Shopify et Google Drive se branchent marque par marque.</span></div>
        : !metaOk && <div className="banner"><Ic n="warn" /><span>Première étape : connecte Meta Ads. Sans mesures importées, un lot ne peut pas être conclu et aucune itération ne peut partir d’un gagnant.</span></div>}
      <div className="sech" style={{ marginTop: 6 }}><h2>Tes outils{p.marque ? ` · ${p.marque}` : ''}</h2><span className="faint" style={{ fontSize: '12.5px' }}>{n} sur {p.branchables} connecté{n > 1 ? 's' : ''} · accès en lecture seule, révocable à tout moment</span></div>
      <div className="connx">
        {p.cartes.map((c) => (
          <article className={`tile cx ${c.connecte ? 'on' : ''}`} key={c.cle}>
            <div className="cx-h">
              <span className="applogo" style={{ width: 42, height: 42 }}><span style={{ width: 30, height: 30, display: 'block' }} dangerouslySetInnerHTML={{ __html: LOGOS_CONNEXION[c.cle] }} /></span>
              <div className="cx-t"><span className="lbl">{c.groupe}</span><h3>{c.nom}</h3></div>
              {c.connecte ? <span className="pill g"><Ic n="check" />Connecté</span> : c.etape1 ? <span className="pill w">Étape 1</span> : null}
            </div>
            <p className="muted">{c.description}</p>
            {c.connecte && c.resume && <div className="cx-s"><Ic n="loop" /><span>{c.resume}</span></div>}
            <BoutonsConnexion cle={c.cle} nom={c.nom} connecte={c.connecte} raison={raison} meta={p.meta} shopify={p.shopify} drive={p.drive} />
          </article>
        ))}
      </div>
      <AnnonceRetour messages={p.retours} />
    </Vue>
  );
}
