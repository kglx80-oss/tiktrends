import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

/**
 * Les sondes de TYPE (`*.types.test.ts`) · un fichier de test qui est sa
 * propre sonde. Chaque ligne sous un `@ts-expect-error` doit être refusée par
 * le compilateur (la porte typecheck échoue sinon sur « Unused
 * '@ts-expect-error' directive »). Ce helper compile le fichier, directives
 * RETIRÉES, avec les options de apps/web, et rend les erreurs par ligne · le
 * test vérifie alors plus fort · chaque sonde échoue pour la BONNE raison (le
 * message cite le type opaque), et aucune autre ligne n'a d'erreur.
 */
export interface ErreurDeSonde { ligne: number; message: string }

const WEB = join(__dirname, '..', '..');

export function compilerSondes(fichier: string): ErreurDeSonde[] {
  const lu = ts.readConfigFile(join(WEB, 'tsconfig.json'), ts.sys.readFile);
  const conf = ts.parseJsonConfigFileContent(lu.config, ts.sys, WEB);
  const options: ts.CompilerOptions = { ...conf.options, incremental: false, noEmit: true };
  const code = readFileSync(fichier, 'utf8').replace(/@ts-expect-error/g, '@sonde');
  const hote = ts.createCompilerHost(options);
  const source = hote.getSourceFile.bind(hote);
  hote.getSourceFile = (f, v, ...r) => (f === fichier ? ts.createSourceFile(f, code, v, true) : source(f, v, ...r));
  const programme = ts.createProgram([fichier], options, hote);
  const sf = programme.getSourceFile(fichier)!;
  return [...programme.getSyntacticDiagnostics(sf), ...programme.getSemanticDiagnostics(sf)].map((d) => ({
    ligne: sf.getLineAndCharacterOfPosition(d.start ?? 0).line + 1,
    message: ts.flattenDiagnosticMessageText(d.messageText, ' '),
  }));
}

/** Les sondes du fichier · la ligne qui SUIT chaque `// @ts-expect-error <quoi>`. */
export function sondesDuFichier(lignes: readonly string[]): Array<{ ligne: number; quoi: string }> {
  return lignes.flatMap((l, i) => (/^\s*\/\/ @ts-expect-error/.test(l) ? [{ ligne: i + 2, quoi: l.trim().replace('// @ts-expect-error ', '') }] : []));
}
