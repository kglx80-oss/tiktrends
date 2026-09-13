import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'ancrage produit (éprouvé au noyau) doit ATTEINDRE les prompts de scène ·
 * sinon les cases ouvertes des directions se remplissent hors sujet (le flacon
 * sur une céramique qui ne veut rien dire). Le noyau prouve le contenu de la
 * consigne et son injection dans promptPubEntiere · ici on vérifie le CÂBLAGE
 * web : l'ancrage est bâti depuis le contexte produit et passé aux deux modes.
 *
 * Fichier `'use server'` · scenePrompt local non exporté · non exécutable.
 * Adoption par la source.
 */
const src = readFileSync(join(process.cwd(), 'app/actions/ads.ts'), 'utf8');

describe('Ancrage produit · il atteint la génération', () => {
  it('l’ancrage est bâti depuis le contexte produit, aux deux lots', () => {
    const bati = src.split('contexteProduit: ancrageProduit({').length - 1;
    expect(bati, 'l’ancrage n’est pas construit depuis le contexte produit (lot principal + clone)').toBe(2);
    // Il doit tirer du produit ET du contexte de marque, pas d'une constante.
    expect(src, 'l’ancrage n’utilise pas le nom du produit').toContain('produit: product?.name');
    expect(src, 'l’ancrage n’utilise pas la catégorie de marque').toContain('categorie: da?.category');
  });

  it('scenePrompt accepte l’ancrage et l’injecte dans le prompt', () => {
    expect(src, 'scenePrompt n’accepte pas d’ancrage').toMatch(/function scenePrompt\([^)]*ancrage\?: string/s);
    const iFn = src.indexOf('function scenePrompt(');
    const corps = src.slice(iFn, iFn + 2200);
    expect(corps, 'l’ancrage n’est pas injecté dans le prompt de scène').toContain('${anc}');
  });

  it('les deux branches composées passent l’ancrage à scenePrompt', () => {
    const passes = src.split(/palette, daVisuelle, ancrage[,)]/).length - 1;
    expect(passes, 'une branche composée ne passe pas l’ancrage').toBe(2);
  });

  it('la publicité entière reçoit l’ancrage', () => {
    expect(src, 'promptPubEntiere ne reçoit pas l’ancrage').toContain('ancrage: o.contexteProduit,');
  });
});
