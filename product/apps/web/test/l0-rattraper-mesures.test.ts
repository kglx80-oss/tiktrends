import { describe, it, expect } from 'vitest';
import { decider, CONFIRMATION, LOT_DEFAUT, LOT_MAX } from '../scripts/rattraper-mesures';

/**
 * Chantier L0 · le rattrapage des mesures est une COMMANDE explicite
 * (`scripts/rattraper-mesures.ts`) · elle n'écrit jamais sans confirmation
 * exacte, refuse sans base, et traite un lot borné. Le garde est pur · on le
 * fait tomber en cassant chaque condition. La commande elle-même
 * (`rattraperMesures`, idempotente) est prouvée au résultat dans
 * `l0-api-ad.test.ts`.
 */
const URL_LOCALE = 'postgres://postgres@127.0.0.1:5433/tiktrends';

describe('scripts/rattraper-mesures · garde', () => {
  it('sans confirmation · compte seulement, n’écrit rien', () => {
    expect(decider({ DATABASE_URL: URL_LOCALE })).toEqual({ ok: true, ecrire: false, lot: LOT_DEFAUT });
    for (const c of ['oui', 'OUI-RATTRAPER-LES-MESURES', ` ${CONFIRMATION}`, 'true', '1']) {
      const d = decider({ DATABASE_URL: URL_LOCALE, RATTRAPER_MESURES_CONFIRM: c });
      expect(d.ok && d.ecrire, `confirmation « ${c} » acceptée à tort · le script écrirait`).toBe(false);
    }
  });

  it('avec la confirmation exacte · écrit, lot par défaut ou demandé', () => {
    expect(decider({ DATABASE_URL: URL_LOCALE, RATTRAPER_MESURES_CONFIRM: CONFIRMATION })).toEqual({ ok: true, ecrire: true, lot: LOT_DEFAUT });
    expect(decider({ DATABASE_URL: URL_LOCALE, RATTRAPER_MESURES_CONFIRM: CONFIRMATION, RATTRAPER_MESURES_LOT: '250' })).toEqual({ ok: true, ecrire: true, lot: 250 });
  });

  it('refuse sans DATABASE_URL, même confirmé', () => {
    for (const u of [undefined, '', '  ']) {
      const d = decider({ DATABASE_URL: u, RATTRAPER_MESURES_CONFIRM: CONFIRMATION });
      expect(d.ok, 'le script tournerait sans base').toBe(false);
      if (!d.ok) expect(d.raison).toMatch(/DATABASE_URL/);
    }
  });

  it('refuse un lot illisible ou hors borne · jamais de lot sans limite', () => {
    for (const l of ['0', String(LOT_MAX + 1), '100000', '-5', '12abc', '1e3', '2.5']) {
      const d = decider({ DATABASE_URL: URL_LOCALE, RATTRAPER_MESURES_CONFIRM: CONFIRMATION, RATTRAPER_MESURES_LOT: l });
      expect(d.ok, `lot « ${l} » accepté`).toBe(false);
    }
    expect(decider({ DATABASE_URL: URL_LOCALE, RATTRAPER_MESURES_LOT: String(LOT_MAX) }).ok).toBe(true);
  });
});
