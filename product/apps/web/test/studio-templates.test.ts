import { describe, it, expect } from 'vitest';
import { AD_TEMPLATES } from '@tiktrends/ai';
import { STUDIO_TEMPLATES, mechanismForTemplate } from '@tiktrends/core';

/**
 * Le doublon qui doit rester synchrone.
 *
 * `AD_TEMPLATES` vit dans `@tiktrends/ai` (c'est ce que le modèle a le droit de
 * renvoyer), `STUDIO_TEMPLATES` vit dans `@tiktrends/core` (c'est ce que la
 * carte sait rattacher). Les deux paquets ne se dépendent pas · aucun ne peut
 * importer l'autre, et la liste est donc écrite deux fois.
 *
 * Ce test est le seul endroit qui voit les deux. Sans lui, ajouter un gabarit
 * côté IA le laisserait sans mécanisme ADSMAP · exactement ce qui est arrivé à
 * « Bénéfices annotés », rangé sous `demo` depuis toujours parce que la table
 * s'appelait `benefit_stack` et la liste `benefits`.
 */
describe('les deux listes de gabarits ne divergent pas', () => {
  it('elles contiennent exactement les mêmes clés', () => {
    expect([...STUDIO_TEMPLATES].sort()).toEqual([...AD_TEMPLATES].sort());
  });

  it('chaque gabarit que le modèle peut renvoyer a un mécanisme', () => {
    for (const t of AD_TEMPLATES) {
      expect(mechanismForTemplate(t), `« ${t} » n’a pas de mécanisme ADSMAP`).toBeTruthy();
    }
  });
});
