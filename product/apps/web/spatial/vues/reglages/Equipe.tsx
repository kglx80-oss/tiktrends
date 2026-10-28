import type { ReactNode } from 'react';
import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { AnnonceRetour, BoutonServeur } from '../marque/interactifs';
import { CopierLien } from './interactifs';
import type { FormuleMini } from './Espace';

/**
 * « Équipe » · `docs/spatial/reference/equipe.html` (maquette : `vEquipe`).
 * PRÉSENTATIONNEL · membres (`workspace_members`), invitations en attente
 * (`invites`), invitation par `createInviteAction`, révocation par
 * `revokeInviteAction`. Aucun siège payant ni retrait de membre n'existe côté
 * serveur · le bouton « siège » est absent, le choix de rôle et le retrait d'un
 * membre restent visibles mais fermés, avec leur raison.
 */

export interface MembreVue { cle: string; initiales: string; teinte: string; nom: string; email: string; role: string; moi: boolean }
export interface InvitationVue { id: string; email: string; role: string; expiree: boolean; lien: string }

export interface PropsEquipe {
  sousNav: ReadonlyArray<{ href: string; libelle: ReactNode }>;
  plan: string;
  formules: readonly FormuleMini[];
  suivante: { libelle: string; href: string } | null;
  membres: readonly MembreVue[];
  invitations: readonly InvitationVue[];
  roles: ReadonlyArray<{ valeur: string; libelle: string }>;
  /** Tous les libellés de rôle, pour le menu (fermé) des autres membres. */
  tousRoles: readonly string[];
  inviter: ((fd: FormData) => Promise<void>) | null;
  revoquer: ((fd: FormData) => Promise<void>) | null;
  retours: Record<string, string>;
}

const CHAMP = { flex: '1 1 220px', minWidth: 0, boxSizing: 'border-box', padding: '10px 14px', borderRadius: 14, background: 'var(--glass2)', border: '1px solid var(--edge)', color: 'var(--fg)', font: '500 13px var(--sf)', outline: 0 } as const;
const CHOIX = { padding: '10px 12px', borderRadius: 14, background: 'var(--glass2)', border: '1px solid var(--edge)', color: 'var(--fg)', font: '500 13px var(--sf)' } as const;
const LIGNE = { padding: '10px 0', borderTop: '1px solid var(--edge2)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' } as const;

