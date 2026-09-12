import { describe, expect, it } from 'vitest';
import { IMAGE_MODELS } from '../src/economics';
import { familleMoteur, vignetteMoteur } from '../src/moteur-vignette';

/**
 * La vignette rend visible le CHOIX du moteur · elle doit être définie pour
 * chaque moteur du catalogue, distincte d'une famille à l'autre, et cohérente
 * avec la force de la famille (produit vs texte). Un catalogue qui gagnerait un
 * moteur sans vignette retomberait sur le repli · ce test le laisserait passer
 * pour `autre`, mais casserait sur les familles connues si la déduction se
 * trompait.
 */

describe('chaque moteur du catalogue a une vignette complète', () => {
  it('dégradé à deux teintes, motif valide, force non vide', () => {
    for (const m of IMAGE_MODELS) {
      const v = vignetteMoteur(m.key);
      expect(v.degrade, `${m.key} · dégradé`).toHaveLength(2);
      expect(v.degrade[0], `${m.key} · teinte 0`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(v.degrade[1], `${m.key} · teinte 1`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(['produit', 'texte'], `${m.key} · motif`).toContain(v.motif);
      expect(v.force.trim().length, `${m.key} · force`).toBeGreaterThan(0);
    }
  });
});

describe('la vignette suit la force de la famille', () => {
  it('Nano Banana montre le produit · GPT Image montre le texte', () => {
    // Le sens de l'inspiration : l'exemple visuel INCARNE ce que le moteur fait
    // de mieux. Nano tient le produit → packshot ; GPT écrit le texte → typo.
    expect(vignetteMoteur('nano').motif).toBe('produit');
    expect(vignetteMoteur('nano_high').motif).toBe('produit');
    expect(vignetteMoteur('gpt2').motif).toBe('texte');
    expect(vignetteMoteur('gpt2_high').motif).toBe('texte');
    expect(vignetteMoteur('gpt_image').motif).toBe('texte');
  });

  it('les deux variantes d’un modèle partagent la vignette de leur famille', () => {
    expect(familleMoteur('nano')).toBe('nano');
    expect(familleMoteur('nano_high')).toBe('nano');
    expect(vignetteMoteur('nano')).toEqual(vignetteMoteur('nano_high'));
    expect(familleMoteur('gpt2')).toBe('gpt');
    expect(familleMoteur('gpt2_high')).toBe('gpt');
    expect(familleMoteur('gpt_image')).toBe('gpt');
    expect(vignetteMoteur('gpt2')).toEqual(vignetteMoteur('gpt2_high'));
  });

  it('deux familles ne peuvent pas se ressembler · dégradé et motif distincts', () => {
    // Une grille où toutes les cartes ont le même fond raterait tout l'intérêt ·
    // le test refuse que Nano et GPT partagent leur apparence.
    const nano = vignetteMoteur('nano');
    const gpt = vignetteMoteur('gpt2');
    expect(nano.degrade).not.toEqual(gpt.degrade);
    expect(nano.motif).not.toBe(gpt.motif);
  });

  it('une clé inconnue tombe sur un repli présentable, jamais une erreur', () => {
    const v = vignetteMoteur('inexistant');
    expect(v.famille).toBe('autre');
    expect(v.degrade).toHaveLength(2);
    expect(v.force.trim().length).toBeGreaterThan(0);
  });
});
