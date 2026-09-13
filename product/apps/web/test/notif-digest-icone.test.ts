import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Chaque type de notification RÉELLEMENT émis doit avoir une icône dans la table
 * ICON de la cloche · sinon il tombe sur le glyphe de repli « • ». Le récap
 * quotidien (`digest`, émis par le cron) manquait · il s'affichait sans icône.
 *
 * Client à actions serveur · non rendable seul. Adoption par la source, bornée
 * à la table ICON.
 */
const src = readFileSync(join(process.cwd(), 'components/NotificationBell.tsx'), 'utf8');
const i = src.indexOf('const ICON');
const table = src.slice(i, i > -1 ? src.indexOf('}', i) + 1 : undefined);

describe('Cloche · chaque type émis a son icône', () => {
  it('la table ICON existe', () => {
    expect(i, 'table ICON introuvable').toBeGreaterThan(-1);
  });

  it('tous les types réellement émis sont couverts', () => {
    // Émis : support (ticket_new/reply/status) + cron digest.
    for (const type of ['ticket_new', 'ticket_reply', 'ticket_status', 'digest']) {
      expect(table, `le type « ${type} » n'a pas d'icône · glyphe de repli`).toContain(`${type}:`);
    }
  });
});