export function Equipe(p: PropsEquipe) {
  const actifs = p.membres.length;
  const attente = p.invitations.filter((i) => !i.expiree).length;
  const total = actifs + attente;
  return (
    <Vue>
      <EnTete titre="Équipe" sous="Qui a accès à quoi" />
      <SousNav items={p.sousNav} actif="/team" />
      <section className="tile" style={{ display: 'grid', gap: 14, marginBottom: 16, borderColor: 'color-mix(in srgb,var(--acc) 35%,transparent)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0, display: 'grid', gap: 4 }}>
            <div className="lbl" style={{ margin: 0 }}>Membres · plan {p.plan}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <b style={{ font: '600 30.5px/1 var(--sfd)', fontVariantNumeric: 'tabular-nums' }}>{total}</b>
              <span className="muted" style={{ fontSize: 14 }}>personne{total > 1 ? 's' : ''} avec accès</span>
              <span className="pill g">{actifs} actif{actifs > 1 ? 's' : ''}</span>
            </div>
            <small className="faint" style={{ fontSize: 12 }}>Les invitations en attente comptent · une invitation expire au bout de 7 jours</small>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {p.suivante && <Lien className="btn sm pri" href={p.suivante.href}><Ic n="spark" />{p.suivante.libelle}</Lien>}
          </div>
        </div>
        <div style={{ height: 8, borderRadius: 8, background: '#ffffff14', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${total > 0 ? Math.round((actifs / total) * 100) : 0}%`, background: 'linear-gradient(90deg,var(--acc),var(--acc2))', borderRadius: 8 }} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,150px),1fr))', gap: 8 }}>
          {p.formules.map((f) => (
            <div key={f.nom} style={{ display: 'grid', gap: 2, padding: '10px 12px', borderRadius: 14, background: f.actuelle ? 'color-mix(in srgb,var(--acc) 18%,transparent)' : '#ffffff08', border: `1px solid ${f.actuelle ? 'color-mix(in srgb,var(--acc) 55%,transparent)' : 'var(--edge2)'}` }}>
              <small className="faint" style={{ fontSize: 11 }}>{f.nom}{f.actuelle ? ' · actuel' : ''}</small><b style={{ font: '600 15px var(--sfd)' }}>{f.valeur}</b><small className="faint" style={{ fontSize: '10.5px' }}>{f.detail}</small>
            </div>
          ))}
        </div>
      </section>
      <section className="tile">
        <div className="sech" style={{ margin: '0 0 8px' }}><h2>Membres</h2><span className="faint" style={{ fontSize: '12.5px' }}>{actifs} actif{actifs > 1 ? 's' : ''}{p.invitations.length ? ` · ${p.invitations.length} en attente` : ''}</span></div>
        <form id="invform" autoComplete="off" action={p.inviter ?? undefined} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <input id="invmail" name="email" type="email" required placeholder="email@exemple.com" aria-label="Email à inviter" disabled={!p.inviter} style={CHAMP} />
          <select id="invrole" name="role" aria-label="Rôle" disabled={!p.inviter} defaultValue={p.roles.find((r) => r.valeur === 'member')?.valeur ?? p.roles[0]?.valeur} style={CHOIX}>
            {p.roles.map((r) => <option key={r.valeur} value={r.valeur}>{r.libelle}</option>)}
          </select>
          <button className="btn sm pri" type="submit" disabled={!p.inviter}><Ic n="plus" />Inviter</button>
        </form>
        <div className="team">
          {p.membres.map((m) => (
            <div className="member" key={m.cle} style={LIGNE}>
              <span className="av" style={{ background: m.teinte }}>{m.initiales}</span>
              <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                <strong style={{ fontSize: 13 }}>{m.nom}{m.moi && <> <span className="faint" style={{ fontWeight: 500 }}>· toi</span></>}</strong>
                <span className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{m.email}</span>
              </div>
              {m.moi ? <span className="pill">{m.role}</span> : (
                <>
                  <select aria-label={`Rôle de ${m.nom}`} defaultValue={m.role} disabled title="Le changement de rôle d’un membre n’est pas encore disponible" style={{ padding: '7px 10px', borderRadius: 12, background: 'var(--glass2)', border: '1px solid var(--edge)', color: 'var(--fg)', font: '500 12.5px var(--sf)' }}>
                    {p.tousRoles.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button className="btn sm icon" type="button" aria-label={`Retirer ${m.nom}`} disabled title="Le retrait d’un membre n’est pas encore disponible"><Ic n="x" /></button>
                </>
              )}
            </div>
          ))}
          {p.invitations.map((v) => (
            <div className="member" key={v.id} style={{ ...LIGNE, opacity: 0.8 }}>
              <span className="av" style={{ background: '#ffffff26', color: 'var(--fg)' }}>{v.email[0]!.toUpperCase()}</span>
              <div style={{ flex: '1 1 160px', minWidth: 0 }}><strong style={{ fontSize: 13 }}>{v.email}</strong><span className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{v.expiree ? `Expirée · lien inactif · ${v.role}` : `Invitation envoyée · ${v.role}`}</span></div>
              <span className="pill w">{v.expiree ? 'Expirée' : 'En attente'}</span>
              {!v.expiree && <CopierLien lien={v.lien}>Copier le lien</CopierLien>}
              <BoutonServeur className="btn sm icon" action={p.revoquer} champs={{ id: v.id }} aria-label={`Annuler l’invitation de ${v.email}`} raison="Réservé aux administrateurs de l’espace"><Ic n="x" /></BoutonServeur>
            </div>
          ))}
        </div>
      </section>
      <AnnonceRetour messages={p.retours} />
    </Vue>
  );
}
