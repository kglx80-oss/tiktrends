import { describe, expect, it } from 'vitest';
import { effectiveAccess } from '../lib/access';
import { FEATURES, accountSections, canAccess, denyReason, faceEquipeReconnue, ouverturesParRole, railNav, type Access, type Plan, type Role } from '../lib/rbac';
import { sessionEquipeTest } from './helpers/face-equipe';

/**
 * Suite de #1122 · la face équipe est infalsifiable À L'EXÉCUTION.
 *
 * Trois tours de relecture ont trouvé, chaque fois, de nouvelles formes qui
 * forgent la face équipe sans que le lint les voie (cast vers un type
 * fonction, `any` dans une propriété d'une réponse d'API, garde générique…).
 * La barrière n'est donc plus une liste d'interdits · `effectiveAccess`
 * inscrit chaque face qu'il construit, et les lecteurs (`canAccess`,
 * `denyReason`, le rail, le menu) ne reconnaissent que les faces inscrites.
 *
 * On exécute le VRAI code · chaque face forgée, quelle que soit la forme qui
 * l'a fait compiler, donne exactement la face CLIENT (rôle d'espace, verrous
 * de formule). La vraie face, issue de `effectiveAccess` pour un compte
 * admissible, ouvre ce que sa matrice ouvre, sans verrou de formule.
 *
 * Ce fichier forge des faces EXPRÈS · il est exempté de
 * `tiktrends/face-equipe-forcee` dans eslint.config.mjs, et de lui seul.
 */

const VEILLE = FEATURES.find((f) => f.key === 'inspo')!; // minPlan core · rubrique « veille »
const role: Role = 'member';
const plan: Plan = 'starter';
const vraie = effectiveAccess({ role, plan, user: { email: 'membre-equipe@tiktrends.invalid' }, equipe: sessionEquipeTest({ role: 'membre', matrice: { membre: ['veille'] }, plateformeAdmissible: true }) });
const client: Access = { role, plan };
/** La face qu'on cherche à forger · accès total, aucune matrice. */
const brute = () => ({ role: 'adminplus' as const, matrice: {} });

function est<T>(_x: unknown): _x is T { return true; }

async function forgees(): Promise<Array<[string, Access]>> {
  // A · cast vers un type fonction qui rend Access.
  const identite = ((x: unknown) => x) as (x: unknown) => Access;
  // B · `any` caché dans une propriété d'une réponse d'API.
  const reponse = (await new Response(JSON.stringify({ role, plan, equipe: brute() })).json()) as { role: Role; plan: Plan; equipe: any };
  // C · garde générique avec un argument explicite.
  const inconnu: unknown = { role, plan, equipe: brute() };
  const gardee = est<Access>(inconnu) ? inconnu : client;
  return [
    ['A · ((x) => x) as (x: unknown) => Access', identite({ role, plan, equipe: brute() })],
    ['B · (await res.json()) as { …; equipe: any }', reponse],
    ['C · est<Access>(e)', gardee],
    ['equipe: … as any', { role, plan, equipe: brute() as any }],
    ['l’objet entier as any', { role, plan, equipe: brute() } as any],
    ['JSON.parse d’une vraie face', JSON.parse(JSON.stringify(vraie))],
    ['copie littérale d’une vraie face', { role, plan, equipe: { ...vraie.equipe! } }],
    ['structuredClone d’une vraie face', structuredClone(vraie)],
    ['Object.create d’une vraie face', { role, plan, equipe: Object.create(vraie.equipe!) }],
    ['une chaîne posée par un any', { role, plan, equipe: 'adminplus' as any }],
  ];
}

describe('Face équipe · le contrôle à l’exécution', () => {
  it('la vraie face (effectiveAccess, compte admissible) ouvre la Veille sans verrou de formule (sinon le reste ne prouve rien)', () => {
    expect(faceEquipeReconnue(vraie), 'effectiveAccess ne pose plus une face reconnue').not.toBeNull();
    expect(canAccess(vraie, VEILLE)).toBe(true);
    expect(denyReason(vraie, VEILLE)).toBeNull();
    expect(canAccess(client, VEILLE), 'la face client devrait être verrouillée par la formule · le témoin ne témoigne plus').toBe(false);
    expect(denyReason(client, VEILLE)).toBe('plan');
  });

  it('chaque face forgée vaut la face CLIENT · canAccess, denyReason, rail, menu et accueil identiques', async () => {
    const attendu = { canAccess: false, denyReason: 'plan', rail: railNav(client), menu: accountSections(client), accueil: ouverturesParRole(client) };
    for (const [quoi, a] of await forgees()) {
      expect(faceEquipeReconnue(a), `${quoi} · reconnue comme face équipe`).toBeNull();
      expect({ canAccess: canAccess(a, VEILLE), denyReason: denyReason(a, VEILLE), rail: railNav(a), menu: accountSections(a), accueil: ouverturesParRole(a) },
        `${quoi} · une face forgée ouvre les rubriques d’équipe sans privilegesEquipe`).toEqual(attendu);
    }
  });

  it('une vraie face est gelée · on ne peut pas élargir son rôle ni sa matrice après coup', () => {
    const face = vraie.equipe as unknown as { role: string; matrice: Record<string, string[]> };
    const GEL = 'une face reconnue se modifie · on élargirait après coup son rôle ou sa matrice, sans privilegesEquipe';
    expect(() => { face.role = 'adminplus'; }, `${GEL} (rôle)`).toThrow(TypeError);
    expect(() => { face.matrice.membre!.push('adsmap'); }, `${GEL} (rubriques d’un rôle)`).toThrow(TypeError);
    expect(() => { face.matrice.dev = ['adsmap']; }, `${GEL} (nouveau rôle dans la matrice)`).toThrow(TypeError);
    expect(vraie.equipe!.role).toBe('membre');
  });

  it('un accès qui garde la MÊME face (spread de l’Access) reste reconnu · les pages qui recomposent un Access ne perdent rien', () => {
    const recompose: Access = { ...vraie, plan: 'core' };
    expect(faceEquipeReconnue(recompose)).toBe(vraie.equipe);
    expect(canAccess(recompose, VEILLE)).toBe(true);
  });

  it('un compte d’équipe NON admissible n’a pas de face équipe du tout', () => {
    // AUTHENTIFIÉE (comme getSession la rend) · sinon elle vaudrait absente et le cas passerait sans éprouver l'admissibilité.
    const capte = effectiveAccess({ role, plan, user: { email: 'capte@tiktrends.invalid' }, equipe: sessionEquipeTest({ role: 'membre', matrice: { membre: ['veille'] }, plateformeAdmissible: false }) });
    expect(capte.equipe).toBeUndefined();
    expect(canAccess(capte, VEILLE)).toBe(false);
  });
});
