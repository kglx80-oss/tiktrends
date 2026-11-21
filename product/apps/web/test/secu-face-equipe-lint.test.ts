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
 * de ce qui passe dans le module de la règle. La VRAIE barrière est à
 * l'exécution (registre des faces, lib/rbac.ts) · `secu-face-equipe-execution`
 * et `secu-face-equipe-rendu` l'éprouvent. Ce lint est le filet.
 */

const WEB = join(__dirname, '..');
const PAGE = join(WEB, 'app/(spatial)/sp/settings/page.tsx');
const EXPR = 'canAccess(effectiveAccess(s), studio)';
const ACCES = "import type { Access } from '../../../../lib/rbac';";
const FORCER = 'function forcer<T>(x: unknown): T { return x as T; }';
const SOURCE = readFileSync(PAGE, 'utf8');
/** Le nom de la porte du registre, recomposé · le recensement le refuse hors de rbac.ts et access.ts. */
const INSCRIRE = ['inscrireFace', 'Equipe'].join('');
/** Le nom de la porte du registre des sessions d'équipe, recomposé · même raison. */
const AUTHENTIFIER = ['authentifier', 'EquipeSession'].join('');

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
  // Troisième tour · le registre (lib/rbac.ts) n'a qu'une porte, et seul lib/access.ts la passe.
  { quoi: 'import de la porte du registre', regle: 'tiktrends/inscription-face-equipe', phrase: /hors de lib\/access\.ts · inscrire une face au registre la rendrait reconnue sans privilegesEquipe/,
    code: page(`canAccess({ role: s.role, plan }, studio) || !!${INSCRIRE}`, `import { ${INSCRIRE} } from '../../../../lib/rbac';`) },
  { quoi: 'porte du registre lue sur un espace de noms', regle: 'tiktrends/inscription-face-equipe', phrase: /hors de lib\/access\.ts/,
    code: page(`canAccess({ role: s.role, plan }, studio) || !!rbac.${INSCRIRE}`, "import * as rbac from '../../../../lib/rbac';") },
  // Suite de #1122 · le registre des sessions d'équipe n'a qu'une porte, passée par equipeDeSession.
  { quoi: 'import de la porte des sessions d’équipe', regle: 'tiktrends/authentification-equipe-session', phrase: /hors de lib\/equipe-plateforme\.ts · authentifier une session d’équipe ferait croire à effectiveAccess un plateformeAdmissible posé à la main/,
    code: page(`canAccess({ role: s.role, plan }, studio) || !!${AUTHENTIFIER}`, `import { ${AUTHENTIFIER} } from '../../../../lib/registre-equipe-session';`) },
  { quoi: 'porte des sessions lue sur un espace de noms', regle: 'tiktrends/authentification-equipe-session', phrase: /hors de lib\/equipe-plateforme\.ts/,
    code: page(`canAccess({ role: s.role, plan }, studio) || !!registre.${AUTHENTIFIER}`, "import * as registre from '../../../../lib/registre-equipe-session';") },
  { quoi: 'import() par un gabarit sans substitution', regle: 'tiktrends/pas-de-test-en-production', phrase: /Import de « \.\.\/\.\.\/\.\.\/\.\.\/test\/helpers\/face-equipe »/,
    code: page("canAccess({ role: s.role, plan }, studio) || !!(await import(`../../../../test/helpers/face-equipe`))") },
  { quoi: 'module .test avec extension', regle: 'tiktrends/pas-de-test-en-production', phrase: /un module en \.test/,
    code: page('canAccess({ role: s.role, plan }, studio) || !!relais', "import * as relais from '../../../../lib/relais.test.js';") },
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

  it('ne signale pas · un dossier qui contient « .test » sans que le module en soit un (dernier segment seul)', async () => {
    const m = (await lint(page('canAccess({ role: s.role, plan }, studio) || !!m', "import * as m from '../../../../lib/x.test/vrai-module';"))).filter((x) => x.severity === 2 && x.ruleId?.startsWith('tiktrends/'));
    expect(m).toEqual([]);
  }, 120_000);

  it('les exemptions sont exactement celles déclarées, et la page est dessous', async () => {
    const severite = async (rel: string, regle = 'tiktrends/face-equipe-forcee') => {
      const r = (await eslint.calculateConfigForFile(join(WEB, rel)))?.rules?.[regle];
      return Array.isArray(r) ? r[0] : r;
    };
    expect(await severite('app/(spatial)/sp/settings/page.tsx'), 'la règle n’est plus en erreur sur les pages').toBe(2);
    expect(await severite('test/team-acces-garde.test.tsx'), 'la règle n’est plus en erreur sur les tests').toBe(2);
    expect(await severite('lib/access.ts'), 'effectiveAccess est sous la règle · il ne pourrait plus construire la face équipe').toBeUndefined();
    expect(await severite('test/helpers/face-equipe.ts'), 'le helper passe par effectiveAccess · il n’a plus à être exempté').toBe(2);
    expect(await severite('test/secu-face-equipe-execution.test.ts'), 'le test qui forge des faces exprès n’est plus exempté · il ne peut plus écrire les contournements qu’il éprouve').toBeUndefined();
    const inscription = 'tiktrends/inscription-face-equipe';
    for (const rel of ['app/(spatial)/sp/settings/page.tsx', 'test/helpers/face-equipe.ts', 'test/secu-face-equipe-execution.test.ts', 'lib/founder.ts']) {
      expect(await severite(rel, inscription), `${rel} · la porte du registre n’est plus gardée`).toBe(2);
    }
    for (const rel of ['lib/rbac.ts', 'lib/access.ts']) expect(await severite(rel, inscription), `${rel} · le registre ne peut plus être défini ou appelé`).toBeUndefined();
    const authentification = 'tiktrends/authentification-equipe-session';
    for (const rel of ['app/(spatial)/sp/settings/page.tsx', 'lib/access.ts', 'lib/auth.ts', 'test/secu-face-equipe-execution.test.ts', 'test/budget-essai-rendu.test.tsx']) {
      expect(await severite(rel, authentification), `${rel} · la porte des sessions d’équipe n’est plus gardée`).toBe(2);
    }
    for (const rel of ['lib/registre-equipe-session.ts', 'lib/equipe-plateforme.ts', 'test/helpers/face-equipe.ts']) expect(await severite(rel, authentification), `${rel} · le registre des sessions ne peut plus être défini ou passé`).toBeUndefined();
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
    expect(ci, 'la CI ne travaille plus dans product/').toMatch(/^defaults:\s*\n\s+run:\s*\n\s+working-directory:\s*product\s*$/m);
    const lint = etapesCi(ci).filter(lanceLeLint);
    expect(lint.length, 'la CI ne lance plus le lint (pnpm lint, pnpm run lint, pnpm -w lint)').toBeGreaterThan(0);
    expect(lint.filter((e) => !etapeBloquante(e)), 'l’étape de lint ne bloque plus la CI (if, continue-on-error)').toEqual([]);
  });

  it('le lecteur d’étapes CI reconnaît chaque forme, et refuse une étape qui ne bloque pas', () => {
    const ci = (corps: string) => `jobs:\n  verify:\n    steps:\n${corps}`;
    const bloquantes = (y: string) => etapesCi(y).filter(lanceLeLint).filter(etapeBloquante).length;
    expect(bloquantes(ci('      - name: Lint\n        run: pnpm lint\n'))).toBe(1);
    expect(bloquantes(ci('      - run: pnpm run lint\n'))).toBe(1);
    expect(bloquantes(ci('      - run: pnpm -w lint\n'))).toBe(1);
    expect(bloquantes(ci("      - name: Lint\n        run: 'pnpm -w run lint'\n"))).toBe(1);
    expect(bloquantes(ci('      - name: Lint\n        if: false\n        run: pnpm lint\n'))).toBe(0);
    expect(bloquantes(ci('      - name: Lint\n        run: pnpm lint\n        continue-on-error: true\n'))).toBe(0);
    expect(bloquantes(ci('      - name: Tests\n        run: pnpm test\n'))).toBe(0);
    expect(bloquantes(ci('      - name: Lint\n        run: pnpm lint || true\n'))).toBe(0);
  });

  // F · faux positifs acceptés · la forme est refusée, la réécriture conseillée (annoter la variable) passe.
  const REECRITURES: Array<{ quoi: string; refusee: string; conseillee: string; apres?: string; react?: true }> = [
    { quoi: 'new Map<string, Access>()', refusee: 'new Map<string, Access>().size === 0', conseillee: 'carte.size === 0', apres: 'const entrees: Array<[string, Access]> = [];\nconst carte = new Map(entrees);' },
    { quoi: 'useState<Access | null>(null)', refusee: 'useState<Access | null>(null).length === 2', conseillee: 'useState(initial).length === 2', apres: 'const initial: Access | null = null;', react: true },
    { quoi: '[] as Access[]', refusee: '([] as Access[]).length === 0', conseillee: 'aucun.length === 0', apres: 'const aucun: Access[] = [];' },
    { quoi: '.filter((a): a is Access => …)', refusee: '[effectiveAccess(s), null].filter((a): a is Access => a !== null).length > 0', conseillee: '[effectiveAccess(s), null].flatMap((a) => (a !== null ? [a] : [])).length > 0' },
  ];
  for (const r of REECRITURES) {
    it(`réécriture conseillée · ${r.quoi} refusé, la variable annotée passe`, async () => {
      const avant = r.react ? `${ACCES}\nimport { useState } from 'react';` : ACCES;
      // Seules les règles du dépôt comptent ici · la page d'ancrage n'est pas un composant client (règles des hooks).
      const nos = (m: Awaited<ReturnType<typeof lint>>) => m.filter((x) => x.severity === 2 && x.ruleId?.startsWith('tiktrends/'));
      const refus = nos(await lint(page(r.refusee, avant)));
      expect(refus.map((x) => x.ruleId), `${r.quoi} n’est plus refusé · mets à jour la liste des faux positifs du module`).toEqual(['tiktrends/face-equipe-forcee']);
      const ok = nos(await lint(page(r.conseillee, avant, r.apres ?? '')));
      expect(ok, `${r.quoi} · la réécriture conseillée par le module ne passe pas`).toEqual([]);
    }, 120_000);
  }

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

