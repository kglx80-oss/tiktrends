import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Le garde de dépense ne vaut que s'il est INCONTOURNABLE.
 *
 * Le dépôt compte une trentaine de points d'appel payants. Un garde qu'il faut
 * penser à invoquer finit toujours par être oublié au suivant · et c'est
 * celui-là qui fait la facture. Ce test échoue si quelqu'un réintroduit un
 * chemin direct vers un fournisseur payant.
 *
 * Il lit les fichiers plutôt que d'exécuter du code : c'est la seule façon de
 * vérifier une propriété qui porte sur TOUT le dossier, y compris sur des
 * fichiers qui n'existent pas encore.
 */

const RACINE = join(__dirname, '..');
const GARDE = join('lib', 'spend-guard.ts');

function fichiers(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next' || e === 'test') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) fichiers(p, out);
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const sources = [...fichiers(join(RACINE, 'app')), ...fichiers(join(RACINE, 'lib'))]
  .filter((p) => !p.endsWith(GARDE))
  .map((p) => ({ p: p.slice(RACINE.length + 1), s: readFileSync(p, 'utf8') }));

describe('aucun chemin ne contourne le plafond de dépense', () => {
  it('personne n’instancie le client Anthropic directement', () => {
    // `guardedAnthropic` est le seul point d'entrée · lui seul compte les dollars.
    const coupables = sources.filter((f) => /anthropicFromEnv|new Anthropic\(/.test(f.s)).map((f) => f.p);
    expect(coupables, `utilise le client brut au lieu de guardedAnthropic : ${coupables.join(', ')}`).toEqual([]);
  });

  it('chaque appel fal payant passe par l’enveloppeur', () => {
    // La génération d'image et de vidéo se facture au coup · sans garde, un
    // bouton cliqué en boucle passe la facture sans que rien ne l'arrête.
    //
    // On exige `sousPlafond`, pas `guardFixedCost` · le premier retient ET rend,
    // le second ne fait que retenir. Six points d'appel utilisaient le second :
    // chacun comptait 0,08 $ (0,60 $ en vidéo) même quand le fournisseur
    // refusait la demande à la porte sans rien produire. Un plafond dur de 10 $
    // se vidait ainsi en quelques lots ratés, sans qu'une seule image ne sorte.
    //
    // « Penser à rendre la dépense » est une consigne qu'on applique cinq fois
    // sur six · la sixième est celle qui verrouille le produit.
    const coupables = sources
      .filter((f) => /falGenerateImage\(|falSubmitVideo\(|falSubmitImageVideo\(/.test(f.s) && !/sousPlafond\(/.test(f.s))
      .map((f) => f.p);
    expect(coupables, `appelle fal sans sousPlafond : ${coupables.join(', ')}`).toEqual([]);
  });

  it('personne ne retient une dépense sans pouvoir la rendre', () => {
    // `guardFixedCost` seul est la moitié du contrat. Il reste exporté parce que
    // `sousPlafond` s'en sert · l'appeler ailleurs réintroduit la fuite.
    const coupables = sources.filter((f) => /guardFixedCost\(/.test(f.s)).map((f) => f.p);
    expect(coupables, `retient une dépense sans enveloppeur : ${coupables.join(', ')}`).toEqual([]);
  });

  it('le garde existe et exporte ce sur quoi le reste s’appuie', () => {
    const g = readFileSync(join(RACINE, GARDE), 'utf8');
    for (const nom of ['guardedAnthropic', 'guardFixedCost', 'sousPlafond', 'annuleCoutFixe', 'spendStatus', 'SpendBlockedError']) {
      expect(g, `${nom} n\u2019est plus export\u00e9`).toMatch(
        new RegExp(`export\\s+(async\\s+)?(function|class)\\s+${nom}\\b`),
      );
    }
  });
});
