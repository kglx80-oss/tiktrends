import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import { roleAtLeast, PLAN_LABEL, type Plan } from '../../../lib/rbac';
import { updateWorkspaceAction, setPlanAction } from '../../actions/admin';
import { input, btn, panel, pageWrap, h1, h2, sub, lbl, Msg } from '../../../components/ui';
import { ADMIN_THEME } from '../../../lib/theme';
import { PageInfo } from '../../../components/PageInfo';

const OK: Record<string, string> = { '1': 'Espace mis à jour.', plan: 'Abonnement modifié.' };
const ERR: Record<string, string> = { forbidden: "Action réservée à l'administrateur.", plan: 'Abonnement invalide.' };
const PLANS: Plan[] = ['starter', 'core', 'plus', 'business'];

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard'); // garde : accès admin+ uniquement
  const { ok, e } = await searchParams;
  const isOwner = s.role === 'owner';

  return (
    <main style={{ ...ADMIN_THEME, ...pageWrap }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h1 style={h1}>Réglages de l'espace</h1>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>ESPACE ADMIN</span>
      </div>
      <p style={sub}>Administration de <b>{s.workspaceName}</b>.</p>

      <PageInfo title="réglages de l'espace">
        Configure ici le <b>nom de l'espace</b> et, en tant que propriétaire, l'<b>abonnement</b> (qui débloque
        les fonctionnalités comme Inspo et le Studio). Les changements s'appliquent immédiatement à tout ton espace.
      </PageInfo>

      {ok && OK[ok] && <Msg kind="ok">{OK[ok]}</Msg>}
      {e && ERR[e] && <Msg kind="err">{ERR[e]}</Msg>}

      <div style={panel}>
        <h2 style={h2}>Général</h2>
        <p style={sub}>Nom affiché de l'espace (agence / client).</p>
        <form action={updateWorkspaceAction} style={{ display: 'grid', gap: 14, maxWidth: 420 }}>
          <div><label style={lbl}>Nom de l'espace</label><input name="name" defaultValue={s.workspaceName} style={input} /></div>
          <div><button type="submit" style={btn}>Enregistrer</button></div>
        </form>
      </div>

      <div style={panel}>
        <h2 style={h2}>Abonnement</h2>
        <p style={sub}>
          Plan actuel : <b>{PLAN_LABEL[s.plan]}</b>. Le plan débloque les fonctionnalités
          (Inspo & Studio IA dès <b>Core</b>).{!isOwner && ' Seul le propriétaire peut le changer.'}
        </p>
        {isOwner ? (
          <form action={setPlanAction} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select name="plan" defaultValue={s.plan} style={{ ...input, width: 'auto', minWidth: 180 }}>
              {PLANS.map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
            </select>
            <button type="submit" style={btn}>Changer d'abonnement</button>
          </form>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Contacte le propriétaire de l'espace pour faire évoluer le plan.</div>
        )}
      </div>

      <div style={panel}>
        <h2 style={h2}>White-label <span style={{ fontSize: 11, color: 'var(--warn)', fontWeight: 700 }}>Bientôt</span></h2>
        <p style={{ ...sub, marginBottom: 0 }}>Logo, couleurs et domaine personnalisés pour tes rapports clients (plan Business).</p>
      </div>
    </main>
  );
}
