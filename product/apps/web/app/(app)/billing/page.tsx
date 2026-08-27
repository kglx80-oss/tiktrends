import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../lib/auth';
import { isFounder } from '../../../lib/founder';
import { roleAtLeast, PLAN_CREDITS, PLAN_PRICE, PLAN_LABEL, type Plan } from '../../../lib/rbac';
import { changePlanAction } from '../../actions/billing';
import { createCheckoutAction, createPortalAction } from '../../actions/stripe';
import { stripeConfigured, planPurchasable } from '../../../lib/stripe';
import { Msg } from '../../../components/ui';

export const dynamic = 'force-dynamic';

const OK: Record<string, string> = { changed: 'Formule mise à jour.', same: 'C’est déjà ta formule actuelle.', subscribed: 'Abonnement activé · bienvenue !', topup: 'Crédits ajoutés · merci !' };
const ERR: Record<string, string> = { forbidden: 'Réservé au propriétaire.', plan: 'Formule inconnue.', stripe: 'Paiement indisponible pour le moment.', cancel: 'Paiement annulé.', nosub: 'Aucun abonnement à gérer.' };

const PLANS: Plan[] = ['starter', 'core', 'plus', 'business'];

const FEATURES: Record<Plan, string[]> = {
  starter: ['Dashboard & Analytics', 'Tagging manuel', '1 marque', 'Support e-mail'],
  core: ['Tout Starter', 'Studio IA (pubs, image, vidéo)', 'Jarvis · règles maison', 'Radar & Veille', 'Jusqu’à 3 marques'],
  plus: ['Tout Core', 'Marques illimitées', 'Membres & rôles avancés', 'Clone de pubs gagnantes', 'Priorité de génération'],
  business: ['Tout Plus', 'Marque blanche complète', 'Accès API', 'Accompagnement dédié', 'Volumes sur mesure'],
};

