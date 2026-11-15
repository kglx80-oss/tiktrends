import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { TYPES_NOTIF_BORNES, TYPES_NOTIF_RECENSES } from '@tiktrends/core';

/**
 * Recensement des types de notification · TOUT endroit du dépôt qui écrit dans
 * `notifications` (`createNotification(`, `notifyWorkspaceStaff(`,
 * `insert(schema.notifications)`) est lu dans le SOURCE, son type littéral
 * relevé · chaque type doit être classé dans `TYPES_NOTIF_RECENSES`
 * (`C/studios/activite/cloche-portee.ts`) · borné (la cloche le relit dans la
 * portée) ou laissé tel quel, avec sa raison. Un émetteur nouveau fait échouer
 * ce test tant qu'on n'a pas décidé s'il peut fuir après un changement de
 * portée · un type classé que plus rien n'écrit aussi (un recensement mort ne
 * recense rien).
 */

const RACINE = join(process.cwd(), '../..');
const DOSSIERS = ['apps', 'packages'];
const IGNORES = new Set(['node_modules', '.next', 'dist', 'test', '.turbo', 'coverage']);
/** Le mécanisme lui-même · ses insertions portent le type reçu (`n.type`). */
const MECANISME = 'apps/web/lib/notifications.ts';

function fichiers(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (IGNORES.has(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) fichiers(p, out);
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}

function ecrivains(): Array<{ ou: string; type: string | null }> {
  const out: Array<{ ou: string; type: string | null }> = [];
  for (const f of DOSSIERS.flatMap((d) => fichiers(join(RACINE, d)))) {
    const rel = relative(RACINE, f);
    const src = readFileSync(f, 'utf8');
    const re = /(?<!function\s)\b(createNotification|notifyWorkspaceStaff)\(|insert\(schema\.notifications\)/g;
    for (let m = re.exec(src); m; m = re.exec(src)) {
      if (rel === MECANISME && m[0].startsWith('insert')) continue;
      const suite = src.slice(m.index, m.index + 900);
      const t = /\btype:\s*'([a-z_]+)'/.exec(suite);
      out.push({ ou: `${rel}:${src.slice(0, m.index).split('\n').length}`, type: t ? t[1]! : null });
    }
  }
  return out;
}

describe('recensement · chaque type de notification écrit est classé (borné ou non, et pourquoi)', () => {
  const e = ecrivains();

  it('les écrivains sont trouvés · le mécanisme et les insertions directes (garde qui regarde la bonne chose)', () => {
    expect(e.length, 'aucun écrivain trouvé · la recherche regarde au mauvais endroit').toBeGreaterThanOrEqual(10);
    expect(e.some((x) => x.ou.startsWith('apps/web/lib/studios/activite.ts')), 'les mentions des commentaires ne sont pas vues').toBe(true);
    expect(e.some((x) => x.ou.startsWith('apps/web/lib/tracker.ts')), 'les insertions directes ne sont pas vues').toBe(true);
  });

  it('chaque écriture porte un type littéral, recensé', () => {
    for (const x of e) {
      expect(x.type, `${x.ou} · écrit une notification sans type littéral · le recensement ne peut pas la classer`).not.toBeNull();
      expect(TYPES_NOTIF_RECENSES[x.type!], `${x.ou} · le type « ${x.type} » n’est pas recensé dans TYPES_NOTIF_RECENSES · décide s’il peut fuir après un changement de portée`).toBeDefined();
    }
  });

  it('aucun type recensé mort · chaque type classé est réellement écrit', () => {
    const ecrits = new Set(e.map((x) => x.type));
    for (const t of Object.keys(TYPES_NOTIF_RECENSES)) expect(ecrits.has(t), `« ${t} » est recensé mais plus rien ne l’écrit`).toBe(true);
    for (const t of Object.keys(TYPES_NOTIF_BORNES)) expect(ecrits.has(t), `« ${t} » est borné mais plus rien ne l’écrit`).toBe(true);
  });
});
