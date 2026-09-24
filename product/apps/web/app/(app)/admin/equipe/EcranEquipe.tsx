'use client';

import {
  ROLES_PLATEFORME, ROLES_MATRICIELS, LIBELLE_ROLE_PLATEFORME,
  RUBRIQUES_PLATEFORME, roleVoitRubrique, accesTotal,
  type RolePlateforme, type MatriceDroits,
} from '@tiktrends/core';
import { enregistrerStaffAction, retirerStaffAction, enregistrerMatriceAction } from '../../../actions/equipe';

/**
 * L'écran de gestion de l'ÉQUIPE INTERNE · deux blocs.
 *
 * 1. Les membres · email → rôle (ajout, changement, retrait).
 * 2. La matrice des droits · par rôle GRADÉ, on coche les rubriques visibles.
 *    Admin+/Admin n'y figurent pas : accès total, jamais éditable (un outil qui
 *    peut se verrouiller hors de l'admin n'a plus d'issue).
 *
 * Tout passe par des `<form>` + action serveur · pas d'auto-envoi caché, chaque
 * changement a son bouton « Enregistrer ». La coche par défaut d'une rubrique
 * suit `roleVoitRubrique` (matrice si présente, sinon les droits par défaut du
 * rôle) : l'écran montre l'état RÉEL, pas une case vide trompeuse.
 */

interface Membre { email: string; role: RolePlateforme }

const card: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: '16px 18px', marginBottom: 18 };
const h2: React.CSSProperties = { margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: 'var(--ink)' };
const sub: React.CSSProperties = { margin: '0 0 14px', fontSize: 12.5, color: 'var(--ink-2)' };
const champ: React.CSSProperties = { minHeight: 40, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink)', fontSize: 13.5 };
const bouton: React.CSSProperties = { minHeight: 40, padding: '9px 16px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 800, fontSize: 13, cursor: 'pointer' };
const boutonGhost: React.CSSProperties = { minHeight: 36, padding: '7px 12px', borderRadius: 9, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink-2)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' };
const pastille = (role: RolePlateforme): React.CSSProperties => ({
  fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', padding: '2px 8px', borderRadius: 999,
  color: accesTotal(role) ? 'var(--on-accent)' : 'var(--ink-2)',
  background: accesTotal(role) ? 'var(--grad-accent)' : 'rgba(255,255,255,.06)',
  border: accesTotal(role) ? 'none' : '1px solid var(--line-2)',
});

function SelectRole({ defaut }: { defaut?: RolePlateforme }) {
  return (
    <select name="role" defaultValue={defaut ?? 'membre'} style={{ ...champ, cursor: 'pointer' }}>
      {ROLES_PLATEFORME.map((r) => (
        <option key={r} value={r}>{LIBELLE_ROLE_PLATEFORME[r]}</option>
      ))}
    </select>
  );
}

export function EcranEquipe({ moiEmail, staff, matrice }: { moiEmail: string; staff: Membre[]; matrice: MatriceDroits }) {
  const groupes = [...new Set(RUBRIQUES_PLATEFORME.map((r) => r.groupe))];
  const moi = moiEmail.trim().toLowerCase();

  return (
    <div>
      {/* ── Bloc membres ─────────────────────────────────────────────── */}
      <section style={card}>
        <h2 style={h2}>Membres de l’équipe</h2>
        <p style={sub}>Chaque email est rattaché à un rôle · Admin+ et Admin ont un accès total et des crédits illimités.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {staff.map((m) => (
            <div key={m.email} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', border: '1px solid var(--line-2)', borderRadius: 12, padding: '9px 12px' }}>
              <span style={{ flex: 1, minWidth: 180, fontSize: 13.5, color: 'var(--ink)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email}</span>
              <span style={pastille(m.role)}>{LIBELLE_ROLE_PLATEFORME[m.role]}</span>
              <form action={enregistrerStaffAction} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="hidden" name="email" value={m.email} />
                <SelectRole defaut={m.role} />
                <button type="submit" style={boutonGhost}>Changer</button>
              </form>
              {m.email.toLowerCase() !== moi && (
                <form action={retirerStaffAction}>
                  <input type="hidden" name="email" value={m.email} />
                  <button type="submit" aria-label={`Retirer ${m.email}`} style={{ ...boutonGhost, color: '#e5484d' }}>Retirer</button>
                </form>
              )}
            </div>
          ))}
        </div>

        <form action={enregistrerStaffAction} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <input name="email" type="email" required placeholder="email@agence.fr" aria-label="Email du membre" style={{ ...champ, flex: 1, minWidth: 200 }} />
          <SelectRole />
          <button type="submit" style={bouton}>Ajouter</button>
        </form>
      </section>

      {/* ── Bloc matrice ─────────────────────────────────────────────── */}
      <section style={card}>
        <h2 style={h2}>Droits par rôle</h2>
        <p style={sub}>Cochez les rubriques que chaque rôle peut voir · le point de départ est un jeu de droits sensé, ajustable ici. Admin+ et Admin voient tout, sans réglage.</p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {(['adminplus', 'admin'] as RolePlateforme[]).map((r) => (
            <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--ink-2)' }}>
              <span style={pastille(r)}>{LIBELLE_ROLE_PLATEFORME[r]}</span> accès total · tout
            </span>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: 12 }}>
          {ROLES_MATRICIELS.map((role) => (
            <form key={role} action={enregistrerMatriceAction} data-role={role} style={{ border: '1px solid var(--line-2)', borderRadius: 14, padding: '13px 15px', background: 'var(--paper)' }}>
              <input type="hidden" name="role" value={role} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>{LIBELLE_ROLE_PLATEFORME[role]}</span>
                <button type="submit" style={boutonGhost}>Enregistrer</button>
              </div>
              {groupes.map((g) => (
                <fieldset key={g} style={{ border: 'none', margin: 0, padding: 0, marginBottom: 8 }}>
                  <legend style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontWeight: 700, padding: 0, marginBottom: 4 }}>{g}</legend>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {RUBRIQUES_PLATEFORME.filter((r) => r.groupe === g).map((rub) => {
                      const coche = roleVoitRubrique(role, rub.key, matrice);
                      return (
                        <label key={rub.key} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 30, fontSize: 13, color: 'var(--ink-2)', cursor: 'pointer' }}>
                          <input type="checkbox" name="rubrique" value={rub.key} defaultChecked={coche} style={{ width: 17, height: 17, cursor: 'pointer' }} />
                          {rub.label}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </form>
          ))}
        </div>
      </section>
    </div>
  );
}
