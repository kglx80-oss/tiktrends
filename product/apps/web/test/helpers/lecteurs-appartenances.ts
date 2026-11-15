import ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Recensement des lectures de la table des membres (`workspace_members`)
 * filtrées par le COMPTE sans être bornées à un espace · lire les appartenances
 * d'un compte tous espaces confondus, c'est choisir un espace (ce que fait
 * `getSession`, par `espaceCourant`). Lu dans l'ARBRE syntaxique (TypeScript),
 * pas dans le texte · un alias (`const M = schema.workspaceMembers`, une
 * déstructuration, un import renommé), un `and(eq(M.userId, …))`, une jointure
 * sont vus · le SQL brut aussi (gabarits `sql\`…\``, chaînes, fichiers `.sql`).
 *
 * Une requête (une chaîne drizzle `….from(M)…`, `….innerJoin(M, …)`,
 * `update(M)`, `delete(M)`) est un LECTEUR DU COMPTE quand ses conditions
 * (arguments de `.where(…)` et des jointures) citent `M.userId` sans borner
 * `M.workspaceId` à une VALEUR (`eq(M.workspaceId, x)` / `inArray(…)` où `x`
 * n'est pas une colonne d'une table). Joindre `M.workspaceId` à
 * `workspaces.id` ne borne rien · c'est précisément ce que fait `getSession`.
 * En SQL brut · `user_id` cité sans `workspace_id = <valeur>`.
 */

export interface Requete {
  fichier: string; ligne: number; extrait: string;
  /** `drizzle` · une chaîne sur la table des membres · `sql` · du SQL brut qui la cite. */
  genre: 'drizzle' | 'sql';
  /** Ses conditions citent le compte (`userId` / `user_id`). */
  citeLeCompte: boolean;
  /** Ses conditions bornent l'espace à une valeur. */
  borne: boolean;
}
/** Un lecteur du compte · cite le compte, ne borne pas l'espace. */
export const litLeCompte = (r: Requete): boolean => r.citeLeCompte && !r.borne;

const DOSSIERS_EXCLUS = new Set(['node_modules', '.next', 'dist', '.turbo', 'test', 'tests', '__tests__', 'coverage']);
const EXT_CODE = /\.(tsx?|mts|cts|mjs|cjs|js)$/;

function parcourir(d: string, sortie: string[]): void {
  for (const n of readdirSync(d)) {
    if (DOSSIERS_EXCLUS.has(n)) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) parcourir(p, sortie);
    else if ((EXT_CODE.test(n) || n.endsWith('.sql')) && !/\.(test|spec)\.[a-z]+$/.test(n) && !n.endsWith('.d.ts')) sortie.push(p);
  }
}

const OPERATEURS_BORNE = new Set(['eq', 'inArray', 'isNotDistinctFrom']);
const JOINTURES = new Set(['innerJoin', 'leftJoin', 'rightJoin', 'fullJoin', 'crossJoin']);
const TABLE = new Set(['from', 'update', 'delete', ...JOINTURES]);

/** SQL brut qui cite la table des membres · cite-t-il le compte, borne-t-il l'espace à une VALEUR (paramètre, littéral) ? */
export function sqlBrut(texte: string): { citeLeCompte: boolean; borne: boolean } | null {
  if (!/workspace_members/i.test(texte)) return null;
  const valeur = String.raw`(?:\$\{?\w*\}?|\$\d+|'[^']*'|:'?\w+'?|\?)`;
  const borne = new RegExp(String.raw`\bworkspace_id"?\s*(?:=\s*(?:any\s*\(\s*)?|in\s*\(\s*)${valeur}|${valeur}\s*=\s*(?:\w+\.)?"?workspace_id\b`, 'i');
  return { citeLeCompte: /\buser_id\b/i.test(texte), borne: borne.test(texte) };
}

type Trouve = { pos: number; extrait: string; genre: Requete['genre']; citeLeCompte: boolean; borne: boolean };

