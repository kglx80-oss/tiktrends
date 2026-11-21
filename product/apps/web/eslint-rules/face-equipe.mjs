import ts from 'typescript';

/**
 * Règle `tiktrends/face-equipe-forcee` · seul `effectiveAccess` (lib/access.ts)
 * construit un `Access`, et donc la face « équipe » (`Access.equipe`, marque de
 * type déclarée dans lib/rbac.ts), sous la règle d'admissibilité du noyau
 * (`privilegesEquipe`). Une face équipe forcée ailleurs ouvre à un compte NON
 * admissible les rubriques d'équipe, sans verrou de formule (`canAccess`).
 *
 * Elle protège contre une ERREUR (un raccourci pris de bonne foi), pas contre la
 * malveillance · un auteur décidé trouvera toujours une porte (voir la liste de
 * ce qui passe, plus bas). Elle s'appuie sur le COMPILATEUR (informations de
 * type), pas sur le texte · un alias, un `NonNullable<Access['equipe']>`, un
 * `import('…').Access` ou un `Pick<Access, 'equipe'>` désignent le même type, et
 * sont vus comme tels.
 *
 * Ce qu'elle signale :
 *  1. `transtypage` · un `as T` ou `<T>x` dont le type cible EST ou CONTIENT
 *     `Access` ou la marque (union, intersection, propriété, argument de type),
 *     alias compris. `as const` et `satisfies` ne sont pas concernés.
 *  2. `echappement` · un `as any` ou `as never` posé là où le compilateur attend
 *     un `Access` ou la marque (propriété `equipe`, argument de `canAccess`…), et
 *     un `as any | unknown | never` qui EFFACE le type d'un `Access` (pour le
 *     muter ensuite, `(a as any).equipe = …`).
 *  3. `valeurAny` · une valeur de type `any` (`JSON.parse`, une variable `any`)
 *     posée là où on attend un `Access` ou la marque.
 *  4. `generique` · un appel dont le type de retour est choisi par l'appelant
 *     (paramètre de type absent des paramètres, `forcer<T>(x: unknown): T`) et
 *     rend ici un `Access` ou la marque, explicite (`forcer<Access>(x)`) ou
 *     inféré.
 *  5. `assign` · `Object.assign(a, …)` sur un `Access` · il le mute sans
 *     contrôle de type.
 *
 * Ce qu'elle laisse passer (à dire, pas à taire) :
 *  · un `// eslint-disable` · le recensement (`test/secu-fondateurs-codes-sources.test.ts`)
 *    refuse toute désactivation d'une règle `tiktrends/` ;
 *  · `@ts-ignore` / `@ts-expect-error` · refusés en production par
 *    `tiktrends/pas-de-ts-ignore` (plus bas) ;
 *  · une valeur `any` qui arrive par un chemin non listé (paramètre par défaut,
 *    champ de classe, déstructuration), une mutation par `Reflect` ou
 *    `Object.defineProperty`, un `.js` sans types ;
 *  · tout ce qui contourne le compilateur lui-même.
 */

const RBAC = /[\\/]apps[\\/]web[\\/]lib[\\/]rbac\.ts$/;
const HORS_DEPOT = /[\\/]node_modules[\\/]|[\\/]typescript[\\/]lib[\\/]lib\.[^\\/]*\.d\.ts$/;

const declareDansRbac = (sym) => !!sym?.declarations?.some((d) => RBAC.test(d.getSourceFile().fileName));
/** La propriété-marque `[FACE_EQUIPE]` de lib/rbac.ts. */
const estProprieteMarque = (p) => !!p.declarations?.some((d) =>
  RBAC.test(d.getSourceFile().fileName) && d.name && ts.isComputedPropertyName(d.name) && d.name.expression.getText() === 'FACE_EQUIPE');
const declareHorsDepot = (sym) => !sym.declarations?.length || sym.declarations.every((d) => HORS_DEPOT.test(d.getSourceFile().fileName));

/**
 * Le type porte-t-il `Access` ou la marque, à n'importe quelle profondeur ? On ne
 * descend dans les propriétés que des types du dépôt (pas de React, pas des
 * `lib.d.ts`) · la marque ne peut venir que de lib/rbac.ts.
 * Rend 'Access', 'marque' ou null.
 */
function porteMarque(checker, type, vus = new Set(), prof = 0) {
  if (!type || prof > 6 || vus.has(type)) return null;
  vus.add(type);
  const sym = type.aliasSymbol ?? type.getSymbol();
  if (sym?.getName() === 'Access' && declareDansRbac(sym)) return 'Access';
  const fils = [];
  if (type.isUnionOrIntersection()) fils.push(...type.types);
  if (type.aliasTypeArguments) fils.push(...type.aliasTypeArguments);
  if (type.flags & ts.TypeFlags.Object && type.objectFlags & ts.ObjectFlags.Reference) fils.push(...checker.getTypeArguments(type));
  for (const f of fils) {
    const r = porteMarque(checker, f, vus, prof + 1);
    if (r) return r;
  }
  if (!(type.flags & ts.TypeFlags.Object) && !type.isIntersection()) return null;
  for (const p of checker.getPropertiesOfType(type)) {
    if (estProprieteMarque(p)) return 'marque';
    if (declareHorsDepot(p)) continue;
    const r = porteMarque(checker, checker.getTypeOfSymbol(p), vus, prof + 1);
    if (r) return r;
  }
  return null;
}

