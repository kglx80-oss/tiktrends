import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db, schema } from '@tiktrends/db';
import { accesTotal, ROLES_PLATEFORME, type RolePlateforme, type MatriceDroits } from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { Icon } from '../../../../components/Icon';
import { EcranEquipe } from './EcranEquipe';
import { cadrePage } from '../../../../components/ui';
import { OngletsAdministration } from '../../../../components/OngletsReglages';

export const dynamic = 'force-dynamic';

const OK: Record<string, string> = {
  staff: 'Membre enregistré.', retire: 'Membre retiré.', matrice: 'Droits enregistrés.',
};
const ERR: Record<string, string> = {
  email: 'Email invalide.', role: 'Rôle inconnu.', soi: 'Vous ne pouvez pas vous retirer vous-même.',
  admissible: 'Votre compte a été créé après son inscription dans l’équipe : il ne peut pas modifier l’équipe. Un fondateur doit vous réinscrire.',
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
    <main style={cadrePage}>
      <OngletsAdministration session={s} chemin="/admin/equipe" />
      <div style={{ position: 'relative', overflow: 'hidden', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', borderRadius: 22, background: 'linear-gradient(135deg in srgb, color-mix(in srgb, var(--accent) 14%, transparent), color-mix(in srgb, var(--accent) 6%, transparent) 60%, var(--surface))', padding: '22px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: 'var(--grad-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-accent)', flexShrink: 0 }}><Icon name="users" size={23} /></div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, color: 'var(--ink)', letterSpacing: -0.5 }}>Équipe & droits</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-2)' }}>Rôles de l’agence et rubriques visibles par rôle · {s.user.email}</p>
          </div>
          <Link href="/admin" style={{ padding: '9px 16px', borderRadius: 999, background: 'color-mix(in srgb, var(--line) 50%, transparent)', border: '1px solid var(--line-2)', color: 'var(--ink)', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>← Tableau de bord</Link>
        </div>
      </div>

      {ok && OK[ok] && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--success) 40%, transparent)', background: 'color-mix(in srgb, var(--success) 10%, transparent)', color: 'var(--success)', fontSize: 13, fontWeight: 700 }}>{OK[ok]}</div>}
      {e && ERR[e] && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)', color: 'var(--danger)', fontSize: 13, fontWeight: 700 }}>{ERR[e]}</div>}

      <EcranEquipe moiEmail={s.user.email} staff={staff} matrice={matrice} />
    </main>
  );
}
