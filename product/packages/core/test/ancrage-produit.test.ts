import { describe, expect, it } from 'vitest';
import { ancrageProduit, contexteProduitUtile } from '../src/ancrage-produit';
import { promptPubEntiere } from '../src/production-mode';

/**
 * Les directions ont des cases ouvertes (« un accessoire sculptural ») que rien
 * n'ancrait sur CE produit · d'où le flacon posé sur une céramique hors sujet.
 * L'ancrage produit dit au modèle ce qu'est le produit et impose que tout
 * accessoire/surface appartienne à son monde. On vérifie le RÉSULTAT : la
 * consigne nomme le produit et porte l'interdit, et elle atteint le prompt.
 */
describe('ancrageProduit · tout accessoire reste dans le monde du produit', () => {
  const ctx = {
    produit: 'NURO Focus & Boost',
    categorie: 'supplément nootropique',
    audience: 'créateurs de contenu',
    description: 'caféine microencapsulée pour un focus durable sans crash',
  };

  it('nomme le produit, la catégorie, l’audience', () => {
    const s = ancrageProduit(ctx);
    expect(s).toContain('NURO Focus & Boost');
    expect(s).toContain('supplément nootropique');
    expect(s).toContain('créateurs de contenu');
  });

  it('porte l’interdit qui empêche l’accessoire hors sujet', () => {
    const s = ancrageProduit(ctx);
    expect(s, 'l’exigence « accessoire du monde du produit » manque').toContain('MUST plausibly belong');
    expect(s, 'l’interdit de surface ambiguë manque').toContain('off-topic surface');
  });

  it('se tait quand rien n’est connu · le prompt reste léger', () => {
    expect(ancrageProduit(null)).toBe('');
    expect(ancrageProduit({})).toBe('');
    expect(ancrageProduit({ produit: '   ' })).toBe('');
    expect(contexteProduitUtile({})).toBe(false);
    expect(contexteProduitUtile(ctx)).toBe(true);
  });

  it('une partie seule suffit à ancrer', () => {
    expect(ancrageProduit({ categorie: 'bougie parfumée' })).toContain('bougie parfumée');
    expect(ancrageProduit({ audience: 'jeunes parents' })).toContain('jeunes parents');
  });

  it('l’ancrage ATTEINT le prompt de publicité entière', () => {
    const anc = ancrageProduit(ctx);
    const prompt = promptPubEntiere({
      copie: { headline: 'Ton focus', brandName: 'Neva' },
      sceneBrief: 'the product on a desk',
      avecProduit: true,
      ancrage: anc,
    });
    expect(prompt, 'l’ancrage produit n’est pas injecté dans le prompt entière').toContain('MUST plausibly belong');
    expect(prompt).toContain('NURO Focus & Boost');
  });

  it('sans ancrage, le prompt entière ne porte pas l’interdit', () => {
    const prompt = promptPubEntiere({
      copie: { headline: 'Ton focus', brandName: 'Neva' },
      sceneBrief: 'the product on a desk',
      avecProduit: true,
    });
    expect(prompt).not.toContain('MUST plausibly belong');
  });
});
