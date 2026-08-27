import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db, schema } from '@tiktrends/db';
import { eq } from 'drizzle-orm';
import { getSession } from '../../../lib/auth';
import { roleAtLeast, ROLE_LABEL, PLAN_LABEL, PLAN_CREDITS } from '../../../lib/rbac';
import { isFounder } from '../../../lib/founder';

export const dynamic = 'force-dynamic';

interface Tool { icon: string; title: string; desc: string; href: string; badge?: string; soon?: boolean }
interface Section { title: string; hint: string; tools: Tool[] }

export default async function AdminBackstage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');

  // Quelques chiffres de contexte pour l'entrée en coulisses.
  let credits = 0, members = 0, brandCount = 0;
  if (db) {
    const [[ws], mem, br] = await Promise.all([
      db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1),
      db.select({ id: schema.workspaceMembers.userId }).from(schema.workspaceMembers).where(eq(schema.workspaceMembers.workspaceId, s.workspaceId)),
      db.select({ id: schema.brands.id }).from(schema.brands).where(eq(schema.brands.workspaceId, s.workspaceId)),
    ]);
    credits = ws?.c ?? 0;
    members = mem.length;
    brandCount = br.length;
  }

  const sections: Section[] = [
    {
      title: 'Pilotage',
      hint: 'Supervision et paramétrage du moteur',
      tools: [
        { icon: '📟', title: 'Console', desc: 'État du système, intégrations, files de génération et diagnostics.', href: '/console' },
        { icon: '⚙️', title: 'Réglages', desc: 'Paramètres de l’espace, modèles IA, clés et préférences serveur.', href: '/settings' },
      ],
    },
    {
      title: 'Crédits & facturation',
      hint: 'Coûts réels, marges et abonnement',
      tools: [
        ...(isFounder(s.user.email) ? [{ icon: '📈', title: 'Finance · MRR & marges', desc: 'Revenu récurrent (MRR/ARR), bénéfice net réel et optimisation des marges par formule.', href: '/admin/finance', badge: 'Fondateur' }] : []),
        ...(isFounder(s.user.email) ? [{ icon: '🧭', title: 'Inscriptions & onboarding', desc: 'Nouveaux comptes, profils déclarés (marque/agence…), niveau IA et objectifs.', href: '/admin/signups', badge: 'Fondateur' }] : []),
        { icon: '◈', title: 'Crédits & marges', desc: 'Solde, allocation, coût réel API, règle × markup et marge par action.', href: '/credits', badge: `${credits.toLocaleString('fr-FR')} restants` },
        { icon: '💳', title: 'Plans & Facturation', desc: 'Formules, prix, allocations et abonnement de l’espace.', href: '/billing' },
      ],
    },
    {
      title: 'Intelligence & IA maison',
      hint: 'Notre couche créative et le marché',
      tools: [
        { icon: '🧠', title: 'Jarvis', desc: 'Règles créatives maison imposées à chaque génération, par marque.', href: '/jarvis' },
        { icon: '🔭', title: 'Intelligence marché', desc: 'Concurrents (Atria, Foreplay, Higgsfield) et notre positionnement.', href: '/admin/intelligence' },
      ],
    },
    {
      title: 'Espace de travail',
      hint: 'Marques, accès et connexions',
      tools: [
        { icon: '🏷️', title: 'Marques', desc: 'Créer, configurer et piloter chaque marque de l’espace.', href: '/brands', badge: `${brandCount}` },
        { icon: '🔌', title: 'Connexions', desc: 'Meta, TikTok, Shopify et autres intégrations, marque par marque.', href: '/connections' },
        { icon: '👥', title: 'Membres', desc: 'Inviter l’équipe, gérer les rôles et les accès.', href: '/team', badge: `${members}` },
      ],
    },
  ];

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 1080, margin: '0 auto' }}>
      <Link href="/dashboard" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>‹ Retour à l’app</Link>

      {/* Héro coulisses */}
      <div style={{ position: 'relative', overflow: 'hidden', border: '1px solid rgba(245,166,35,.3)', borderRadius: 22, background: 'linear-gradient(135deg, rgba(245,166,35,.14), rgba(255,140,66,.06) 60%, var(--surface))', padding: '24px 26px', margin: '10px 0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: 'var(--grad-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 25, flexShrink: 0 }}>🎛️</div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 27, fontWeight: 800, color: 'var(--ink)', letterSpacing: -0.5 }}>ADMIN+</h1>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>COULISSES</span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--ink-2)', maxWidth: 640, lineHeight: 1.5 }}>
              L’arrière du décor. Tout ce qui pilote l’outil · console, crédits, réglages, IA maison et espace de travail, réuni au même endroit.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <Stat label="Crédits" value={credits.toLocaleString('fr-FR')} />
            <Stat label="Marques" value={String(brandCount)} />
            <Stat label="Membres" value={String(members)} />
          </div>
        </div>
        <div style={{ marginTop: 14, fontSize: 12, color: 'var(--muted)' }}>
          Connecté · <b style={{ color: 'var(--ink-2)' }}>{s.user.email}</b> · {ROLE_LABEL[s.role]} · {PLAN_LABEL[s.plan]} ({PLAN_CREDITS[s.plan].toLocaleString('fr-FR')} crédits/mois)
        </div>
      </div>

      {sections.map((sec) => (
        <section key={sec.title} style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{sec.title}</h2>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{sec.hint}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {sec.tools.map((t) => {
              const inner = (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 38, height: 38, borderRadius: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, background: 'rgba(245,166,35,.12)', border: '1px solid rgba(245,166,35,.24)', flexShrink: 0 }}>{t.icon}</span>
                    <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{t.title}</span>
                    {t.badge && !t.soon && <span style={{ fontSize: 11, fontWeight: 800, color: '#ffca6b', background: 'rgba(245,166,35,.14)', border: '1px solid rgba(245,166,35,.3)', padding: '2px 8px', borderRadius: 999 }}>{t.badge}</span>}
                    {t.soon && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)', background: 'rgba(255,255,255,.06)', padding: '2px 8px', borderRadius: 999 }}>Bientôt</span>}
                  </div>
                  <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{t.desc}</p>
                </>
              );
              const style = { display: 'block', border: '1px solid var(--line-2)', borderRadius: 16, background: 'var(--surface)', padding: '16px 18px', textDecoration: 'none', opacity: t.soon ? 0.6 : 1 } as const;
              return t.soon
                ? <div key={t.title} style={{ ...style, cursor: 'default' }}>{inner}</div>
                : <Link key={t.title} href={t.href} style={style}>{inner}</Link>;
            })}
          </div>
        </section>
      ))}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{label}</div>
    </div>
  );
}
