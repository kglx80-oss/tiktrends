import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import { roleAtLeast, PLAN_LABEL } from '../../../lib/rbac';
import { updateWorkspaceAction } from '../../actions/admin';
import { input, btn, panel, h1, h2, sub, lbl, Msg, cadrePage, colonneLecture } from '../../../components/ui';
import { ADMIN_THEME } from '../../../lib/theme';
import { PageInfo } from '../../../components/PageInfo';
import { storageConfigured } from '@tiktrends/integrations';
import { StorageConfigurator } from '../../../components/StorageConfigurator';
import { isFounder } from '../../../lib/founder';
import { COPIE_STOCKAGE } from '@tiktrends/core';

const OK: Record<string, string> = { '1': 'Espace mis à jour.' };
const ERR: Record<string, string> = { forbidden: "Action réservée à l'administrateur." };

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard'); // garde : accès admin+ uniquement
  const { ok, e } = await searchParams;
  const operateur = isFounder(s.user.email);
  const stockage = operateur ? COPIE_STOCKAGE.operateur : COPIE_STOCKAGE.client;

  return (
    <main style={{ ...ADMIN_THEME, ...cadrePage }}><div style={colonneLecture('formulaire')}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h1 style={h1}>Réglages de l'espace</h1>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: 'var(--on-accent)', background: 'var(--grad-accent)' }}>ESPACE ADMIN</span>
      </div>
      <p style={sub}>Administration de <b>{s.workspaceName}</b>.</p>

      <PageInfo title="réglages de l'espace">
        Configure ici le <b>nom de l'espace</b> et vois les services activés. Le changement
        d'abonnement se fait dans <b>Abonnement & factures</b>, avec paiement sécurisé.
      </PageInfo>

      {ok && OK[ok] && <Msg kind="ok">{OK[ok]}</Msg>}
      {e && ERR[e] && <Msg kind="err">{ERR[e]}</Msg>}

      <div style={panel}>
        <h2 style={h2}>Général</h2>
        <p style={sub}>Nom affiché de l'espace (agence / client).</p>
        <form action={updateWorkspaceAction} style={{ display: 'grid', gap: 14, maxWidth: 420 }}>
          <div><label style={lbl}>Nom de l'espace</label><input name="name" defaultValue={s.workspaceName} style={input} /></div>
          <div><button type="submit" style={btn}>Enregistrer le nom</button></div>
        </form>
      </div>

      <div style={panel}>
        <h2 style={h2}>Abonnement</h2>
        <p style={sub}>
          Formule actuelle : <b>{PLAN_LABEL[s.plan]}</b>. Elle débloque les fonctionnalités
          (Veille & Studios dès <b>Core</b>) et l'allocation de crédits mensuelle.
        </p>
        <a href="/billing" style={{ ...btn, display: 'inline-block', textDecoration: 'none' }}>Gérer mon abonnement ›</a>
      </div>

      <div style={panel}>
        <h2 style={h2}>Services activés</h2>
        <p style={sub}>Ce qui est activé pour ton espace. Un service à activer s’active côté plateforme, pas depuis ton espace · un ticket au <Link href="/support" style={{ color: 'var(--accent-strong)' }}>support</Link> reste dans ton espace (seuls ses admins le lisent).</p>
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            // Copie CLIENT (recette #106) · on nomme la CAPACITÉ, jamais la
            // variable d'environnement ni le fournisseur · `env` ne sert plus
            // que de clé React et n'atteint pas l'écran.
            { label: 'IA · rédaction et analyse', env: 'ANTHROPIC_API_KEY', on: !!process.env.ANTHROPIC_API_KEY, unlocks: 'Studio, assistant, pré-remplissage marque, analyse concurrent' },
            // Marque blanche · on nomme la CAPACITÉ, jamais le fournisseur
            // (« Trendtrack » n'apparaît jamais à l'écran, même sur cette surface
            // opérateur · c'est le produit dont on est le marque blanche). La
            // variable d'environnement garde son nom, elle n'atteint pas l'écran.
            { label: 'Bibliothèque pub concurrentielle', env: 'TRENDTRACK_API_KEY', on: !!process.env.TRENDTRACK_API_KEY, unlocks: 'Veille, suivis, analyse concurrent' },
            { label: 'Image & vidéo IA', env: 'FAL_KEY', on: !!process.env.FAL_KEY, unlocks: 'Studios · images clés, images et clips vidéo' },
            { label: 'Stockage des fichiers lourds', env: 'S3_BUCKET', on: !!(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY && process.env.S3_ENDPOINT), unlocks: 'Upload direct des gros fichiers (rushs vidéo) dans Assets' },
            { label: 'E-mails transactionnels', env: 'SMTP_URL', on: !!process.env.SMTP_URL, unlocks: 'Bienvenue, invitation, réinitialisation de mot de passe' },
            { label: 'E-mails marketing', env: 'KLAVIYO_API_KEY', on: !!process.env.KLAVIYO_API_KEY, unlocks: 'Synchro des inscrits en profils + flows marketing (bienvenue, essai, relances)' },
            { label: 'Paiement en ligne', env: 'STRIPE_SECRET_KEY', on: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET), unlocks: 'Abonnements, portail client et facturation' },
            { label: 'Messagerie d’équipe', env: 'SLACK_BOT_TOKEN', on: !!process.env.SLACK_BOT_TOKEN, unlocks: 'Résumés et @TikTrends dans Slack (à venir)' },
          ].map((it) => (
            <div key={it.env} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', padding: '11px 14px', flexWrap: 'wrap' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: it.on ? '#18cc8c' : 'var(--line-2)', flexShrink: 0, boxShadow: it.on ? '0 0 0 3px rgba(24,204,140,.15)' : 'none' }} />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', minWidth: 200 }}>{it.label}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1, minWidth: 180 }}>{it.unlocks}</span>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.04em', padding: '3px 9px', borderRadius: 999, color: it.on ? '#18cc8c' : 'var(--muted)', background: it.on ? 'rgba(24,204,140,.14)' : 'var(--line)' }}>
                {it.on ? 'BRANCHÉ' : 'À BRANCHER'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={panel}>
        {/* Les Réglages s'ouvrent à l'administrateur de l'espace · un CLIENT. Il
            lit le stockage en mots de client ; l'équipe de la plateforme garde
            ses consignes techniques (recette #106b · `COPIE_STOCKAGE`). Les
            fonctions et les droits ne changent pas. */}
        <h2 style={h2}>{stockage.titre} <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.04em', padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap', color: storageConfigured() ? '#18cc8c' : 'var(--muted)', background: storageConfigured() ? 'rgba(24,204,140,.14)' : 'var(--line)' }}>{stockage.badge(storageConfigured())}</span></h2>
        <p style={sub}>{stockage.intro}</p>
        <StorageConfigurator enabled={storageConfigured()} operateur={operateur} />
      </div>

      <div style={panel}>
        <h2 style={h2}>White-label <span style={{ fontSize: 11, color: 'var(--warn)', fontWeight: 700 }}>Bientôt</span></h2>
        <p style={{ ...sub, marginBottom: 0 }}>Logo, couleurs et domaine personnalisés pour tes rapports clients (plan Business).</p>
      </div>
    </div></main>
  );
}
