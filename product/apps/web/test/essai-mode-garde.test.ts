import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Un essai « accroche » ou « mise en page » en mode entière est un FAUX essai ·
 * le texte y est cuit dans l'image, tenir la scène rend N fois le même visuel.
 * La règle vit au noyau (`essaiVisibleEnMode`, testée avec ses mutations dans
 * packages/core), mais elle ne protège rien si le câblage cesse de l'appeler.
 *
 * Ces deux surfaces doivent la consulter · le serveur qui refuse le lot AVANT
 * tout débit, et l'UI qui grise le choix. Ce garde tombe si l'une l'oublie ·
 * c'est là que le faux essai reviendrait, silencieusement.
 */
const racine = join(__dirname, '..');
const lit = (rel: string) => readFileSync(join(racine, rel), 'utf8');

describe('le faux essai entière+accroche/mise-en-page est gardé aux deux bouts', () => {
  it('le serveur (actions/ads.ts) refuse un essai invalide pour le mode', () => {
    const src = lit('app/actions/ads.ts');
    expect(src, 'ads.ts ne consulte plus essaiVisibleEnMode · le serveur laisserait passer le faux essai').toMatch(/essaiVisibleEnMode\s*\(/);
  });

  it('l’UI (AdsStudio.tsx) grise l’essai invalide pour le mode', () => {
    const src = lit('app/(app)/studio/ads/AdsStudio.tsx');
    expect(src, 'AdsStudio.tsx ne consulte plus essaiVisibleEnMode · l’UI offrirait le faux essai').toMatch(/essaiVisibleEnMode\s*\(/);
  });
});