/** Les étapes d'un workflow · lecture tolérante par indentation (aucune dépendance YAML n'est déclarée par apps/web). */
type EtapeCi = Record<string, string>;
function etapesCi(yaml: string): EtapeCi[] {
  const etapes: EtapeCi[] = [];
  let courante: EtapeCi | null = null;
  let retrait = -1;
  for (const ligne of yaml.split('\n')) {
    const item = /^(\s*)-\s+([\w-]+):\s*(.*)$/.exec(ligne);
    if (item && (retrait < 0 || item[1]!.length === retrait)) {
      retrait = item[1]!.length;
      courante = { [item[2]!]: item[3]!.trim() };
      etapes.push(courante);
      continue;
    }
    const cle = /^(\s*)([\w-]+):\s*(.*)$/.exec(ligne);
    if (courante && cle && cle[1]!.length > retrait) courante[cle[2]!] = cle[3]!.trim();
    else if (cle && cle[1]!.length <= retrait) { courante = null; if (cle[1]!.length < retrait) retrait = -1; }
  }
  return etapes;
}
const sansGuillemets = (v: string) => v.replace(/^(['"])(.*)\1$/, '$2').trim();
const lanceLeLint = (e: EtapeCi) => /^pnpm(\s+-w)?(\s+run)?\s+lint$/.test(sansGuillemets(e.run ?? ''));
const etapeBloquante = (e: EtapeCi) => !('if' in e) && !('continue-on-error' in e);
