import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { MOT_DE_PASSE_MIN, liensAccesProfil, messagesRetourProfil, THEME_COOKIE, preferenceDepuisCookie } from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { PLAN_LABEL, ROLE_LABEL, roleAtLeast } from '../../../../lib/rbac';
import { isFounder } from '../../../../lib/founder';
import { changePasswordAction, saveProfileAction } from '../../../actions/admin';
import { Profil } from '../../../../spatial/vues/reglages/Profil';

export const dynamic = 'force-dynamic';

/**
 * « Mon profil » · vague 4 · même garde que l'écran V5 retiré (toute session) ·
 * l'identité vient de `users`, les liens d'accès des droits réels (abonnement ·
 * administrateur ; Tour de contrôle · fondateur administrateur).
 */
export default async function ProfilSpatial() {
  const s = await getSession();
  if (!s) redirect('/login');
  let avatar = '', masquer = false;
  if (db) {
    const [u] = await db.select({ a: schema.users.avatarUrl, h: schema.users.hidePersonalInfo }).from(schema.users).where(eq(schema.users.id, s.user.id)).limit(1);
    avatar = u?.a ?? '';
    masquer = u?.h ?? false;
  }
  const admin = roleAtLeast(s.role, 'admin');
  return (
    <Profil
      identite={{ nom: s.user.name || '', email: s.user.email, avatar, masquer }}
      acces={{ espace: s.workspaceName, role: ROLE_LABEL[s.role], abonnement: PLAN_LABEL[s.plan] }}
      liens={liensAccesProfil({ admin, fondateur: admin && isFounder(s.user.email) })}
      enregistrer={db ? saveProfileAction : null}
      changerMotDePasse={db ? changePasswordAction : null}
      motDePasseMin={MOT_DE_PASSE_MIN}
      retours={messagesRetourProfil()}
      theme={preferenceDepuisCookie((await cookies()).get(THEME_COOKIE)?.value)}
    />
  );
}
