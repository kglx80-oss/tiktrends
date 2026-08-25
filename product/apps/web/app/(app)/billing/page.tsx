import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../lib/auth';
import { roleAtLeast, PLAN_CREDITS, PLAN_PRICE, PLAN_LABEL, type Plan } from '../../../lib/rbac';
import { CREDIT_EUR, creditMarkup } from '@tiktrends/core';
import { changePlanAction } from '../../actions/billing';
import { Msg } from '../../../components/ui';

export const dynamic = 'force-dynamic';

const OK: Record<string, string> = { changed: 'Formule mise à jour.', same: 'C’est déjà ta formule actuelle.' };
const ERR: Record<string, string> = { forbidden: 'Réservé au propriétaire.', plan: 'Formule inconnue.' };

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

  let balance = 0;
  if (db) {
    const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
    balance = w?.c ?? 0;
  }
  const current = s.plan as Plan;
  const markup = creditMarkup();

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 27, fontWeight: 800, color: 'var(--ink)', letterSpacing: -0.5 }}>Plans & Facturation</h1>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>ADMIN+</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginTop: 6, marginBottom: 18, maxWidth: 760, lineHeight: 1.6 }}>
        Formule de l'espace <b>{s.workspaceName}</b>. Chaque formule ouvre une allocation mensuelle de crédits ·
        1 crédit ≈ {CREDIT_EUR.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € de valeur, indexé sur le coût réel des générations (× {markup}).
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
              {isOwner ? (
                <form action={changePlanAction} style={{ marginTop: 16 }}>
                  <input type="hidden" name="plan" value={p} />
                  <button type="submit" disabled={isCurrent} style={{
                    width: '100%', padding: '10px 14px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13,
                    cursor: isCurrent ? 'default' : 'pointer',
                    background: isCurrent ? 'var(--line-2)' : 'var(--grad-accent)',
                    color: isCurrent ? 'var(--muted)' : '#0d070c', opacity: isCurrent ? 0.7 : 1,
                  }}>{isCurrent ? 'Formule actuelle' : 'Choisir cette formule'}</button>
                </form>
              ) : (
                <div style={{ marginTop: 16, fontSize: 11.5, color: 'var(--muted)', textAlign: 'center' }}>{isCurrent ? 'Formule actuelle' : 'Le propriétaire gère la formule'}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Facturation / paiement */}
      <div style={{ border: '1px dashed var(--line-2)', borderRadius: 16, padding: '16px 20px', color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.6 }}>
        <b style={{ color: 'var(--ink)' }}>Paiement en ligne · à venir.</b> Le branchement Stripe (carte, factures automatiques, TVA)
        arrive prochainement. En attendant, le changement de formule est appliqué directement par le propriétaire ici, et
        la facturation se fait hors plateforme. La logique de coûts et de marges est détaillée dans <b>Crédits & marges</b>.
      </div>
    </main>
  );
}

const badge = { position: 'absolute', top: -10, right: 14, fontSize: 10, fontWeight: 800, letterSpacing: '.05em', padding: '3px 9px', borderRadius: 999, color: '#fff', background: 'linear-gradient(135deg,#fe2c55,#7a5aff)' } as const;
