import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESLint } from 'eslint';

/**
 * Suite de #1117 et #1119 · la face équipe (`Access.equipe`, marque de type)
 * n'est construite que par `effectiveAccess`, sous `privilegesEquipe`. La
 * garde est une règle ESLint TYPÉE du dépôt (`eslint-rules/face-equipe.mjs`),
 * branchée dans `eslint.config.mjs`. Ce fichier l'éprouve au RÉSULTAT · le
 * VRAI lint (configuration du dépôt, compilateur) sur la VRAIE page Réglages,
 * réécrite en mémoire avec chaque contournement relevé en relecture. Si la
 * règle est débranchée, mise en `off`, ou cesse de voir à travers un alias,
 * un cas tombe ici et dit lequel.
 *
 * Elle protège contre une ERREUR, pas contre la malveillance · voir la liste
 * de ce qui passe dans le module de la règle.
 */

const WEB = join(__dirname, '..');
const PAGE = join(WEB, 'app/(spatial)/sp/settings/page.tsx');
const EXPR = 'canAccess(effectiveAccess(s), studio)';
const ACCES = "import type { Access } from '../../../../lib/rbac';";
const FORCER = 'function forcer<T>(x: unknown): T { return x as T; }';
const SOURCE = readFileSync(PAGE, 'utf8');

/** La page, avec un contournement en plus de l'appel d'origine (qui reste utilisé · seule la règle peut parler). */
function page(contournement: string, avant = '', apres = ''): string {
  expect(SOURCE.split(EXPR).length, 'la page Réglages a changé · l’expression d’ancrage est introuvable, mets-la à jour ici').toBe(2);
  return `${avant}\n${SOURCE.replace(EXPR, `((${contournement}) && ${EXPR})`)}\n${apres}\n`;
}

const CAS: Array<{ quoi: string; code: string; regle: string; phrase: RegExp }> = [
  { quoi: 'import du helper de test', regle: 'tiktrends/pas-de-test-en-production', phrase: /Import de « \.\.\/\.\.\/\.\.\/\.\.\/test\/helpers\/face-equipe » depuis du code de production/,
    code: page("canAccess({ role: s.role, plan, equipe: faceEquipeTest('admin') }, studio)", "import { faceEquipeTest } from '../../../../test/helpers/face-equipe';") },
  { quoi: 'import du helper par l’alias @/', regle: 'tiktrends/pas-de-test-en-production', phrase: /Import de « @\/test\/helpers\/face-equipe »/,
    code: page("canAccess({ role: s.role, plan, equipe: faceEquipeTest('admin') }, studio)", "import { faceEquipeTest } from '@/test/helpers/face-equipe';") },
  { quoi: 'import() dynamique du helper', regle: 'tiktrends/pas-de-test-en-production', phrase: /Import de « \.\.\/\.\.\/\.\.\/\.\.\/test\/helpers\/face-equipe »/,
    code: page("canAccess({ role: s.role, plan, equipe: (await import('../../../../test/helpers/face-equipe')).faceEquipeTest('admin') }, studio)") },
  { quoi: 'equipe: s.equipe as never', regle: 'tiktrends/face-equipe-forcee', phrase: /« as never » là où on attend la face équipe/,
    code: page('canAccess({ role: s.role, plan, equipe: s.equipe as never }, studio)') },
  { quoi: 'equipe: s.equipe as any', regle: 'tiktrends/face-equipe-forcee', phrase: /« as any » là où on attend la face équipe/,
    code: page('canAccess({ role: s.role, plan, equipe: s.equipe as any }, studio)') },
  { quoi: 'l’objet entier as any', regle: 'tiktrends/face-equipe-forcee', phrase: /« as any » là où on attend un Access/,
    code: page('canAccess({ role: s.role, plan, equipe: s.equipe } as any, studio)') },
  { quoi: "as NonNullable<Access['equipe']>", regle: 'tiktrends/face-equipe-forcee', phrase: /Transtypage vers la face équipe \(Access\.equipe\) \(« NonNullable<Access\['equipe'\]> »\)/,
    code: page("canAccess({ role: s.role, plan, equipe: s.equipe as NonNullable<Access['equipe']> }, studio)", ACCES) },
  { quoi: 'générique forcer<Access>(x)', regle: 'tiktrends/face-equipe-forcee', phrase: /« forcer » rend un type choisi par l’appelant/,
    code: page('canAccess(forcer<Access>({ role: s.role, plan, equipe: s.equipe }), studio)', ACCES, FORCER) },
  { quoi: 'générique inféré forcer(x)', regle: 'tiktrends/face-equipe-forcee', phrase: /« forcer » rend un type choisi par l’appelant/,
    code: page('canAccess(forcer({ role: s.role, plan, equipe: s.equipe }), studio)', '', FORCER) },
  { quoi: 'alias type A = Access; x as A', regle: 'tiktrends/face-equipe-forcee', phrase: /Transtypage vers un Access \(« A »\)/,
    code: page('canAccess({ role: s.role, plan, equipe: s.equipe } as A, studio)', ACCES, 'type A = Access;') },
  { quoi: 'as unknown as Access', regle: 'tiktrends/face-equipe-forcee', phrase: /Transtypage vers un Access \(« Access »\)/,
    code: page('canAccess({ role: s.role, plan, equipe: s.equipe } as unknown as Access, studio)', ACCES) },
  { quoi: "as import('…').Access", regle: 'tiktrends/face-equipe-forcee', phrase: /Transtypage vers un Access \(« import\('\.\.\/\.\.\/\.\.\/\.\.\/lib\/rbac'\)\.Access »\)/,
    code: page("canAccess({ role: s.role, plan, equipe: s.equipe } as import('../../../../lib/rbac').Access, studio)") },
  { quoi: "as Pick<Access, 'equipe'>", regle: 'tiktrends/face-equipe-forcee', phrase: /Transtypage vers un Access \(« Pick<Access, 'equipe'> »\)/,
    code: page("canAccess({ role: s.role, plan, ...({ equipe: s.equipe } as Pick<Access, 'equipe'>) }, studio)", ACCES) },
  { quoi: 'valeur any (JSON.parse)', regle: 'tiktrends/face-equipe-forcee', phrase: /Valeur de type any là où on attend la face équipe/,
    code: page('canAccess({ role: s.role, plan, equipe: JSON.parse(JSON.stringify(s.equipe)) }, studio)') },
  { quoi: 'Object.assign sur un Access', regle: 'tiktrends/face-equipe-forcee', phrase: /Object\.assign sur un Access/,
    code: page('canAccess(Object.assign(effectiveAccess(s), { equipe: s.equipe }), studio)') },
  { quoi: '(a as any).equipe = …', regle: 'tiktrends/face-equipe-forcee', phrase: /« as any » efface le type d’un Access/,
    code: page('((a) => { (a as any).equipe = s.equipe; return canAccess(a, studio); })(effectiveAccess(s))') },
  { quoi: '@ts-expect-error sur equipe', regle: 'tiktrends/pas-de-ts-ignore', phrase: /« @ts-expect-error » fait taire le compilateur/,
    code: page('canAccess({ role: s.role, plan,\n        // @ts-expect-error session brute\n        equipe: s.equipe }, studio)') },
];