const HINT: Record<Plan, string> = {
  starter: 'Pour démarrer et explorer', core: 'Le cœur de l’offre créative', plus: 'Pour les agences multi-marques', business: 'Volumes et marque blanche',
};

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  const { ok, e } = await searchParams;
  const isOwner = s.role === 'owner';
  // Bascule directe de formule (sans paiement) : pilotage plateforme uniquement.
  const canPilotPlan = isFounder(s.user.email);

  let balance = 0, subStatus: string | null = null, hasSub = false;
  if (db) {
    const [w] = await db.select({ c: schema.workspaces.creditsBalance, st: schema.workspaces.subscriptionStatus, sub: schema.workspaces.stripeSubscriptionId })
      .from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
    balance = w?.c ?? 0;
    subStatus = w?.st ?? null;
    hasSub = !!w?.sub && ['active', 'trialing', 'past_due'].includes(w?.st ?? '');
  }
  const current = s.plan as Plan;
  const stripeOn = stripeConfigured();
  const STATUS_FR: Record<string, string> = { active: 'Actif', trialing: 'Essai', past_due: 'Paiement en retard', canceled: 'Annulé' };

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 27, fontWeight: 800, color: 'var(--ink)', letterSpacing: -0.5 }}>Plans & Facturation</h1>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>ADMIN+</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginTop: 6, marginBottom: 18, maxWidth: 760, lineHeight: 1.6 }}>
        Formule de l'espace <b>{s.workspaceName}</b>. Chaque formule ouvre une allocation mensuelle de crédits :
        les crédits se consomment à chaque génération (image, vidéo, analyse), selon l'action.
      </p>

      {ok && OK[ok] && <Msg kind="ok">{OK[ok]}</Msg>}
      {e && ERR[e] && <Msg kind="err">{ERR[e]}</Msg>}

      {/* Résumé formule actuelle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', border: '1px solid var(--line-2)', borderRadius: 16, background: 'var(--surface)', padding: '16px 20px', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Formule actuelle</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{PLAN_LABEL[current]}</div>
        </div>
        <span style={{ width: 1, height: 34, background: 'var(--line)' }} />
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Prix</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{PLAN_PRICE[current] === 0 ? 'Gratuit' : `${PLAN_PRICE[current]} €`}<span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{PLAN_PRICE[current] === 0 ? '' : ' /mois'}</span></div>
        </div>
        <span style={{ width: 1, height: 34, background: 'var(--line)' }} />
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Crédits</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-strong)' }}>◈ {balance.toLocaleString('fr-FR')}<span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}> / {PLAN_CREDITS[current].toLocaleString('fr-FR')}</span></div>
        </div>
      </div>

      {/* Abonnement en cours · gestion via le portail Stripe */}
      {isOwner && hasSub && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', border: '1px solid rgba(24,204,140,.35)', borderRadius: 16, background: 'rgba(24,204,140,.06)', padding: '14px 18px', marginBottom: 22 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Abonnement {PLAN_LABEL[current]} · <span style={{ color: '#18cc8c' }}>{STATUS_FR[subStatus ?? ''] ?? subStatus}</span></div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2 }}>Change de formule, mets à jour ta carte, télécharge tes factures ou résilie.</div>
          </div>
          <form action={createPortalAction}>
            <button type="submit" style={{ padding: '10px 18px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink)', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>Gérer mon abonnement ›</button>
          </form>
        </div>
      )}

      {/* Grille des formules */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginBottom: 24 }}>
        {PLANS.map((p) => {
          const isCurrent = p === current;
          const highlight = p === 'core';
          return (
            <div key={p} style={{
              position: 'relative', display: 'flex', flexDirection: 'column',
              border: `1px solid ${isCurrent ? 'var(--accent-strong)' : highlight ? 'rgba(254,44,85,.4)' : 'var(--line-2)'}`,
              borderRadius: 18, background: isCurrent ? 'linear-gradient(180deg, rgba(254,44,85,.08), var(--surface))' : 'var(--surface)',
              padding: '18px 18px 20px',
            }}>
              {highlight && !isCurrent && <span style={badge}>Populaire</span>}
              {isCurrent && <span style={{ ...badge, background: 'var(--grad-accent)', color: '#0d070c' }}>Ta formule</span>}
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{PLAN_LABEL[p]}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, minHeight: 32 }}>{HINT[p]}</div>
              <div style={{ margin: '10px 0 4px', display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 30, fontWeight: 800, color: 'var(--ink)' }}>{PLAN_PRICE[p] === 0 ? '0 €' : `${PLAN_PRICE[p]} €`}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{PLAN_PRICE[p] === 0 ? '' : '/ mois HT'}</span>
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-strong)', marginBottom: 12 }}>◈ {PLAN_CREDITS[p].toLocaleString('fr-FR')} crédits / mois</div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 7, flex: 1 }}>
                {FEATURES[p].map((f, i) => (
                  <li key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.4 }}>
                    <span style={{ color: '#7ee8bf', flexShrink: 0 }}>✓</span>{f}
                  </li>
                ))}
              </ul>
              {(() => {
                const cta = (label: string, action: unknown, name?: string, val?: string, primary = true) => (
                  <form action={action as never} style={{ marginTop: 16 }}>
                    {name && <input type="hidden" name={name} value={val} />}
                    <button type="submit" style={{ width: '100%', padding: '10px 14px', borderRadius: 999, border: primary ? 'none' : '1px solid var(--line-2)', fontWeight: 800, fontSize: 13, cursor: 'pointer', background: primary ? 'var(--grad-accent)' : 'var(--paper)', color: primary ? '#0d070c' : 'var(--ink)' }}>{label}</button>
                  </form>
                );
                const disabledBtn = (label: string) => (
                  <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 999, background: 'var(--line-2)', color: 'var(--muted)', fontWeight: 800, fontSize: 13, textAlign: 'center', opacity: .8 }}>{label}</div>
                );
                if (!isOwner) return <div style={{ marginTop: 16, fontSize: 11.5, color: 'var(--muted)', textAlign: 'center' }}>{isCurrent ? 'Formule actuelle' : 'Le propriétaire gère la formule'}</div>;
                if (isCurrent) return disabledBtn('Formule actuelle');
                // Paiement Stripe branché : abonnement (Checkout) ou gestion (Portail).
                if (stripeOn) {
                  if (hasSub) return cta('Gérer mon abonnement', createPortalAction, undefined, undefined, false); // upgrade/downgrade via le portail
                  if (p === 'starter') return disabledBtn('Formule gratuite');
                  if (planPurchasable(p)) return cta(`S'abonner · ${PLAN_PRICE[p]} €/mois`, createCheckoutAction, 'plan', p);
                  return disabledBtn('Bientôt');
                }
                // Sans Stripe : bascule directe réservée au pilotage plateforme.
                if (canPilotPlan) return cta('Choisir cette formule', changePlanAction, 'plan', p);
                return disabledBtn('Bientôt disponible');
              })()}
            </div>
          );
        })}
      </div>

      {/* Facturation / paiement */}
      <div style={{ border: '1px solid var(--line-2)', borderRadius: 16, padding: '16px 20px', color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.6 }}>
        {stripeOn ? (
          <><b style={{ color: 'var(--ink)' }}>🔒 Paiement sécurisé par Stripe.</b> Carte bancaire, factures automatiques et TVA gérées par Stripe · aucune donnée de carte ne transite par TikTrends. Le changement de formule et la résiliation se font dans <b>« Gérer mon abonnement »</b>.</>
        ) : (
          <><b style={{ color: 'var(--ink)' }}>Pilotage interne.</b> Le paiement en ligne (Stripe) n'est pas encore activé sur ce serveur · le changement de formule est appliqué directement ici.</>
        )}
      </div>
    </main>
  );
}

const badge = { position: 'absolute', top: -10, right: 14, fontSize: 10, fontWeight: 800, letterSpacing: '.05em', padding: '3px 9px', borderRadius: 999, color: '#fff', background: 'linear-gradient(135deg,#fe2c55,#7a5aff)' } as const;
