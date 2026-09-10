import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le studio Texte recharge le dernier résultat · il ne repart plus d'un écran
 * vide alors que la génération est en base. L'écriture existait déjà
 * (generateAction consigne un `script`) · c'est la LECTURE qui manquait.
 *
 * Fichiers serveur (page) / client couplé serveur (StudioClient) · non
 * rendables ici, on lit la source.
 */
const PAGE = readFileSync(join(process.cwd(), 'app/(app)/studio/textes/page.tsx'), 'utf8');
const CLIENT = readFileSync(join(process.cwd(), 'app/(app)/studio/textes/StudioClient.tsx'), 'utf8');

describe('le studio Texte recharge la dernière sortie', () => {
  it('la page lit la dernière génération « script » et la passe au client', () => {
    expect(PAGE).toMatch(/kind, 'script'\)|kind, "script"\)/);
    expect(PAGE).toContain('initialOutput');
    expect(PAGE, 'le résultat sauvegardé n’est pas transmis au client').toMatch(/initialOutput=\{initialOutput\}/);
  });

  it('le client affiche la sortie initiale à défaut d’une nouvelle', () => {
    // Une nouvelle génération remplace, sinon on montre l'enregistrée.
    expect(CLIENT).toMatch(/state\.output \?\? initialOutput/);
  });
});