const nomDuType = (r) => (r === 'Access' ? 'un Access' : 'la face équipe (Access.equipe)');
const SUITE = 'seul effectiveAccess (lib/access.ts) construit un accès, sous privilegesEquipe · un compte non admissible y gagnerait les rubriques d’équipe. Passe par effectiveAccess.';

/** Noms des paramètres de type présents dans un nœud de type. */
function nomsReferences(noeud, noms, out = new Set()) {
  if (!noeud) return out;
  const visite = (n) => {
    if (ts.isTypeReferenceNode(n) && ts.isIdentifier(n.typeName) && noms.has(n.typeName.text)) out.add(n.typeName.text);
    ts.forEachChild(n, visite);
  };
  visite(noeud);
  return out;
}

export const faceEquipeForcee = {
  meta: {
    type: 'problem',
    docs: { description: 'Seul effectiveAccess construit un Access (face équipe sous privilegesEquipe).' },
    schema: [{
      type: 'object',
      properties: { accesSansEquipe: { type: 'boolean' } },
      additionalProperties: false,
    }],
    messages: {
      transtypage: 'Transtypage vers {{quoi}} (« {{texte}} ») · {{suite}}',
      transtypageEquipe: 'Transtypage vers un Access qui porte une propriété equipe · même dans un test, la face équipe vient de effectiveAccess ou de faceEquipeTest (test/helpers/face-equipe.ts).',
      echappement: '« as {{cible}} » là où on attend {{quoi}} · il force le type sans contrôle · {{suite}}',
      efface: '« as {{cible}} » efface le type d’{{quoi}} · une mutation derrière (equipe = …) forcerait la face équipe · {{suite}}',
      valeurAny: 'Valeur de type any là où on attend {{quoi}} · elle force le type sans contrôle · {{suite}}',
      generique: '« {{nom}} » rend un type choisi par l’appelant (paramètre de type absent de ses paramètres), ici {{quoi}} · c’est un transtypage déguisé · {{suite}}',
      assign: 'Object.assign sur {{quoi}} · il le mute sans contrôle de type · {{suite}}',
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    if (!services?.program) throw new Error('tiktrends/face-equipe-forcee · informations de type absentes (parserOptions.projectService)');
    const checker = services.program.getTypeChecker();
    const accesSansEquipe = context.options[0]?.accesSansEquipe === true;
    const tsDe = (n) => services.esTreeNodeToTSNodeMap.get(n);
    const typeDe = (n) => checker.getTypeAtLocation(tsDe(n));
    const attendu = (n) => {
      const c = checker.getContextualType(tsDe(n));
      return c ? porteMarque(checker, c) : null;
    };
    const estAny = (t) => !!(t.flags & ts.TypeFlags.Any);
    const ECHAPPE = ts.TypeFlags.Any | ts.TypeFlags.Never;
    const EFFACE = ECHAPPE | ts.TypeFlags.Unknown;

    function transtypage(node) {
      const cible = node.typeAnnotation;
      if (cible.type === 'TSTypeReference' && cible.typeName.type === 'Identifier' && cible.typeName.name === 'const') return;
      const tCible = checker.getTypeFromTypeNode(tsDe(cible));
      const texte = context.sourceCode.getText(cible);
      const r = porteMarque(checker, tCible);
      if (r) {
        // Les tests de rbac éprouvent la face CLIENT par `{ role, plan } as Access` · permis là seulement, et sans equipe.
        const accesNu = r === 'Access' && (tCible.aliasSymbol ?? tCible.getSymbol())?.getName() === 'Access';
        if (accesSansEquipe && accesNu) {
          if (typeDe(node.expression).getProperty('equipe')) context.report({ node, messageId: 'transtypageEquipe' });
          return;
        }
        context.report({ node, messageId: 'transtypage', data: { quoi: nomDuType(r), texte, suite: SUITE } });
        return;
      }
      if (tCible.flags & ECHAPPE) {
        const a = attendu(node);
        if (a) { context.report({ node, messageId: 'echappement', data: { cible: texte, quoi: nomDuType(a), suite: SUITE } }); return; }
      }
      if (tCible.flags & EFFACE) {
        const s = porteMarque(checker, typeDe(node.expression));
        if (s) context.report({ node, messageId: 'efface', data: { cible: texte, quoi: nomDuType(s), suite: SUITE } });
      }
    }

    function valeur(n) {
      if (!n || n.type === 'TSAsExpression' || n.type === 'TSTypeAssertion' || n.type === 'SpreadElement') return;
      if (!estAny(typeDe(n))) return;
      const a = attendu(n);
      if (a) context.report({ node: n, messageId: 'valeurAny', data: { quoi: nomDuType(a), suite: SUITE } });
    }

    function appel(node) {
      for (const arg of node.arguments) valeur(arg);
      const sig = checker.getResolvedSignature(tsDe(node));
      const decl = sig?.getDeclaration?.();
      if (decl?.typeParameters?.length && decl.type) {
        const noms = new Set(decl.typeParameters.map((p) => p.name.text));
        const auRetour = nomsReferences(decl.type, noms);
        const enParam = new Set();
        for (const p of decl.parameters) nomsReferences(p.type, noms, enParam);
        if ([...auRetour].some((n) => !enParam.has(n))) {
          const r = porteMarque(checker, sig.getReturnType());
          if (r) context.report({ node, messageId: 'generique', data: { nom: context.sourceCode.getText(node.callee), quoi: nomDuType(r), suite: SUITE } });
        }
      }
      const c = node.callee;
      if (c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier' && c.object.name === 'Object' && c.property.name === 'assign' && node.arguments[0]) {
        const r = porteMarque(checker, typeDe(node.arguments[0]));
        if (r) context.report({ node, messageId: 'assign', data: { quoi: nomDuType(r), suite: SUITE } });
      }
    }

    return {
      TSAsExpression: transtypage,
      TSTypeAssertion: transtypage,
      CallExpression: appel,
      NewExpression: appel,
      'ObjectExpression > Property'(n) { valeur(n.value); },
      'VariableDeclarator[id.typeAnnotation]'(n) { valeur(n.init); },
      AssignmentExpression(n) { valeur(n.right); },
      ReturnStatement(n) { valeur(n.argument); },
      'ArrowFunctionExpression[expression=true]'(n) { valeur(n.body); },
      ArrayExpression(n) { for (const e of n.elements) valeur(e); },
      JSXExpressionContainer(n) { if (n.expression.type !== 'JSXEmptyExpression') valeur(n.expression); },
    };
  },
};

/**
 * Règle `tiktrends/pas-de-test-en-production` · le code de production n'importe
 * rien de `test/` (le helper `faceEquipeTest` y construit une face équipe sans
 * `privilegesEquipe`, c'est son rôle · en production, ce serait une porte).
 * Import statique, `export … from`, `import()` et `require()`, relatif ou par
 * l'alias `@/`. Erreur, pas malveillance · un chemin calculé passe.
 */
export const CHEMIN_DE_TEST = /^(?:(?:\.{1,2}\/)+(?:[^'"]*\/)?|@\/)test(?:\/|$)/;
export const pasDeTestEnProduction = {
  meta: {
    type: 'problem',
    docs: { description: 'Le code de production n’importe rien de test/.' },
    schema: [],
    messages: {
      importTest: 'Import de « {{chemin}} » depuis du code de production · test/ ne part pas en production, et faceEquipeTest y construit une face équipe sans privilegesEquipe. En production, passe par effectiveAccess (lib/access.ts).',
    },
  },
  create(context) {
    const verifier = (src) => {
      if (src?.type === 'Literal' && typeof src.value === 'string' && CHEMIN_DE_TEST.test(src.value)) {
        context.report({ node: src, messageId: 'importTest', data: { chemin: src.value } });
      }
    };
    return {
      ImportDeclaration: (n) => verifier(n.source),
      ExportNamedDeclaration: (n) => verifier(n.source),
      ExportAllDeclaration: (n) => verifier(n.source),
      ImportExpression: (n) => verifier(n.source),
      'CallExpression[callee.type="Identifier"][callee.name="require"]': (n) => verifier(n.arguments[0]),
    };
  },
};

/**
 * Règle `tiktrends/pas-de-ts-ignore` · aucun `@ts-ignore`, `@ts-expect-error`
 * ni `@ts-nocheck` en production · posé sur `equipe: s.equipe`, il ferait
 * passer une session brute pour la face équipe sans le moindre cast. Aucun
 * n'existe aujourd'hui en production (mesuré · 0).
 */
export const pasDeTsIgnore = {
  meta: {
    type: 'problem',
    docs: { description: 'Aucune directive qui fait taire le compilateur en production.' },
    schema: [],
    messages: {
      tsCommentaire: '« @{{directive}} » fait taire le compilateur · en production, il laisserait passer une face équipe forcée (equipe: s.equipe) sans cast. Corrige le type, ou passe par effectiveAccess (lib/access.ts).',
    },
  },
  create(context) {
    return {
      Program() {
        for (const c of context.sourceCode.getAllComments()) {
          const m = /^\s*\/?\s*@(ts-ignore|ts-expect-error|ts-nocheck)\b/m.exec(c.value);
          if (m) context.report({ loc: c.loc, messageId: 'tsCommentaire', data: { directive: m[1] } });
        }
      },
    };
  },
};

export default { rules: { 'face-equipe-forcee': faceEquipeForcee, 'pas-de-test-en-production': pasDeTestEnProduction, 'pas-de-ts-ignore': pasDeTsIgnore } };
