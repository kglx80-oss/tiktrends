import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { peutGererConnaissances } from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { chargerConnaissancesAction } from '../../../actions/connaissances';
import { Icon } from '../../../../components/Icon';
import { cadrePage } from '../../../../components/ui';
import { EcranConnaissances } from './EcranConnaissances';

export const dynamic = 'force-dynamic';

/**
 * Connaissances · ce que l'équipe plateforme donne à lire à Jarvis.
 *
 * Réservé à l'ACCÈS TOTAL plateforme (Admin+ / Admin d'équipe, fondateur
 * compris) · lu sur `s.equipe`, jamais sur le rôle d'espace. Un owner ou un
 * admin d'espace client est renvoyé au tableau de bord · le même garde est
 * reposé dans chaque action serveur (`actions/connaissances`).
 */
export default async function ConnaissancesPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!peutGererConnaissances(s.equipe?.role)) redirect('/dashboard');

  const r = await chargerConnaissancesAction();

  // Les espaces et marques ne servent qu'au choix d'une portée restreinte ·
  // l'équipe plateforme les voit déjà tous ailleurs (tableau ADMIN+).
  const marques = db
    ? await db.select({ id: schema.brands.id, name: schema.brands.name, workspaceId: schema.brands.workspaceId, espace: schema.workspaces.name })
        .from(schema.brands)
        .innerJoin(schema.workspaces, eq(schema.brands.workspaceId, schema.workspaces.id))
        .orderBy(schema.workspaces.name, schema.brands.name)
        .limit(500)
        .catch(() => [])
    : [];
  const espaces = [...new Map(marques.map((m) => [m.workspaceId, { id: m.workspaceId, name: m.espace }])).values()];

  return (
    <main style={cadrePage}>
      <div style={{ position: 'relative', overflow: 'hidden', border: '1px solid rgba(245,166,35,.3)', borderRadius: 22, background: 'linear-gradient(135deg, rgba(245,166,35,.14), rgba(255,140,66,.06) 60%, var(--surface))', padding: '22px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: 'var(--grad-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-accent)', flexShrink: 0 }}><Icon name="brain" size={23} /></div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, color: 'var(--ink)', letterSpacing: -0.5 }}>Connaissances</h1>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: 'var(--on-accent)', background: 'var(--grad-accent)' }}>ADMIN+</span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              Ce que l’équipe donne à lire à Jarvis · consignes, méthodes d’itération, savoirs, données.
            </p>
          </div>
          <Link href="/admin" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 16px', borderRadius: 999, background: 'rgba(255,255,255,.06)', border: '1px solid var(--line-2)', color: 'var(--ink)', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>← Tableau de bord</Link>
        </div>
      </div>

      {r.error || !r.vue
        ? <div role="alert" style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(229,72,77,.4)', background: 'rgba(229,72,77,.1)', color: '#e5484d', fontSize: 13, fontWeight: 700 }}>{r.error ?? 'Lecture impossible.'}</div>
        : <EcranConnaissances vueInitiale={r.vue} espaces={espaces} marques={marques.map((m) => ({ id: m.id, name: m.name, workspaceId: m.workspaceId }))} />}
    </main>
  );
}
