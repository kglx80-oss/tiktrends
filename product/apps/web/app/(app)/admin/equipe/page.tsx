import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db, schema } from '@tiktrends/db';
import { accesTotal, ROLES_PLATEFORME, type RolePlateforme, type MatriceDroits } from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { Icon } from '../../../../components/Icon';
import { EcranEquipe } from './EcranEquipe';

export const dynamic = 'force-dynamic';

const OK: Record<string, string> = {
  staff: 'Membre enregistré.', retire: 'Membre retiré.', matrice: 'Droits enregistrés.',
};
const ERR: Record<string, string> = {
  email: 'Email invalide.', role: 'Rôle inconnu.', soi: 'Vous ne pouvez pas vous retirer vous-même.',
};

const rang = (r: RolePlateforme) => ROLES_PLATEFORME.indexOf(r);

/**
 * Gestion de l'équipe interne · réservée à l'ACCÈS TOTAL (adminplus/admin).
 *
 * Le garde lit le rôle d'ÉQUIPE de la session (posé par getSession), pas
 * « fondateur » : un admin ajouté ici gère l'équipe à son tour. On charge les
 * membres et la matrice éditable, puis on laisse l'écran client rendre les
 * formulaires (chaque changement a son action serveur, voir actions/equipe).
 */
export default async function AdminEquipePage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!s.equipe || !accesTotal(s.equipe.role)) redirect('/dashboard');
  const { ok, e } = await searchParams;

  const staffRows = db ? await db.select().from(schema.platformStaff) : [];
  const staff = staffRows
    .map((r) => ({ email: r.email, role: r.role as RolePlateforme }))
    .sort((a, b) => rang(a.role) - rang(b.role) || a.email.localeCompare(b.email));

  const rightsRows = db ? await db.select().from(schema.platformRoleRights) : [];
  const matrice: MatriceDroits = {};
  for (const r of rightsRows) matrice[r.role as RolePlateforme] = (r.rubriques as string[]) ?? [];

  return (
    <main style={{ padding: '26px clamp(16px, 4vw, 32px) 60px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ position: 'relative', overflow: 'hidden', border: '1px solid rgba(245,166,35,.3)', borderRadius: 22, background: 'linear-gradient(135deg, rgba(245,166,35,.14), rgba(255,140,66,.06) 60%, var(--surface))', padding: '22px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: 'var(--grad-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-accent)', flexShrink: 0 }}><Icon name="users" size={23} /></div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, color: 'var(--ink)', letterSpacing: -0.5 }}>Équipe & droits</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-2)' }}>Rôles de l’agence et rubriques visibles par rôle · {s.user.email}</p>
          </div>
          <Link href="/admin" style={{ padding: '9px 16px', borderRadius: 999, background: 'rgba(255,255,255,.06)', border: '1px solid var(--line-2)', color: 'var(--ink)', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>← Tableau de bord</Link>
        </div>
      </div>

      {ok && OK[ok] && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(48,164,108,.4)', background: 'rgba(48,164,108,.1)', color: '#2fa46c', fontSize: 13, fontWeight: 700 }}>{OK[ok]}</div>}
      {e && ERR[e] && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(229,72,77,.4)', background: 'rgba(229,72,77,.1)', color: '#e5484d', fontSize: 13, fontWeight: 700 }}>{ERR[e]}</div>}

      <EcranEquipe moiEmail={s.user.email} staff={staff} matrice={matrice} />
    </main>
  );
}
