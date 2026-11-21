import { redirect } from 'next/navigation';
import { desc, eq, inArray, isNull, like, or } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  CLES_RUBRIQUES, LIBELLE_ROLE_PLATEFORME, ROLES_MATRICIELS, ROLES_PLATEFORME, RUBRIQUES_PLATEFORME, accesTotal, adminDateCourte, adminIlYa,
  admissibiliteMembre, caseDroit, initialesAvatar, messageNonAdmissible, rubriquesApresBascule, texteAudit, vueEquipeAdmin, type MatriceDroits, type RolePlateforme,
} from '@tiktrends/core';
import { getSession } from '../../../../../lib/auth';
import { equipeAuthentique } from '../../../../../lib/registre-equipe-session';
import { estFondateurCode } from '../../../../../lib/founder';
import { Droits, DroitsNonAdmissible } from '../../../../../spatial/vues/admin/Droits';
import { bandeauSeul } from '../donnees';
import { droitsSousNavAdmin } from '../../../../../lib/onglets-reglages';

export const dynamic = 'force-dynamic';

const OK: Record<string, string> = { staff: 'Membre enregistré.', retire: 'Membre retiré.', matrice: 'Droits enregistrés.' };
/**
 * Les refus des actions, lus sur l'écran COMPLET seul. Le refus
 * `?e=admissible` (`exigerAccesTotal`, accès total NON admissible) n'a pas de
 * légende · il ne tombe jamais sur cet écran (`vueEquipeAdmin` complet ⇔
 * `peutEcrireEquipe`, éprouvé dans le noyau), son lecteur n'y lit que son
 * message (`DroitsNonAdmissible`).
 */
const ERR: Record<string, string> = {
  email: 'E-mail invalide.', role: 'Rôle inconnu.', soi: 'Tu ne peux pas te retirer ni te rétrograder toi-même.',
};

/**
 * « Rôles & droits » · porte de `/admin/equipe` (V5) · la règle du noyau
 * `vueEquipeAdmin` · le rôle d'ÉQUIPE à accès total ADMISSIBLE (adminplus/admin,
 * fondateur codé compris), pas « fondateur » · un admin ajouté ici gère
 * l'équipe à son tour, comme dans l'écran V5. Un compte d'équipe NON
 * admissible (quel que soit son rôle) ne lit QUE son message · ni la liste
 * (e-mails préinscrits sans compte, qu'il pourrait capter à leur tour), ni
 * l'audit, ni le bandeau de la plateforme · rien n'est lu en base pour lui.
 * Les écritures (matrice, ajout, changement de rôle, retrait) passent par les
 * actions de l'équipe, qui reposent la garde et l'admissibilité (SEC-10).
 */
export default async function DroitsSpatial({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  // L'équipe AUTHENTIQUE seule (suite de #1124) · reconstruite à la main, elle vaut absente · refus.
  const equipe = equipeAuthentique(s);
  const vue = vueEquipeAdmin(equipe);
  if (vue === 'refus') redirect('/dashboard');
  if (vue === 'message') return <DroitsNonAdmissible message={messageNonAdmissible(equipe)!} />;
  const { ok, e } = await searchParams;

  const [b, staffRows, rightsRows, auditRows] = await Promise.all([
    bandeauSeul(),
    db ? db.select().from(schema.platformStaff) : Promise.resolve([]),
    db ? db.select().from(schema.platformRoleRights) : Promise.resolve([]),
    db ? db.select({ id: schema.studioAuditEvents.id, action: schema.studioAuditEvents.action, le: schema.studioAuditEvents.occurredAt, nom: schema.users.name, email: schema.users.email, role: schema.studioAuditEvents.effectiveRole })
      .from(schema.studioAuditEvents).leftJoin(schema.users, eq(schema.users.id, schema.studioAuditEvents.actorId))
      .where(or(isNull(schema.studioAuditEvents.workspaceId), like(schema.studioAuditEvents.action, 'studios.%')))
      .orderBy(desc(schema.studioAuditEvents.occurredAt)).limit(5) : Promise.resolve([]),
  ]);
  // SEC-10 · la date de création du compte de chaque membre, pour dire s'il est
  // admissible · même lecture que `equipeDeSession` (e-mail stocké en minuscules).
  const emails = staffRows.map((r) => r.email);
  const comptes = db && emails.length
    ? await db.select({ email: schema.users.email, createdAt: schema.users.createdAt }).from(schema.users).where(inArray(schema.users.email, emails))
    : [];
  const compteDe = new Map(comptes.map((c) => [c.email, c.createdAt]));
  const matrice: MatriceDroits = {};
  for (const r of rightsRows) matrice[r.role as RolePlateforme] = (r.rubriques as string[]) ?? [];
  const rang = (r: RolePlateforme) => ROLES_PLATEFORME.indexOf(r);
  const maintenant = new Date();

  return (
    <Droits
      bandeau={b}
      legende={(ok && OK[ok]) || (e && ERR[e]) || 'Clique une case pour ouvrir ou fermer la rubrique · enregistré aussitôt. Admin+ et Admin voient tout.'}
      roles={ROLES_MATRICIELS.map((r) => LIBELLE_ROLE_PLATEFORME[r])}
      verrouille={false}
      lignes={RUBRIQUES_PLATEFORME.filter((r) => CLES_RUBRIQUES.includes(r.key)).map((rub) => ({
        rubrique: rub.label,
        cases: ROLES_MATRICIELS.map((role) => {
          const c = caseDroit(role, rub.key, matrice);
          return { role, niveau: c.niveau, libelle: c.libelle, aria: `${rub.label} · ${LIBELLE_ROLE_PLATEFORME[role]} : ${c.libelle}`, apres: rubriquesApresBascule(role, rub.key, matrice) };
        }),
      }))}
      rolesInvitation={ROLES_PLATEFORME.map((r) => ({ cle: r, libelle: LIBELLE_ROLE_PLATEFORME[r] }))}
      equipe={staffRows
        .map((r) => ({ email: r.email, role: r.role as RolePlateforme, depuis: r.createdAt as Date }))
        .sort((a, c) => rang(a.role) - rang(c.role) || a.email.localeCompare(c.email))
        .map((m) => ({
          email: m.email, initiales: initialesAvatar('', m.email), role: LIBELLE_ROLE_PLATEFORME[m.role], total: accesTotal(m.role), depuis: `depuis le ${adminDateCourte(m.depuis)}`,
          cleRole: m.role, moi: m.email.trim().toLowerCase() === s.user.email.trim().toLowerCase(),
          admissibilite: admissibiliteMembre({ role: m.role, fondateurCode: estFondateurCode(m.email), compteCreeLe: compteDe.get(m.email) ?? null, staffInscritLe: m.depuis }),
        }))}
      gestion
      journal={droitsSousNavAdmin(s).tour ? '/admin/audit' : null}
      audit={auditRows.map((a) => {
        const acteur = a.nom || a.email || (a.role.startsWith('script:') ? 'Script' : 'Équipe');
        return { id: a.id, initiales: initialesAvatar(a.nom ?? '', a.email ?? acteur), acteur, texte: texteAudit(a.action), quand: adminIlYa(a.le as Date, maintenant) };
      })}
    />
  );
}
