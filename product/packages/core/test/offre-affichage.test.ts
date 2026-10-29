import { describe, expect, it } from 'vitest';
import {
  COUT_BROUILLON_JARVIS, MENTION_INCLUS, disponibiliteJarvis, formatCredits, libelleCaseControleVisuel, libelleCoutRelecture, libellePrix,
  lectureCouverture, mentionAppelIA, mentionRadar, phraseCreditsDevis, prixImage, vueLignesDevis,
} from '../src';

/** Ce que le CLIENT lit d'un prix · des crédits, jamais d'argent (décision du 29/10, point 1). */
const sansArgent = (s: string) => expect(s, s).not.toMatch(/\$|€|dollar|euro/i);

describe('affichage client · en crédits', () => {
  it('les mentions d’un appel IA disent « inclus » quand rien n’est débité, le prix en crédits sinon', () => {
    expect(mentionAppelIA(null)).toBe('Appel IA · inclus · aucun crédit débité');
    expect(mentionAppelIA(136)).toBe('Appel IA · 136 crédits au plus');
    expect(formatCredits(20000).replace(/\s/g, ' ')).toBe('20 000 crédits');
    expect(formatCredits(1)).toBe('1 crédit');
    for (const s of [mentionAppelIA(null), mentionAppelIA(40), phraseCreditsDevis(40), phraseCreditsDevis(0), libelleCaseControleVisuel(null), libelleCaseControleVisuel(136), MENTION_INCLUS, COUT_BROUILLON_JARVIS]) sansArgent(s);
  });

  it('le prix d’une image, la relecture, la demande à Jarvis et la couverture des créas · sans argent', () => {
    sansArgent(libellePrix(prixImage()));
    expect(libellePrix(prixImage())).toMatch(/crédits$/);
    sansArgent(libelleCoutRelecture(0.13));
    sansArgent(disponibiliteJarvis({ releasePubliee: true, fournisseurConfigure: true, plafondAtteint: false, peutProposer: true, modele: 'claude-sonnet-5' }).mentionCout);
    const c = lectureCouverture({ total: 60, described: 10, manual: 0, fromWritten: 0, withoutAsset: 0, pendingAsset: 50, pendingWritten: 0, nextBatch: 25, nextCostUsd: 0.5, totalCostUsd: 1 });
    sansArgent(c.bouton); sansArgent(c.tranche!.cout); sansArgent(c.tranche!.detail);
    expect(c.bouton).toMatch(/^Décrire 25 créa\(s\) · \d[\d\s]* crédits$/);
  });

  it('le radar et les lignes d’un devis', () => {
    expect(mentionRadar(3, null).parNuit).toBe('Jusqu’à 3 créas décrites par nuit · inclus · aucun crédit débité');
    expect(mentionRadar(3, 20).bouton).toBe(' · au plus 60 crédits par nuit');
    const [l] = vueLignesDevis([{ operation: 'keyframe:a', profil: 'image_generation', unites: 2, credits: 40, usdMicros: 80_000, natureCout: 'borne' }]);
    expect(l!.credits).toBe(80);
  });
});
