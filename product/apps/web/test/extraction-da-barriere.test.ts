import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'analyse du style du site DÉPENSE (LLM). Elle doit passer par la barrière ·
 * garde d'accès de marque, guardedAnthropic (plafond), réservation de crédits
 * AVANT l'appel et remboursement en cas d'échec · sinon on facture sans filet.
 * Elle range la DA dans brandKit, et le bouton annonce le prix AVANT le clic.
 *
 * Action serveur + client · non exécutables. Adoption par la source, bornée à
 * l'action et au bouton.
 */
const action = readFileSync(join(process.cwd(), 'app/actions/brand-detail.ts'), 'utf8');
const iFn = action.indexOf('export async function extractBrandVisualDaAction');
const iEnd = action.indexOf('\nconst norm =', iFn);
const fn = action.slice(iFn, iEnd > iFn ? iEnd : iFn + 2200);
const ui = readFileSync(join(process.cwd(), 'app/(app)/brands/[id]/BrandDA.tsx'), 'utf8');

describe('Analyse du style · la dépense passe par la barrière', () => {
  it('l’action existe et est bornée à sa marque (garde d’accès), AVANT toute dépense', () => {
    expect(iFn, 'action d’extraction DA introuvable').toBeGreaterThan(-1);
    expect(fn, 'la marque n’est pas gardée (guardBrand)').toContain('guardBrand(brandId)');
    // La garde d'accès doit précéder la réservation de crédits ET l'appel IA ·
    // un refactor qui la déplacerait après la dépense doit faire tomber la garde.
    const iGuard = fn.indexOf('guardBrand(brandId)');
    const iReserve = fn.indexOf('reserveCredits(');
    const iCall = fn.indexOf('extractVisualDa(');
    expect(iGuard, 'la garde d’accès passe après la réservation de crédits').toBeLessThan(iReserve);
    expect(iGuard, 'la garde d’accès passe après l’appel IA').toBeLessThan(iCall);
  });

  it('barrière IA · guardedAnthropic, sinon pas de sortie', () => {
    expect(fn, 'l’appel IA ne passe pas par le plafond').toContain("guardedAnthropic({ action: 'brand-detail' })");
    expect(fn, 'un plafond atteint ne coupe pas l’action').toMatch(/if \(!client\) redirect/);
  });

  it('crédits réservés AVANT l’appel, remboursés à l’échec', () => {
    const iReserve = fn.indexOf('reserveCredits(');
    const iCall = fn.indexOf('extractVisualDa(');
    expect(iReserve, 'aucune réservation de crédits').toBeGreaterThan(-1);
    expect(iCall, 'l’appel IA est absent').toBeGreaterThan(-1);
    expect(iReserve, 'les crédits ne sont pas réservés AVANT l’appel IA').toBeLessThan(iCall);
    expect(fn, 'aucun remboursement en cas d’échec').toContain('refundCredits(');
  });

  it('la DA est rangée dans brandKit', () => {
    expect(fn, 'la DA n’est pas persistée dans brandKit').toContain('brandKit: da');
  });

  it('le bouton annonce le prix AVANT le clic', () => {
    expect(ui, 'le prix n’est pas écrit sur le bouton').toContain('Analyser le style · {costFor(\'brief\')} cr.');
  });
});
