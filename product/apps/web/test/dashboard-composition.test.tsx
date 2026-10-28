import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { placementLanceurSupport, modeProchaineEtape } from '@tiktrends/core';

/**
 * Lot Dashboard · la règle pure de composition de la prochaine étape (noyau) et
 * l'ancrage du lanceur de support. L'ancien Accueil V5 (prochaine étape, aperçu
 * d'exemple, ordre des sections) est retiré · `/dashboard` est servi par
 * Spatial (vague 2 Spatial v4), dont la carte de configuration et « À faire
 * maintenant » portent la prochaine étape réelle (`spatial-accueil-db`).
 */
const shell = readFileSync(join(process.cwd(), 'components/AppShell.tsx'), 'utf8');

describe('Dashboard · règle de composition (noyau, pure)', () => {
  it('installation SEULEMENT si un parcours existe et n’est pas complet', () => {
    // Mutation : inverser la condition dans le noyau fait tomber ces quatre cas.
    expect(modeProchaineEtape({ parcoursPresent: true, journeyComplete: false })).toBe('installation');
    expect(modeProchaineEtape({ parcoursPresent: true, journeyComplete: true })).toBe('iteration');
    expect(modeProchaineEtape({ parcoursPresent: false, journeyComplete: false })).toBe('iteration');
    expect(modeProchaineEtape({ parcoursPresent: false, journeyComplete: true })).toBe('iteration');
  });
});

describe('Dashboard · shell', () => {
  it('le support est ANCRÉ sur /dashboard (réutilise #689), pas une bulle fixe', () => {
    expect(placementLanceurSupport('/dashboard')).toBe('ancre');
    expect(shell).toContain('supportAncre');
  });
});
