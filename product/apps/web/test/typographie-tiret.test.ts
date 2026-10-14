import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

/**
 * Règle du dépôt · « Pas de tiret cadratin · utiliser « · » ». Aucun « — » à
 * l'écran (lot V5 · A2).
 *
 * ── Ce que la garde lit ──────────────────────────────────────────────────────
 *
 * Les CHAÎNES que le code peut afficher · texte JSX, littéraux de chaîne (dont
 * attributs `title`, `aria-label`, `placeholder`), gabarits, dans les `.ts` ET
 * les `.tsx` de `app/`, `components/` et `lib/`. Le fichier est analysé par le
 * compilateur TypeScript · les commentaires et les expressions régulières ne
 * sont pas des chaînes, ils n'atteignent jamais l'écran et ne comptent pas.
 *
 * Version précédente (jusqu'au 14/10) · un filtre par expressions régulières sur
 * les seuls `.tsx` de `app/` et `components/`, qui ne visait que le tiret
 * ENTOURÉ D'ESPACES. Elle laissait passer 56 « — » seuls (valeur absente d'un
 * tableau, désormais `VALEUR_ABSENTE` du noyau) et l'incise d'un titre écrit en
 * `.ts` (`app/actions/adsmap-bridge.ts`). Aucune exception.
 *
 * ── Ce qu'elle ne lit pas ────────────────────────────────────────────────────
 *
 *  · les tests, les scripts d'exploitation (`scripts/`, sortie terminal) ;
 *  · `lib/studios/prompts/` · le pack de consignes ENVOYÉES au modèle, versionné
 *    et empreinté (sha256) · on ne le réécrit pas pour une règle d'écran ;
 *  · la prose produite par un modèle à l'exécution · elle ne vit pas dans le
 *    code, elle passe par `sansTiretCadratin` (noyau) à l'affichage, gardé au
 *    rendu par `test/a2-jarvis-sans-tiret-rendu.test.tsx`.
 */

const DOSSIERS = ['app', 'components', 'lib'] as const;
const EXCLUS = ['lib/studios/prompts/'];
const TIRET = /—|&mdash;|&#8212;|&#x2014;/i;

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next' || e === 'test') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(e) && !e.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const CHAINES = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.JsxText,
]);

/** Chaque chaîne du fichier qui porte un tiret cadratin · `ligne · extrait`. */
function tiretsDuSource(chemin: string, src: string): { ligne: number; extrait: string }[] {
  const sf = ts.createSourceFile(chemin, src, ts.ScriptTarget.Latest, true, chemin.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const trouves: { ligne: number; extrait: string }[] = [];
  const visiter = (n: ts.Node) => {
    if (CHAINES.has(n.kind)) {
      const brut = n.getText(sf);
      const cuit = (n as ts.LiteralLikeNode).text ?? brut;
      if (TIRET.test(brut) || TIRET.test(cuit)) {
        trouves.push({ ligne: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, extrait: brut.replace(/\s+/g, ' ').trim().slice(0, 70) });
      }
    }
    ts.forEachChild(n, visiter);
  };
  visiter(sf);
  return trouves;
}

function releve(): Map<string, { ligne: number; extrait: string }[]> {
  const racine = process.cwd();
  const parFichier = new Map<string, { ligne: number; extrait: string }[]>();
  for (const dossier of DOSSIERS) {
    for (const f of sources(join(racine, dossier))) {
      const rel = relative(racine, f);
      if (EXCLUS.some((x) => rel.startsWith(x))) continue;
      const src = readFileSync(f, 'utf8');
      if (!TIRET.test(src)) continue;
      const t = tiretsDuSource(rel, src);
      if (t.length) parFichier.set(rel, t);
    }
  }
  return parFichier;
}

describe('typographie · aucun tiret cadratin à l’écran', () => {
  const trouves = releve();

  it('aucune chaîne affichable ne porte « — » (utiliser « · », ou VALEUR_ABSENTE)', () => {
    const fautifs: string[] = [];
    for (const [f, liste] of trouves) {
      for (const t of liste) fautifs.push(`${f}:${t.ligne} · ${t.extrait}`);
    }
    expect(fautifs, `« — » à l'écran, à remplacer par « · » (ou VALEUR_ABSENTE pour une case vide) :\n${fautifs.join('\n')}`).toEqual([]);
  });

  it('la garde voit le texte JSX, les attributs et les gabarits, pas les commentaires ni les regex', () => {
    const src = [
      '// un — en commentaire',
      '/* un — en bloc */',
      'const r = /[—–]/g;',
      'const a = <p title="a — b">{/* — */}texte — jsx</p>;',
      'const g = `x ${1} — y`;',
      "const s = '\\u2014';",
      'const e = <i>&mdash;</i>;',
    ].join('\n');
    expect(tiretsDuSource('x.tsx', src).map((t) => t.ligne)).toEqual([4, 4, 5, 6, 7]);
  });
});
