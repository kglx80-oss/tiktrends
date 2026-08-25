import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import { roleAtLeast, PLAN_LABEL, type Plan } from '../../../lib/rbac';
import { updateWorkspaceAction, setPlanAction } from '../../actions/admin';
import { input, btn, panel, pageWrap, h1, h2, sub, lbl, Msg } from '../../../components/ui';
import { ADMIN_THEME } from '../../../lib/theme';
import { PageInfo } from '../../../components/PageInfo';
import { storageConfigured } from '@tiktrends/integrations';
import { StorageConfigurator } from '../../../components/StorageConfigurator';

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
        <h2 style={h2}>Intégrations serveur</h2>
        <p style={sub}>Ce qui est branché côté serveur. Les clés se posent dans les variables d'environnement (jamais visibles ici).</p>
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            { label: 'IA · Anthropic (Claude)', env: 'ANTHROPIC_API_KEY', on: !!process.env.ANTHROPIC_API_KEY, unlocks: 'Studio, assistant, pré-remplissage marque, analyse concurrent' },
            { label: 'Bibliothèque pub · Trendtrack', env: 'TRENDTRACK_API_KEY', on: !!process.env.TRENDTRACK_API_KEY, unlocks: 'Veille, suivis, analyse concurrent' },
            { label: 'Image & Vidéo IA · Fal.ai', env: 'FAL_KEY', on: !!process.env.FAL_KEY, unlocks: 'Studio Image (Flux/Ideogram) et Vidéo (Kling 2)' },
            { label: 'Stockage objet · S3 / OVH', env: 'S3_BUCKET', on: !!(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY && process.env.S3_ENDPOINT), unlocks: 'Upload direct des gros fichiers (rushs vidéo) dans Assets' },
            { label: 'Vidéo IA · Higgsfield (option)', env: 'HIGGSFIELD_API_KEY', on: !!process.env.HIGGSFIELD_API_KEY, unlocks: 'Alternative vidéo (contrôles caméra)' },
            { label: 'E-mails · SMTP', env: 'SMTP_URL', on: !!process.env.SMTP_URL, unlocks: 'Notifications par e-mail (à venir)' },
            { label: 'Slack', env: 'SLACK_BOT_TOKEN', on: !!process.env.SLACK_BOT_TOKEN, unlocks: 'Résumés et @TikTrends dans Slack (à venir)' },
          ].map((it) => (
            <div key={it.env} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', padding: '11px 14px', flexWrap: 'wrap' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: it.on ? '#18cc8c' : 'var(--line-2)', flexShrink: 0, boxShadow: it.on ? '0 0 0 3px rgba(24,204,140,.15)' : 'none' }} />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', minWidth: 200 }}>{it.label}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1, minWidth: 180 }}>{it.unlocks}</span>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.04em', padding: '3px 9px', borderRadius: 999, color: it.on ? '#18cc8c' : 'var(--muted)', background: it.on ? 'rgba(24,204,140,.14)' : 'var(--line)' }}>
                {it.on ? 'BRANCHÉ' : 'À BRANCHER'}
              </span>
              <code style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{it.env}</code>
            </div>
          ))}
        </div>
      </div>

      <div style={panel}>
        <h2 style={h2}>Stockage objet <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.04em', padding: '2px 8px', borderRadius: 999, color: storageConfigured() ? '#18cc8c' : 'var(--muted)', background: storageConfigured() ? 'rgba(24,204,140,.14)' : 'var(--line)' }}>{storageConfigured() ? 'CLÉS DÉTECTÉES' : 'CLÉS ABSENTES'}</span></h2>
        <p style={sub}>Une fois les clés S3 posées dans <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>.env.deploy</code>, configure la lecture publique + le CORS et teste, sans passer par la ligne de commande.</p>
        <StorageConfigurator enabled={storageConfigured()} />
      </div>

      <div style={panel}>
        <h2 style={h2}>White-label <span style={{ fontSize: 11, color: 'var(--warn)', fontWeight: 700 }}>Bientôt</span></h2>
        <p style={{ ...sub, marginBottom: 0 }}>Logo, couleurs et domaine personnalisés pour tes rapports clients (plan Business).</p>
      </div>
    </main>
  );
}
