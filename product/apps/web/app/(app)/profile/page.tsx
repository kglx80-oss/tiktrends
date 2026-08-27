import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../lib/auth';
import { ROLE_LABEL, PLAN_LABEL, roleAtLeast } from '../../../lib/rbac';
import { isFounder } from '../../../lib/founder';
import { changePasswordAction } from '../../actions/admin';
import { input, btn, panel, pageWrap, h1, h2, sub, lbl, Msg } from '../../../components/ui';
import { ProfileIdentity } from './ProfileIdentity';

const OK: Record<string, string> = { '1': 'Profil mis à jour.', pw: 'Mot de passe modifié.' };
const ERR: Record<string, string> = { weak: 'Le nouveau mot de passe doit faire 8 caractères min.', current: 'Mot de passe actuel incorrect.' };

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { ok, e } = await searchParams;

  let avatarUrl = '', hidePersonalInfo = false;
  if (db) {
    const [u] = await db.select({ a: schema.users.avatarUrl, h: schema.users.hidePersonalInfo }).from(schema.users).where(eq(schema.users.id, s.user.id)).limit(1);
    avatarUrl = u?.a ?? '';
    hidePersonalInfo = u?.h ?? false;
  }

  return (
    <main style={pageWrap}>
      <h1 style={h1}>Mon profil</h1>
      <p style={sub}>Rôle : <b>{ROLE_LABEL[s.role]}</b> · Espace : <b>{s.workspaceName}</b> · Abonnement : <b>{PLAN_LABEL[s.plan]}</b></p>

      {ok && OK[ok] && <Msg kind="ok">{OK[ok]}</Msg>}
      {e && ERR[e] && <Msg kind="err">{ERR[e]}</Msg>}

      {/* Identité */}
      <div style={panel}>
        <h2 style={h2}>Identité</h2>
        <p style={sub}>Ta photo, ton nom et la confidentialité de tes informations.</p>
        <ProfileIdentity init={{ name: s.user.name || '', email: s.user.email, avatarUrl, hidePersonalInfo }} />
      </div>

      {/* Préférences */}
      <div style={panel}>
        <h2 style={h2}>Préférences</h2>
        <p style={sub}>Langue de l'interface.</p>
        <div style={{ maxWidth: 260 }}>
          <label style={lbl}>Langue</label>
          <select disabled style={{ ...input, opacity: .8 }}><option>Français</option></select>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted)' }}>D'autres langues arrivent prochainement.</p>
        </div>
      </div>

      {/* Sécurité */}
      <div style={panel}>
        <h2 style={h2}>Sécurité · changer de mot de passe</h2>
        <p style={sub}>On te demande ton mot de passe actuel pour confirmer que c'est bien toi.</p>
        <form action={changePasswordAction} style={{ display: 'grid', gap: 14, maxWidth: 420 }}>
          <div><label style={lbl}>Mot de passe actuel</label><input name="current" type="password" required autoComplete="current-password" style={input} /></div>
          <div><label style={lbl}>Nouveau mot de passe</label><input name="next" type="password" required autoComplete="new-password" style={input} placeholder="8 caractères min." /></div>
          <div><button type="submit" style={btn}>Mettre à jour le mot de passe</button></div>
        </form>
      </div>

      {/* Espace & accès */}
      <div style={panel}>
        <h2 style={h2}>Espace & accès</h2>
        <p style={sub}>Ton rôle et ta formule sur cet espace de travail.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <Info label="Espace" value={s.workspaceName} />
          <Info label="Rôle" value={ROLE_LABEL[s.role]} />
          <Info label="Abonnement" value={PLAN_LABEL[s.plan]} />
        </div>
        {roleAtLeast(s.role, 'admin') && (
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <Link href="/billing" style={linkBtn}>Abonnement & factures ›</Link>
            {isFounder(s.user.email) && (
              <Link href="/admin" style={{ ...linkBtn, background: 'transparent', color: 'var(--ink-2)', border: '1px solid var(--line-2)' }}>Coulisses ADMIN+ ›</Link>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', padding: '12px 14px' }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>{value}</div>
    </div>
  );
}

const linkBtn = { padding: '10px 16px', borderRadius: 999, background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 12.5, textDecoration: 'none' } as const;
