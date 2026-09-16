import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le moteur par défaut dépend du MODE de fabrication · GPT Image 2 en entière
 * (le moteur y écrit la typographie), Nano Banana en composée (fidélité
 * produit). L'état initial `model` le respecte, mais il est figé au montage.
 *
 * Le défaut · en changeant de mode APRÈS l'arrivée (`choisirFabrication`), le
 * moteur restait celui de l'autre mode, alors que la MÊME liste déroulante
 * l'annonce « recommandé » ailleurs. On générait, et on payait, avec le mauvais
 * moteur pour le mode retenu · exactement le réglage qui « promet ce qui
 * n'arrivera pas ».
 *
 * Le correctif · le changement de mode re-dérive le moteur par défaut TANT QUE
 * l'utilisateur ne l'a pas choisi lui-même. Dès qu'il choisit (via
 * `choisirMoteur`, qui lève le drapeau), son choix tient.
 *
 * Composant client volumineux à actions serveur · non rendable · garde par
 * adoption de la source, comme les autres gardes d'AdsStudio.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

describe('AdsStudio · le moteur par défaut suit le mode', () => {
  it('l’état initial du moteur est conscient du mode', () => {
    expect(src, 'le défaut initial doit passer par moteurParDefaut(fabrication, …)')
      .toContain('useState(moteurParDefaut(fabrication');
  });

  it('changer de mode re-dérive le moteur tant que l’utilisateur ne l’a pas choisi', () => {
    const iFab = src.indexOf('const choisirFabrication');
    expect(iFab, 'handler de changement de mode introuvable').toBeGreaterThan(-1);
    const corps = src.slice(iFab, src.indexOf('};', iFab));
    expect(corps, 'la re-dérivation doit être gardée par le choix explicite de l’utilisateur')
      .toContain('!moteurChoisi');
    expect(corps, 'le moteur doit être re-dérivé selon le NOUVEAU mode')
      .toContain('setModel(moteurParDefaut(m');
  });

  it('un choix explicite du moteur lève le drapeau et coupe la re-dérivation', () => {
    const iCh = src.indexOf('const choisirMoteur');
    expect(iCh, 'wrapper de choix de moteur introuvable').toBeGreaterThan(-1);
    const ligne = src.slice(iCh, src.indexOf('\n', iCh));
    expect(ligne, 'choisirMoteur doit mémoriser que l’utilisateur a choisi')
      .toContain('setMoteurChoisi(true)');
  });

  it('les changements de moteur venus de l’interface passent par choisirMoteur, pas par setModel brut', () => {
    expect(src, 'le sélecteur de l’assistant doit passer par choisirMoteur')
      .toContain('onMoteur={choisirMoteur}');
    expect(src, 'le sélecteur du studio doit passer par choisirMoteur')
      .toContain('onChange: choisirMoteur');
    expect(src, 'aucun sélecteur d’interface ne doit court-circuiter le drapeau via setModel brut')
      .not.toContain('onMoteur={setModel}');
  });
});