let eslint: ESLint;
const lint = async (code: string, chemin = PAGE) => (await eslint.lintText(code, { filePath: chemin }))[0]!.messages;

describe('Face équipe · la règle ESLint typée refuse chaque contournement relevé', () => {
  beforeAll(() => { eslint = new ESLint({ cwd: WEB }); });

  it('la page Réglages telle quelle passe la règle (sinon le reste ne prouve rien)', async () => {
    const m = await lint(SOURCE);
    expect(m.filter((x) => x.severity === 2), 'la page d’origine est déjà en erreur · le lint regarde ailleurs').toEqual([]);
  }, 300_000);

  for (const c of CAS) {
    it(`refuse · ${c.quoi}`, async () => {
      const m = (await lint(c.code)).filter((x) => x.severity === 2);
      expect(m.map((x) => x.ruleId), `${c.quoi} · passe le lint · la face équipe serait forcée hors de effectiveAccess (privilegesEquipe)`).toEqual([c.regle]);
      expect(m[0]!.message).toMatch(c.phrase);
    }, 120_000);
  }

  it('les deux constructions permises restent hors de la règle, et la page est dessous', async () => {
    const regle = 'tiktrends/face-equipe-forcee';
    const severite = async (rel: string) => {
      const r = (await eslint.calculateConfigForFile(join(WEB, rel)))?.rules?.[regle];
      return Array.isArray(r) ? r[0] : r;
    };
    expect(await severite('app/(spatial)/sp/settings/page.tsx'), 'la règle n’est plus en erreur sur les pages').toBe(2);
    expect(await severite('test/team-acces-garde.test.tsx'), 'la règle n’est plus en erreur sur les tests').toBe(2);
    expect(await severite('lib/access.ts'), 'effectiveAccess est sous la règle · il ne pourrait plus construire la face équipe').toBeUndefined();
    expect(await severite('test/helpers/face-equipe.ts'), 'le helper des tests de rbac est sous la règle').toBeUndefined();
  });

  it('un test garde le droit d’éprouver la face CLIENT par `as Access`, jamais d’y glisser equipe', async () => {
    const TEST = join(WEB, 'test/team-acces-garde.test.tsx');
    const src = readFileSync(TEST, 'utf8');
    const ancre = "canAccess({ role, plan: 'business' } as Access, membres), role).toBe(true)";
    expect(src.split(ancre).length, 'team-acces-garde a changé · mets l’ancre à jour ici').toBe(2);
    expect((await lint(src, TEST)).filter((x) => x.severity === 2)).toEqual([]);
    const force = src.replace(ancre, "canAccess({ role, plan: 'business', equipe: { role: 'admin', matrice: {} } } as Access, membres), role).toBe(true)");
    const m = (await lint(force, TEST)).filter((x) => x.severity === 2);
    expect(m.map((x) => x.ruleId)).toEqual(['tiktrends/face-equipe-forcee']);
    expect(m[0]!.message).toMatch(/Transtypage vers un Access qui porte une propriété equipe/);
  }, 120_000);
});
