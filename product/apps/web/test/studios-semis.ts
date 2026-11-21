import { randomUUID } from 'node:crypto';
import type { Session } from '../lib/auth';
import type { EquipeSession } from '../lib/equipe-plateforme';
import { jetonForgeTest, sessionEquipeTest } from './helpers/face-equipe';

/**
 * Semis commun des tests studios · deux espaces, trois marques, cinq personnes.
 *
 *   espace A : marques A1, A2 · membre `ua` (toutes marques), lecteur `uv`,
 *              membre restreint `ur` (A1 seulement)
 *   espace B : marque B1 · membre `ub`
 *
 * Les identifiants sont tirés au moment de l'import · `vi.hoisted` les rend
 * visibles des mocks.
 */
export function idsStudios() {
  return {
    wsA: randomUUID(), wsB: randomUUID(),
    brandA1: randomUUID(), brandA2: randomUUID(), brandB1: randomUUID(),
    ua: randomUUID(), uv: randomUUID(), ur: randomUUID(), ub: randomUUID(),
  };
}
export type IdsStudios = ReturnType<typeof idsStudios>;

export type SessionTest = Pick<Session, 'user' | 'workspaceId' | 'workspaceName' | 'role' | 'plan' | 'equipe'>;
/** Ce qu'un test surcharge · l'`equipe` y est une `EquipeSession` en clair, `session()` la convertit en jeton (authentique ou forgé). */
export type SurchargeSession = Partial<Omit<SessionTest, 'equipe'>> & { equipe?: EquipeSession | null };

/**
 * La session d'un membre du semis, comme `getSession` la rendrait.
 *
 * Une `equipe` passée dans `surcharge` est AUTHENTIFIÉE par défaut
 * (`sessionEquipeTest`, le registre que remplit `equipeDeSession`) · sinon
 * chaque lecteur la vaudrait absente (`equipeAuthentique`, suite de #1124).
 * C'est commode, et c'est un piège · un test qui veut éprouver une session
 * FORGÉE et passe son équipe ici l'obtiendrait authentique, et prouverait le
 * contraire de ce qu'il croit. Il passe donc `{ authentique: false }` · l'équipe
 * est alors posée BRUTE (`jetonForgeTest`, non inscrite), comme une session
 * reconstruite à la main, et chaque lecteur doit la valoir absente.
 */
export function session(
  ids: IdsStudios,
  qui: 'ua' | 'uv' | 'ur' | 'ub',
  surcharge: SurchargeSession = {},
  options: { authentique?: boolean } = {},
): SessionTest {
  const ws = qui === 'ub' ? ids.wsB : ids.wsA;
  const role = qui === 'uv' ? 'client_viewer' : 'member';
  const { equipe, ...reste } = surcharge;
  const jeton = !equipe ? null : options.authentique === false ? jetonForgeTest(equipe) : sessionEquipeTest(equipe);
  return {
    user: { id: ids[qui], email: `${qui}@studios.test`, name: null },
    workspaceId: ws, workspaceName: ws === ids.wsA ? 'Espace A' : 'Espace B',
    role, plan: 'core', ...reste, equipe: jeton,
  };
}

// Le type du client drizzle est volontairement lâche ici · le semis n'écrit que des colonnes simples.
export async function semer(db: any, schema: any, ids: IdsStudios): Promise<void> {
  await db.insert(schema.workspaces).values([
    { id: ids.wsA, name: 'Espace A', plan: 'core' },
    { id: ids.wsB, name: 'Espace B', plan: 'core' },
  ]);
  await db.insert(schema.users).values(['ua', 'uv', 'ur', 'ub'].map((q) => ({ id: ids[q as 'ua'], email: `${q}@studios.test` })));
  await db.insert(schema.workspaceMembers).values([
    { workspaceId: ids.wsA, userId: ids.ua, role: 'member' },
    { workspaceId: ids.wsA, userId: ids.uv, role: 'client_viewer' },
    { workspaceId: ids.wsA, userId: ids.ur, role: 'member' },
    { workspaceId: ids.wsB, userId: ids.ub, role: 'member' },
  ]);
  await db.insert(schema.brands).values([
    { id: ids.brandA1, workspaceId: ids.wsA, name: 'Marque A1' },
    { id: ids.brandA2, workspaceId: ids.wsA, name: 'Marque A2' },
    { id: ids.brandB1, workspaceId: ids.wsB, name: 'Marque B1 secrète' },
  ]);
  // `ur` est restreint à A1 · A2 lui est fermée.
  await db.insert(schema.studioMemberBrandScopes).values({ workspaceId: ids.wsA, userId: ids.ur, brandId: ids.brandA1 });
}