function lireCode(fichier: string, source: string): Trouve[] {
  const kind = /\.tsx$/.test(fichier) ? ts.ScriptKind.TSX : /\.(m|c)?js$/.test(fichier) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fichier, source, ts.ScriptTarget.Latest, true, kind);
  const membres = new Set<string>(['workspaceMembers']);
  const colonnes = new Set<string>(['schema']); // objets dont `.x.y` est une colonne · `schema.t.col`
  const tables = new Set<string>(); // alias d'une table quelconque · `T.col` est une colonne

  // 1 · alias · `const M = schema.workspaceMembers`, `const { workspaceMembers: M } = schema`, imports renommés.
  const visiterAlias = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && n.initializer) {
      const init = n.initializer;
      if (ts.isIdentifier(n.name) && ts.isPropertyAccessExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === 'schema') {
        tables.add(n.name.text);
        if (init.name.text === 'workspaceMembers') membres.add(n.name.text);
      }
      if (ts.isIdentifier(n.name) && ts.isIdentifier(init) && membres.has(init.text)) membres.add(n.name.text);
      if (ts.isObjectBindingPattern(n.name) && ts.isIdentifier(init) && init.text === 'schema') {
        for (const el of n.name.elements) {
          const cle = el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : ts.isIdentifier(el.name) ? el.name.text : '';
          if (ts.isIdentifier(el.name)) { tables.add(el.name.text); if (cle === 'workspaceMembers') membres.add(el.name.text); }
        }
      }
    }
    if (ts.isImportSpecifier(n)) {
      const cle = (n.propertyName ?? n.name).text;
      if (cle === 'workspaceMembers') membres.add(n.name.text);
    }
    if (ts.isNamespaceImport(n)) colonnes.add(n.name.text);
    ts.forEachChild(n, visiterAlias);
  };
  visiterAlias(sf);
  for (const m of membres) tables.add(m);

  const estMembres = (e: ts.Expression): boolean =>
    (ts.isIdentifier(e) && membres.has(e.text)) || (ts.isPropertyAccessExpression(e) && e.name.text === 'workspaceMembers');
  const colonneMembres = (e: ts.Node, col: string): boolean =>
    ts.isPropertyAccessExpression(e) && e.name.text === col && estMembres(e.expression);
  const estColonne = (e: ts.Expression): boolean => {
    if (!ts.isPropertyAccessExpression(e)) return false;
    const o = e.expression;
    if (ts.isIdentifier(o)) return tables.has(o.text);
    return ts.isPropertyAccessExpression(o) && ts.isIdentifier(o.expression) && colonnes.has(o.expression.text);
  };
  const descendants = (n: ts.Node, f: (x: ts.Node) => boolean): boolean => {
    let vu = false;
    const v = (x: ts.Node): void => { if (vu) return; if (f(x)) { vu = true; return; } ts.forEachChild(x, v); };
    v(n);
    return vu;
  };

  const trouves: Trouve[] = [];
  const chainesVues = new Set<ts.Node>();

  const visiter = (n: ts.Node): void => {
    // 2 · une chaîne drizzle qui touche la table des membres.
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && TABLE.has(n.expression.name.text) && n.arguments[0] && estMembres(n.arguments[0])) {
      let haut: ts.Node = n;
      while (ts.isPropertyAccessExpression(haut.parent) && ts.isCallExpression(haut.parent.parent) && haut.parent.parent.expression === haut.parent) haut = haut.parent.parent;
      if (!chainesVues.has(haut)) {
        chainesVues.add(haut);
        const conditions: ts.Node[] = [];
        const recolter = (x: ts.Node): void => {
          if (ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression)) {
            const nom = x.expression.name.text;
            if (nom === 'where') conditions.push(...x.arguments);
            if (JOINTURES.has(nom) && x.arguments[1]) conditions.push(x.arguments[1]);
            recolter(x.expression.expression);
          } else if (ts.isPropertyAccessExpression(x)) recolter(x.expression);
        };
        recolter(haut);
        const citeLeCompte = conditions.some((c) => descendants(c, (x) => colonneMembres(x, 'userId')));
        const borne = conditions.some((c) => descendants(c, (x) => {
          if (!ts.isCallExpression(x) || !ts.isIdentifier(x.expression) || !OPERATEURS_BORNE.has(x.expression.text)) return false;
          const [a, b] = x.arguments;
          if (!a || !b) return false;
          return (colonneMembres(a, 'workspaceId') && !estColonne(b)) || (colonneMembres(b, 'workspaceId') && !estColonne(a));
        }));
        trouves.push({ pos: haut.getStart(sf), extrait: haut.getText(sf), genre: 'drizzle', citeLeCompte, borne });
      }
    }
    // 3 · SQL brut dans le code · gabarits et chaînes.
    if (ts.isNoSubstitutionTemplateLiteral(n) || ts.isStringLiteral(n)) {
      const r = sqlBrut(n.text);
      if (r) trouves.push({ pos: n.getStart(sf), extrait: n.text, genre: 'sql', ...r });
    } else if (ts.isTemplateExpression(n)) {
      const texte = n.head.text + n.templateSpans.map((s) => '${' + s.expression.getText(sf) + '}' + s.literal.text).join('');
      const r = sqlBrut(texte);
      if (r) trouves.push({ pos: n.getStart(sf), extrait: texte, genre: 'sql', ...r });
    }
    ts.forEachChild(n, visiter);
  };
  visiter(sf);
  return trouves.map((t) => ({ ...t, pos: sf.getLineAndCharacterOfPosition(t.pos).line + 1 }));
}

function lireSql(source: string): Trouve[] {
  const sansCommentaires = source.replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));
  const trouves: Trouve[] = [];
  let debut = 0;
  for (const instr of sansCommentaires.split(';')) {
    const lecture = /\bselect\b|\bdelete\s+from\b|\bupdate\s+"?workspace_members/i.test(instr);
    const r = lecture ? sqlBrut(instr) : null;
    if (r) {
      const decal = instr.search(/\S/);
      trouves.push({ pos: source.slice(0, debut + Math.max(decal, 0)).split('\n').length, extrait: instr.trim(), genre: 'sql', ...r });
    }
    debut += instr.length + 1;
  }
  return trouves;
}

/** Toutes les requêtes sur la table des membres sous `racines` (chemins relatifs à `base`), hors tests. */
export function requetesDesMembres(base: string, racines: readonly string[]): Requete[] {
  const fichiers: string[] = [];
  for (const r of racines) parcourir(join(base, r), fichiers);
  const sortie: Requete[] = [];
  for (const f of fichiers) {
    const source = readFileSync(f, 'utf8');
    if (!/workspaceMembers|workspace_members/i.test(source)) continue;
    const trouves = f.endsWith('.sql') ? lireSql(source) : lireCode(f, source);
    for (const t of trouves) sortie.push({ fichier: relative(base, f), ligne: t.pos, extrait: t.extrait.replace(/\s+/g, ' ').slice(0, 160), genre: t.genre, citeLeCompte: t.citeLeCompte, borne: t.borne });
  }
  return sortie.sort((a, b) => (a.fichier < b.fichier ? -1 : a.fichier > b.fichier ? 1 : a.ligne - b.ligne));
}
