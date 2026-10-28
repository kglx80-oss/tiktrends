import { describe, expect, it } from 'vitest';
import { entreesAdminOuvertes, porteEntreeAdmin, type DroitsSousNavAdmin } from '../src';

const ITEMS = ['/admin', '/admin/churn', '/admin/prompts', '/admin/prompts/registre', '/admin/ia-studios', '/admin/studios-interrupteurs', '/admin/connaissances', '/admin/equipe', '/credits', '/console'].map((href) => ({ href }));
const tout: DroitsSousNavAdmin = { tour: true, promptRead: true, providerConfigure: true, connaissances: true, equipe: true };
const hrefs = (d: DroitsSousNavAdmin) => entreesAdminOuvertes(ITEMS, d).map((i) => i.href);

describe('Tour de contrôle · la sous-navigation ne propose que les portes ouvertes (SEC-10)', () => {
  it('tous les droits · toutes les entrées, dans l’ordre reçu', () => {
    expect(hrefs(tout)).toEqual(ITEMS.map((i) => i.href));
  });
  it('fondateur non admissible · ni registre, ni modèles, ni interrupteurs', () => {
    const h = hrefs({ ...tout, promptRead: false, providerConfigure: false });
    expect(h).not.toContain('/admin/prompts');
    expect(h).not.toContain('/admin/prompts/registre');
    expect(h).not.toContain('/admin/ia-studios');
    expect(h).not.toContain('/admin/studios-interrupteurs');
    expect(h).toContain('/admin/churn');
    expect(h).toContain('/admin/connaissances');
  });
  it('chaque porte ne ferme que ses entrées', () => {
    expect(hrefs({ ...tout, providerConfigure: false })).toEqual(ITEMS.map((i) => i.href).filter((x) => x !== '/admin/studios-interrupteurs'));
    expect(hrefs({ ...tout, connaissances: false })).not.toContain('/admin/connaissances');
    expect(hrefs({ ...tout, equipe: false })).not.toContain('/admin/equipe');
    expect(hrefs({ ...tout, tour: false })).toEqual(['/admin/prompts', '/admin/prompts/registre', '/admin/ia-studios', '/admin/studios-interrupteurs', '/admin/connaissances', '/admin/equipe']);
  });
  it('une entrée inconnue suit la porte commune', () => {
    expect(porteEntreeAdmin('/admin/nouvelle')).toBe('tour');
  });
});
