import { describe, it, expect } from 'vitest';
import { porteuseSynchro, phraseCreasEtrangeres } from '../src/adsmap/porteuse-synchro';
import { sansTiretCadratin } from '../src/ponctuation-ecran';

describe('porteuseSynchro · la synchro n’écrit les mesures que sur une créa de la marque', () => {
  it('lien vers une créa de la marque · on y écrit', () => {
    expect(porteuseSynchro('crea-a', 'crea-a')).toEqual({ cas: 'propre', creativeId: 'crea-a' });
  });

  it('pas de lien · la coquille de la marque est à créer', () => {
    expect(porteuseSynchro(null, null)).toEqual({ cas: 'a_creer' });
  });

  it('lien vers une créa d’une autre marque (jointure bornée vide) · ÉTRANGÈRE, jamais « à créer » (le lien serait réécrit)', () => {
    expect(porteuseSynchro('crea-b', null)).toEqual({ cas: 'etrangere', creativeId: 'crea-b' });
  });

  it('la jointure bornée rend une autre créa que le lien · étrangère, par prudence', () => {
    expect(porteuseSynchro('crea-b', 'crea-a').cas).toBe('etrangere');
  });
});

describe('phraseCreasEtrangeres · le compte rendu nomme les ads écartées', () => {
  it('silence quand rien n’est écarté', () => {
    expect(phraseCreasEtrangeres(0)).toBeNull();
    expect(phraseCreasEtrangeres(Number.NaN)).toBeNull();
  });

  it('accorde le nombre et dit ce qui n’a pas été fait', () => {
    expect(phraseCreasEtrangeres(1)).toBe('1 ad liée à la créa d’une autre marque · ses mesures ne sont pas écrites sur cette créa, et le lien reste à réparer.');
    expect(phraseCreasEtrangeres(3)).toBe('3 ads liées à la créa d’une autre marque · leurs mesures ne sont pas écrites sur cette créa, et le lien reste à réparer.');
  });

  it('sans tiret cadratin à l’écran', () => {
    for (const n of [1, 2]) {
      const p = phraseCreasEtrangeres(n)!;
      expect(sansTiretCadratin(p)).toBe(p);
    }
  });
});
