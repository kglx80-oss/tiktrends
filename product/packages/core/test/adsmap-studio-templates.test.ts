import { describe, it, expect } from 'vitest';
import {
  STUDIO_TEMPLATES, TEMPLATE_MECHANISM, TEMPLATE_LABEL,
  isStudioTemplate, mechanismForTemplate,
} from '../src/adsmap/studio-templates';

describe('chaque gabarit porte un mécanisme', () => {
  it('aucun n’est oublié', () => {
    // Le type le garantit déjà à la compilation · ce test tient pour le jour où
    // quelqu'un élargit la table en `Record<string, string>` pour se dépanner.
    for (const t of STUDIO_TEMPLATES) {
      expect(TEMPLATE_MECHANISM[t], `mécanisme manquant pour « ${t} »`).toBeTruthy();
    }
  });

  it('« benefits » est bien là', () => {
    // C'est le gabarit qui manquait. La table s'appelait `benefit_stack`, la
    // liste réelle dit `benefits` · toutes les créas « Bénéfices annotés »
    // retombaient sur le mécanisme par défaut et s'accumulaient sous une
    // étiquette qui n'était pas la leur.
    expect(mechanismForTemplate('benefits')).toBe('listicle');
  });

  it('chaque gabarit porte un nom affichable', () => {
    for (const t of STUDIO_TEMPLATES) {
      expect(TEMPLATE_LABEL[t]?.length, `nom manquant pour « ${t} »`).toBeGreaterThan(2);
    }
  });
});

describe('ce qui n’est pas un gabarit', () => {
  it('rend null plutôt qu’un défaut caché', () => {
    // Un défaut ici reproduirait exactement la panne de `benefits` · l'appelant
    // qui DOIT écrire quelque chose choisit son repli et l'assume.
    expect(mechanismForTemplate('benefit_stack')).toBeNull();
    expect(mechanismForTemplate('demo')).toBeNull();
    expect(mechanismForTemplate(null)).toBeNull();
    expect(mechanismForTemplate(undefined)).toBeNull();
    expect(mechanismForTemplate('')).toBeNull();
  });

  it('isStudioTemplate refuse ce qui vient du navigateur', () => {
    expect(isStudioTemplate('offer')).toBe(true);
    expect(isStudioTemplate('n’importe quoi')).toBe(false);
    expect(isStudioTemplate(42)).toBe(false);
    expect(isStudioTemplate(null)).toBe(false);
  });
});
