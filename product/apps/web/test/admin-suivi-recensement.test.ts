import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ACTIONS_AUDIT, ACTIONS_SENSIBLES, ACTION_RAPPROCHEMENT_DEPENSE, PHASES_DUREE_TACHE, classeActionAudit } from '@tiktrends/core';
import { DELAI_LECTURE_FAL_MS, DELAI_SOUMISSION_FAL_MS, DELAI_TELECHARGEMENT_FAL_MS } from '@tiktrends/integrations';

/**
 * Suivi opérationnel · deux RECENSEMENTS par motif dans le code, refaits à
 * chaque passage · une consigne « penser à classer la nouvelle action » ne
 * tient pas, ce test échoue à sa place.
 *
 *  1. les actions d'audit RÉELLEMENT écrites (`studio_audit_events` · tout
 *     objet `action: …` accompagné de `targetType`, les appels des
 *     auxiliaires `auditer(…, 'action')` et `poser(…, 'action')`, les
 *     constantes résolues, les gabarits `job.${…}` en famille « job.* ») et les
 *     audits plateforme existants (`ai_spend_reconciliations`) · chacune doit
 *     être CLASSÉE au noyau (`ACTIONS_AUDIT`), et chaque action classée doit
 *     être écrite quelque part (aucune action fantôme dans la liste fermée des
 *     sensibles) ;
 *  2. les délais du worker dont le seuil « bloquée » est dérivé
 *     (`PHASES_DUREE_TACHE`) · lus dans le code (`bailMs`, `intervalleMs`) ou
 *     importés (`DELAI_*_FAL_MS`) · un délai qui bouge fait tomber le tableau.
 */

const PRODUCT = join(__dirname, '..', '..', '..');
const RACINES = ['apps/web', 'apps/workers/src', 'packages/core/src', 'packages/db/src', 'packages/integrations/src', 'packages/ai/src'];

function sources(): Map<string, string> {
  const out = new Map<string, string>();
  const parcourir = (d: string) => {
    for (const n of readdirSync(d)) {
      if (['node_modules', '.next', 'test', 'dist'].includes(n)) continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) parcourir(p);
      else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) out.set(relative(PRODUCT, p).split('\\').join('/'), readFileSync(p, 'utf8'));
    }
  };
  for (const r of RACINES) parcourir(join(PRODUCT, r));
  return out;
}

/**
 * Les expressions qui PASSENT une action reçue (auxiliaires) · déclarées une à
 * une, avec la raison. Une COLONNE (`A.action`, `E.action`) est une lecture
 * (sélection), jamais une écriture. Toute autre expression non littérale fait
 * échouer le recensement · elle cacherait une écriture qu'on ne classe pas.
 */
const RELAIS: Readonly<Record<string, string>> = {
  'apps/web/lib/studios/audit.ts|e.action': 'ajouterAudit · ses appelants écrivent `action: \'…\'` (recensés)',
  'apps/web/lib/studios/prompts/depot-prompts.ts|e.action': 'audit() · ses appelants écrivent `action: \'…\'` (recensés)',
  'apps/web/lib/studios/benchmark/programme.ts|action': 'auditer() · ses appelants passent l’action en troisième argument (recensés)',
  'apps/web/lib/studios/produit/qualite.ts|action': 'poser() · ses appelants passent l’action en dernier argument (recensés)',
};

