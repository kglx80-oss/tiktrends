import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import { ROLE_LABEL, PLAN_LABEL } from '../../../lib/rbac';
import { updateProfileAction, changePasswordAction } from '../../actions/admin';
import { input, btn, panel, pageWrap, h1, h2, sub, lbl, Msg } from '../../../components/ui';

const OK: Record<string, string> = { '1': 'Profil mis à jour.', pw: 'Mot de passe modifié.' };
const ERR: Record<string, string> = { weak: 'Le nouveau mot de passe doit faire 8 caractères min.', current: 'Mot de passe actuel incorrect.' };

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { ok, e } = await searchParams;

  return (
    <main style={pageWrap}>
      <h1 style={h1}>Mon profil</h1>
      <p style={sub}>Rôle : <b>{ROLE_LABEL[s.role]}</b> · Espace : <b>{s.workspaceName}</b> · Abonnement : <b>{PLAN_LABEL[s.plan]}</b></p>

      {ok && OK[ok] && <Msg kind="ok">{OK[ok]}</Msg>}
      {e && ERR[e] && <Msg kind="err">{ERR[e]}</Msg>}

      <div style={panel}>
        <h2 style={h2}>Informations</h2>
        <p style={sub}>Ton e-mail sert d'identifiant de connexion.</p>
        <form action={updateProfileAction} style={{ display: 'grid', gap: 14, maxWidth: 420 }}>
          <div><label style={lbl}>Nom</label><input name="name" defaultValue={s.user.name || ''} style={input} placeholder="Ton nom" /></div>
          <div><label style={lbl}>E-mail</label><input value={s.user.email} disabled style={{ ...input, opacity: .6 }} /></div>
          <div><button type="submit" style={btn}>Enregistrer</button></div>
        </form>
      </div>

      <div style={panel}>
        <h2 style={h2}>Sécurité — changer de mot de passe</h2>
        <p style={sub}>On te demande ton mot de passe actuel pour confirmer que c'est bien toi.</p>
        <form action={changePasswordAction} style={{ display: 'grid', gap: 14, maxWidth: 420 }}>
          <div><label style={lbl}>Mot de passe actuel</label><input name="current" type="password" required autoComplete="current-password" style={input} /></div>
          <div><label style={lbl}>Nouveau mot de passe</label><input name="next" type="password" required autoComplete="new-password" style={input} placeholder="8 caractères min." /></div>
          <div><button type="submit" style={btn}>Mettre à jour le mot de passe</button></div>
        </form>
      </div>
    </main>
  );
}
