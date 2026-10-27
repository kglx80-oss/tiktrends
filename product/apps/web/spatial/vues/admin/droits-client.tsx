'use client';

import { useState, useTransition } from 'react';
import { Ic } from '../../communs';
import { enregistrerMatriceAction, enregistrerStaffAction, retirerStaffAction } from '../../../app/actions/equipe';
import { DialogueSpatial } from '../marque/interactifs';

/**
 * La matrice des droits et l'invitation · les gestes passent par les actions
 * EXISTANTES de l'équipe (`enregistrerMatriceAction`, `enregistrerStaffAction`),
 * qui reposent la garde « accès total » et nettoient la saisie. Un clic sur une
 * case enregistre AUSSITÔT les rubriques du rôle, ouvertes ou fermées (noyau
 * `rubriquesApresBascule` · calculé côté serveur, passé ici par case).
 */

export interface CaseDroit { role: string; niveau: 0 | 1 | 2 | 3; libelle: string; aria: string; /** Rubriques du rôle après le clic. */ apres: readonly string[] }

export function MatriceDroitsSpatiale({ roles, lignes, verrouille }: {
  roles: readonly string[];
  lignes: ReadonlyArray<{ rubrique: string; cases: readonly CaseDroit[] }>;
  verrouille: boolean;
}) {
  const [enCours, demarrer] = useTransition();
  const basculer = (c: CaseDroit) => {
    if (verrouille) return;
    const fd = new FormData();
    fd.set('role', c.role);
    for (const r of c.apres) fd.append('rubrique', r);
    demarrer(() => enregistrerMatriceAction(fd));
  };
  return (
    <div className="amx">
      <div className="amxr h"><span />{roles.map((r) => <span key={r}>{r}</span>)}</div>
      {lignes.map((l) => (
        <div className="amxr" key={l.rubrique}>
          <span>{l.rubrique}</span>
          {l.cases.map((c) => <button key={c.role} type="button" className={`amc l${c.niveau}`} aria-label={c.aria} disabled={verrouille || enCours} onClick={() => basculer(c)}>{c.libelle}</button>)}
        </div>
      ))}
    </div>
  );
}

export function InviterMembre({ roles }: { roles: ReadonlyArray<{ cle: string; libelle: string }> }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button className="btn sm" type="button" style={{ marginLeft: 'auto' }} aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}><Ic n="plus" />Inviter</button>
      {ouvert && (
        <form action={enregistrerStaffAction} className="kc" style={{ width: '100%', marginTop: 10 }}>
          <label className="jsearch" style={{ flex: 1, minWidth: 200 }}><input name="email" type="email" required placeholder="email@agence.fr" aria-label="E-mail du membre" autoComplete="off" /></label>
          <select name="role" defaultValue="membre" aria-label="Rôle" className="chip">{roles.map((r) => <option key={r.cle} value={r.cle}>{r.libelle}</option>)}</select>
          <button className="btn sm pri" type="submit">Enregistrer</button>
        </form>
      )}
    </>
  );
}

/**
 * Gérer UN membre de l'équipe interne · changer son rôle (`enregistrerStaffAction`,
 * même e-mail) ou le retirer (`retirerStaffAction`). Les deux actions reposent
 * la garde « accès total » et l'admissibilité, refusent de se retirer ou de se
 * rétrograder soi-même, et redirigent avec leur message (`?ok=` / `?e=`). Le
 * retrait se confirme dans la fenêtre · on ne se retire jamais soi-même d'ici.
 */
export function GererMembre({ email, role, moi, roles }: { email: string; role: string; moi: boolean; roles: ReadonlyArray<{ cle: string; libelle: string }> }) {
  const [ouvert, setOuvert] = useState(false);
  const [retrait, setRetrait] = useState(false);
  return (
    <>
      <button className="btn sm" type="button" aria-haspopup="dialog" aria-label={`Gérer ${email}`} onClick={() => { setRetrait(false); setOuvert(true); }}>Gérer</button>
      <DialogueSpatial titre={email} ouvert={ouvert} fermer={() => setOuvert(false)}>
        <form action={enregistrerStaffAction} style={{ display: 'grid', gap: 10 }} data-geste="changer-role">
          <input type="hidden" name="email" value={email} />
          <label className="field">Rôle<select name="role" defaultValue={role}>{roles.map((r) => <option key={r.cle} value={r.cle}>{r.libelle}</option>)}</select></label>
          <div className="kc"><button className="btn sm pri" type="submit">Changer le rôle</button></div>
        </form>
        {moi ? (
          <small className="faint">C’est ton compte · tu ne peux ni te retirer ni te rétrograder toi-même.</small>
        ) : retrait ? (
          <form action={retirerStaffAction} style={{ display: 'grid', gap: 10 }} data-geste="retirer">
            <input type="hidden" name="email" value={email} />
            <p className="muted" style={{ margin: 0, fontSize: '12.5px' }}>{email} perd l’accès à l’administration de la plateforme. Son compte client, lui, reste intact.</p>
            <div className="kc"><button className="btn sm pri" type="submit">Confirmer le retrait</button><button className="btn sm" type="button" onClick={() => setRetrait(false)}>Annuler</button></div>
          </form>
        ) : (
          <div className="kc"><button className="btn sm" type="button" onClick={() => setRetrait(true)}>Retirer de l’équipe…</button></div>
        )}
      </DialogueSpatial>
    </>
  );
}