function recenser() {
  const src = sources();
  // Une constante se résout d'abord dans le fichier qui l'emploie, puis parmi les constantes EXPORTÉES (le noyau).
  const constantesDe = (s: string, exportees: boolean) => new Map([...s.matchAll(exportees ? /\bexport\s+const\s+([A-Z][A-Z0-9_]*)\s*=\s*'([^']+)'/g : /\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*'([^']+)'/g)].map((m) => [m[1]!, m[2]!]));
  const exportees = new Map<string, string>();
  for (const s of src.values()) for (const [k, v] of constantesDe(s, true)) if (!exportees.has(k)) exportees.set(k, v);
  const actions = new Map<string, string>(); // action → premier fichier
  const relais: string[] = [];
  const inconnues: string[] = [];
  const noter = (a: string, f: string) => { if (!actions.has(a)) actions.set(a, f); };
  const literaux = (expr: string, f: string) => { for (const m of expr.matchAll(/'([a-z_]+(?:[.:][a-z_]+)+)'/g)) noter(m[1]!, f); };
  for (const [f, s] of src) {
    // 1. objet d'audit · `action: <expr>,` (ou `action,`) suivi, dans le même objet, de `targetType`.
    for (const m of s.matchAll(/(?<=[{,]\s*)action(?::\s*(`[^`]*`|'[^']*'|[^,\n]+?))?\s*,(?=[^{};]{0,260}\btargetType\b)/g)) {
      const expr = (m[1] ?? 'action').trim();
      if (expr.startsWith('`')) {
        const g = /^`([a-z_.]+\.)\$\{[^}]+\}`$/.exec(expr);
        if (g) noter(`${g[1]}*`, f); else inconnues.push(`${f} · gabarit ${expr}`);
      } else if (/'/.test(expr)) literaux(expr, f);
      else if (/^[A-Z][A-Z0-9_]*$/.test(expr)) { const v = constantesDe(s, false).get(expr) ?? exportees.get(expr); if (v) noter(v, f); else inconnues.push(`${f} · constante ${expr} introuvable`); }
      else if (/^[A-Z]\w*\.action$/.test(expr)) continue; // une colonne lue (sélection)
      else if (RELAIS[`${f}|${expr}`]) relais.push(`${f}|${expr}`);
      else inconnues.push(`${f} · ${expr}`);
    }
    // 2. auxiliaires · `auditer(tx, a, 'action', …)` et `poser(…, 'action')`.
    for (const m of s.matchAll(/\bauditer\([^,]+,\s*[^,]+,\s*('[^']+')/g)) literaux(m[1]!, f);
    for (const m of s.matchAll(/\b(?:return|await)\s+poser\(([^;]*?)\);/g)) literaux(m[1]!, f);
  }
  // 3. audits plateforme existants · le rapprochement d'une dépense est son propre audit (auteur, date, preuve, motif).
  const ecritRapprochement = (s: string) => /\.insert\(schema\.aiSpendReconciliations\)/.test(s)
    || [...s.matchAll(/\b(\w+)\s*=\s*schema\.aiSpendReconciliations\b/g)].some((m) => s.includes(`.insert(${m[1]})`));
  const rapprochement = [...src].find(([, s]) => ecritRapprochement(s));
  if (rapprochement) noter(ACTION_RAPPROCHEMENT_DEPENSE, rapprochement[0]);
  return { actions, relais, inconnues, src };
}

describe('Suivi opérationnel · recensement des actions d’audit écrites', () => {
  const r = recenser();

  it('le balayage voit les écritures · témoins présents, aucune expression inconnue', () => {
    expect(r.actions.size, 'le recensement ne voit presque rien · il regarde ailleurs').toBeGreaterThanOrEqual(45);
    for (const t of ['prompt.release.publier', 'equipe.membre.role', 'studios.interrupteurs', 'job.*', 'webhook.*', 'media.accept', 'media.reject', 'studio.project.archived', 'prompt.benchmark.approuver_budget', 'image.batch.quote', ACTION_RAPPROCHEMENT_DEPENSE]) {
      expect(r.actions.has(t), `témoin absent du recensement · ${t}`).toBe(true);
    }
    expect(r.inconnues, 'écriture d’audit non recensée · une action passe par une expression que ce test ne sait pas lire (déclare le relais dans RELAIS, avec sa raison)').toEqual([]);
    expect([...new Set(r.relais)].sort(), 'un relais déclaré n’existe plus · retire-le de RELAIS').toEqual(Object.keys(RELAIS).sort());
  });

  it('chaque action écrite est CLASSÉE au noyau (sensible ou courante)', () => {
    const nonClassees = [...r.actions].filter(([a]) => (a.endsWith('.*') ? !ACTIONS_AUDIT[a] : classeActionAudit(a) === null)).map(([a, f]) => `${a} (${f})`);
    expect(nonClassees, 'action d’audit écrite mais non classée au noyau · ajoute-la à ACTIONS_AUDIT (spatial/admin/registre-audit.ts), sensible ou courante').toEqual([]);
  });

  it('chaque action classée est réellement écrite · aucune action fantôme, la liste fermée des sensibles en tête', () => {
    const fantomes = Object.keys(ACTIONS_AUDIT).filter((a) => !r.actions.has(a));
    expect(fantomes, 'action classée qui n’est plus écrite nulle part · retire-la d’ACTIONS_AUDIT').toEqual([]);
    expect(ACTIONS_SENSIBLES.filter((a) => !r.actions.has(a)), 'action SENSIBLE qui n’est écrite nulle part').toEqual([]);
  });
});

describe('Suivi opérationnel · le seuil « bloquée » suit les délais du worker', () => {
  const src = sources();
  const lire = (f: string, motif: RegExp) => { const m = motif.exec(src.get(f) ?? ''); if (!m) throw new Error(`${f} · ${motif} introuvable · le délai a changé de forme, relis PHASES_DUREE_TACHE`); return Number(m[1]!.replace(/_/g, '')); };

  it('chaque phase du tableau vaut le délai réel du code', () => {
    const ms = Object.fromEntries(PHASES_DUREE_TACHE.map((p) => [p.phase, p.ms]));
    expect(ms['tour du worker'], 'tour du worker').toBe(lire('apps/workers/src/studios/boucle.ts', /o\.intervalleMs \?\? ([\d_]+)/));
    expect(ms['bail perdu avant soumission'], 'bail du worker').toBe(lire('apps/workers/src/studios/moteur.ts', /this\.bailMs = o\.bailMs \?\? ([\d_]+)/));
    expect(ms['soumission'], 'soumission').toBe(DELAI_SOUMISSION_FAL_MS);
    expect(ms['lecture du suivi'], 'lecture du suivi').toBe(DELAI_LECTURE_FAL_MS);
    expect(ms['téléchargements']! % DELAI_TELECHARGEMENT_FAL_MS, 'téléchargements · multiple du délai de téléchargement').toBe(0);
    expect(ms['téléchargements']! / DELAI_TELECHARGEMENT_FAL_MS, 'téléchargements · 4 sorties × 3 essais').toBe(12);
  });
});
