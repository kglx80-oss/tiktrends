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
  // Relecture de #1122 · chacun compilait et passait la règle sur 1f06d0f4.
  { quoi: 'garde de type x is Access[\'equipe\']', regle: 'tiktrends/face-equipe-forcee', phrase: /Garde de type vers la face équipe \(Access\.equipe\) \(« _x is NonNullable<Access\['equipe'\]> »\)/,
    code: page('((e: unknown) => estFace(e) && canAccess({ role: s.role, plan, equipe: e }, studio))(s.equipe)', ACCES, "function estFace(_x: unknown): _x is NonNullable<Access['equipe']> { return true; }") },
  { quoi: 'garde d’assertion asserts x is …', regle: 'tiktrends/face-equipe-forcee', phrase: /Garde de type vers la face équipe \(Access\.equipe\) \(« asserts _x is/,
    code: page('((e: unknown) => { verifierFace(e); return canAccess({ role: s.role, plan, equipe: e }, studio); })(s.equipe)', ACCES, "function verifierFace(_x: unknown): asserts _x is NonNullable<Access['equipe']> {}") },
  { quoi: 'surcharge qui rend un Access', regle: 'tiktrends/face-equipe-forcee', phrase: /Signature de surcharge qui rend un Access \(« Access »\)/,
    code: page('canAccess(vers({ role: s.role, plan, equipe: s.equipe }), studio)', ACCES, 'function vers(x: unknown): Access;\nfunction vers(x: unknown): unknown { return x; }') },
  { quoi: 'générique à paramètre muet forcer<Access>(x)', regle: 'tiktrends/face-equipe-forcee', phrase: /« forcer<Access> » · un argument de type explicite qui porte un Access/,
    code: page('canAccess(forcer<Access>({ role: s.role, plan, equipe: s.equipe }), studio)', ACCES, 'function forcer<T>(x: unknown, _?: T): T { return x as T; }') },
  { quoi: '[{…}] as any[] vers Access[]', regle: 'tiktrends/face-equipe-forcee', phrase: /« as any\[\] » là où on attend un Access/,
    code: page('((l: Access[]) => l.some((a) => canAccess(a, studio)))([{ role: s.role, plan, equipe: s.equipe }] as any[])', ACCES) },
  { quoi: 'Promise<Access> rendue par res.json()', regle: 'tiktrends/face-equipe-forcee', phrase: /Valeur de type any là où on attend un Access/,
    code: page("canAccess(await lire('/api/acces'), studio)", ACCES, 'async function lire(u: string): Promise<Access> { return (await fetch(u)).json(); }') },
  { quoi: 'Record<string, any> affecté à Record<string, Access>', regle: 'tiktrends/face-equipe-forcee', phrase: /Valeur de type any là où on attend un Access/,
    code: page('canAccess(lireCache()!, studio)', ACCES, 'const cacheAny: Record<string, any> = {};\nfunction lireCache(): Access | undefined { const c: Record<string, Access> = cacheAny; return c.x; }') },
  { quoi: '/** @ts-expect-error */ (forme JSDoc)', regle: 'tiktrends/pas-de-ts-ignore', phrase: /« @ts-expect-error » fait taire le compilateur/,
    code: page('canAccess({ role: s.role, plan,\n        /** @ts-expect-error session brute */\n        equipe: s.equipe }, studio)') },
  { quoi: 'détour @/lib/../test/helpers', regle: 'tiktrends/pas-de-test-en-production', phrase: /Import de « @\/lib\/\.\.\/test\/helpers\/face-equipe »/,
    code: page("canAccess({ role: s.role, plan, equipe: faceEquipeTest('admin') }, studio)", "import { faceEquipeTest } from '@/lib/../test/helpers/face-equipe';") },
  { quoi: 'relais par un module lib/x.test', regle: 'tiktrends/pas-de-test-en-production', phrase: /Import de « \.\.\/\.\.\/\.\.\/\.\.\/lib\/relais\.test » depuis du code de production · un module en \.test/,
    code: page('canAccess({ role: s.role, plan }, studio) || !!relais', "import * as relais from '../../../../lib/relais.test';") },
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
    const severite = async (rel: string, regle = 'tiktrends/face-equipe-forcee') => {
      const r = (await eslint.calculateConfigForFile(join(WEB, rel)))?.rules?.[regle];
      return Array.isArray(r) ? r[0] : r;
    };
    expect(await severite('app/(spatial)/sp/settings/page.tsx'), 'la règle n’est plus en erreur sur les pages').toBe(2);
    expect(await severite('test/team-acces-garde.test.tsx'), 'la règle n’est plus en erreur sur les tests').toBe(2);
    expect(await severite('lib/access.ts'), 'effectiveAccess est sous la règle · il ne pourrait plus construire la face équipe').toBeUndefined();
    expect(await severite('test/helpers/face-equipe.ts'), 'le helper des tests de rbac est sous la règle').toBeUndefined();
    // lib/access.ts n'est exempté que de face-equipe-forcee · ni import de test ni @ts-ignore n'y passent.
    for (const regle of ['tiktrends/pas-de-test-en-production', 'tiktrends/pas-de-ts-ignore']) {
      expect(await severite('lib/access.ts', regle), `${regle} ne garde plus lib/access.ts`).toBe(2);
      expect(await severite('app/(spatial)/sp/settings/page.tsx', regle), `${regle} ne garde plus les pages`).toBe(2);
    }
  });

  it('le lint tourne en CI · script `eslint .` et étape `pnpm lint` (sinon la règle ne garde rien)', () => {
    const pkg = JSON.parse(readFileSync(join(WEB, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.lint, 'apps/web · le script lint n’est plus « eslint . » · la règle ne tourne plus sur tout le paquet').toBe('eslint .');
    const racine = JSON.parse(readFileSync(join(WEB, '..', '..', 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    expect(racine.scripts?.lint, 'product · le script lint ne passe plus par turbo').toBe('turbo run lint');
    const ci = readFileSync(join(WEB, '..', '..', '..', '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(ci, 'la CI ne travaille plus dans product/').toMatch(/defaults:\s*\n\s*run:\s*\n\s*working-directory:\s*product\b/);
    expect(ci, 'la CI ne lance plus « pnpm lint »').toMatch(/^\s*run:\s*pnpm lint\s*$/m);
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
