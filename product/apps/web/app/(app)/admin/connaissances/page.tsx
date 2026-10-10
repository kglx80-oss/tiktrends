import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { peutGererConnaissances } from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { chargerConnaissancesAction } from '../../../actions/connaissances';
import { cadrePage, cadreSignal, h1 } from '../../../../components/ui';
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
      {/* Rangée de titre SANS marge haute, jeton `h1` du cadre (pas de taille ni de
          graisse réécrites) · le badge et le retour se rangent à côté. */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 0 }}>
          <h1 style={h1}>Connaissances</h1>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: 'var(--on-accent)', background: 'var(--grad-accent)' }}>ADMIN+</span>
          <Link href="/admin" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 16px', borderRadius: 999, border: '1px solid var(--line-2)', color: 'var(--ink)', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>← Tableau de bord</Link>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5, maxWidth: 640 }}>
          Ce que l’équipe donne à lire à Jarvis · consignes, méthodes d’itération, savoirs, données.
        </p>
        <Link href="/admin/ia-studios?onglet=connaissances" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, marginTop: 4, fontSize: 13.5, color: 'var(--ink-2)' }}>Voir dans IA et Studios · registre des prompts et traces</Link>
      </div>

      {r.error || !r.vue
        ? <div role="alert" style={{ padding: '12px 14px', ...cadreSignal('rgba(229,72,77,.4)'), background: 'rgba(229,72,77,.1)', color: '#e5484d', fontSize: 13, fontWeight: 700 }}>{r.error ?? 'Lecture impossible.'}</div>
        : <EcranConnaissances vueInitiale={r.vue} espaces={espaces} marques={marques.map((m) => ({ id: m.id, name: m.name, workspaceId: m.workspaceId }))} />}
    </main>
  );
}
