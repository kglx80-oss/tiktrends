'use client';

import { useRef, useState, useTransition, type CSSProperties } from 'react';
import {
  LONGUEUR_MAX_NOM_VUE_VEILLE, PLAFOND_VUES_VEILLE, adresseVueVeille, confirmationSuppressionVueVeille, fermetureNouvelleVueVeille, libellesVueVeille, paramsVueVeille, verrouAction,
  type CriteresVeille, type VueVeilleEnregistree,
} from '@tiktrends/core';
import { garderVueVeille, renommerVueVeilleAction, supprimerVueVeille, type ResultatVues } from '../../../app/actions/veille-vues';
import { useSpatial } from '../../coquille/contexte';
import { Ic } from '../../communs';

/**
 * Le panneau « Nouvelle vue » de la barre de la Veille (`.xnew` de la
 * maquette) · garder les filtres de l'écran sous un nom, rouvrir, renommer,
 * supprimer une vue. Chaque geste appelle une action serveur
 * (`app/actions/veille-vues`) · la liste ne change qu'avec celle que le
 * serveur renvoie, un refus se dit et ne touche à rien. Les règles (nom,
 * paramètres gardés, plafond, doublons) sont celles du noyau.
 */

const CHAMP: CSSProperties = { flex: '1 1 200px', minWidth: 0, boxSizing: 'border-box', padding: '8px 12px', borderRadius: 12, background: 'var(--glass2)', border: '1px solid var(--edge)', color: 'var(--fg)', font: '500 13px var(--sf)', outline: 0 };
const NOTE: CSSProperties = { margin: 0, fontSize: 12.5 };

export function PanneauVues({ criteres, vues, active, majVues, ouvrir }: {
  criteres: CriteresVeille;
  vues: ReadonlyArray<VueVeilleEnregistree>;
  active: string | null;
  majVues: (vues: VueVeilleEnregistree[]) => void;
  ouvrir: (href: string) => void;
}) {
  const { toast } = useSpatial();
  const [nom, setNom] = useState('');
  const [renomme, setRenomme] = useState<{ id: string; nom: string } | null>(null);
  const [attente, demarrer] = useTransition();
  const verrou = useRef(verrouAction());
  const params = paramsVueVeille(criteres);
  const possible = fermetureNouvelleVueVeille(vues, params);

  const lancer = (faire: () => Promise<ResultatVues>, dire: (r: Extract<ResultatVues, { ok: true }>) => string, apres?: () => void) => {
    if (!verrou.current.tenter()) return;
    demarrer(async () => {
      try {
        const r = await faire();
        if (!r.ok) { toast(r.error); return; }
        majVues(r.vues);
        apres?.();
        toast(dire(r));
      } catch { toast('Échec · vérifie ta connexion puis réessaie.'); }
      finally { verrou.current.relacher(); }
    });
  };

  return (
    <div className="tile fpanel" role="dialog" aria-label="Vues enregistrées" style={{ gridTemplateColumns: 'minmax(0,1fr)', gap: 10, maxHeight: 'none' }}>
      <form style={{ display: 'grid', gap: 8 }} onSubmit={(e) => {
        e.preventDefault();
        if (!possible.ok || attente) return;
        lancer(() => garderVueVeille({ nom, params }), (r) => `Vue « ${r.vues.find((v) => v.id === r.id)?.nom ?? nom.trim()} » gardée`, () => setNom(''));
      }}>
        <span className="lbl" style={{ margin: 0 }}>Garder les filtres de l’écran</span>
        {possible.ok
          ? <div className="fsum" style={{ margin: 0 }}>{libellesVueVeille(possible.params).map((l) => <span key={l} className="chip on">{l}</span>)}</div>
          : <p className="muted" style={NOTE}>{possible.raison}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom de la vue · ex. Sérums vidéo Belgique" aria-label="Nom de la nouvelle vue"
            maxLength={LONGUEUR_MAX_NOM_VUE_VEILLE} disabled={!possible.ok || attente} style={CHAMP} />
          <button className="btn sm pri" type="submit" disabled={!possible.ok || attente || !nom.trim()}><Ic n="plus" />Garder cette vue</button>
        </div>
      </form>
      <span className="lbl" style={{ margin: 0 }}>Mes vues · {vues.length} / {PLAFOND_VUES_VEILLE}</span>
      {vues.length === 0 ? (
        <p className="muted" style={NOTE}>Aucune vue gardée pour l’instant · pose des filtres, donne-leur un nom, ils reviendront d’un clic.</p>
      ) : vues.map((v) => (
        <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {renomme?.id === v.id ? (
            <form style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1, minWidth: 0 }} onSubmit={(e) => {
              e.preventDefault();
              if (attente) return;
              lancer(() => renommerVueVeilleAction({ id: v.id, nom: renomme.nom }), () => 'Vue renommée', () => setRenomme(null));
            }}>
              <input autoFocus value={renomme.nom} onChange={(e) => setRenomme({ id: v.id, nom: e.target.value })} aria-label={`Nouveau nom de la vue ${v.nom}`} maxLength={LONGUEUR_MAX_NOM_VUE_VEILLE} disabled={attente} style={CHAMP} />
              <button className="btn sm pri" type="submit" disabled={attente || !renomme.nom.trim()}>Renommer</button>
              <button className="btn sm" type="button" onClick={() => setRenomme(null)}>Annuler</button>
            </form>
          ) : (
            <>
              <button type="button" className="fopt" aria-pressed={active === v.id} style={{ flex: 1 }} onClick={() => ouvrir(adresseVueVeille(v.params))}>
                <span>{v.nom}</span><small>{libellesVueVeille(v.params).join(' · ')}</small>
              </button>
              <button className="btn sm" type="button" aria-label={`Renommer la vue ${v.nom}`} disabled={attente} onClick={() => setRenomme({ id: v.id, nom: v.nom })}>Renommer</button>
              <button className="btn sm" type="button" aria-label={`Supprimer la vue ${v.nom}`} disabled={attente} onClick={() => {
                if (!window.confirm(confirmationSuppressionVueVeille(v.nom))) return;
                lancer(() => supprimerVueVeille({ id: v.id }), () => `Vue « ${v.nom} » supprimée`);
              }}><Ic n="x" />Supprimer</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
