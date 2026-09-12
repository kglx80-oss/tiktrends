import { describe, expect, it } from 'vitest';
import {
  cleBrief, briefFrais, appelsDansFenetre, briefSousLimite,
  BRIEF_TTL_MS, BRIEF_FENETRE_MS, BRIEF_MAX_PAR_FENETRE,
} from '../src/brief-cache';

/**
 * La décision de cache/throttle du brief concurrent · pure, donc éprouvable sans
 * réseau. Ce qu'on tient : deux frappes de la même marque partagent une entrée,
 * une entrée périmée n'est pas servie, et le plafond par fenêtre coupe la boucle.
 */
describe('cleBrief · deux frappes de la même marque = une entrée', () => {
  it('normalise casse et espaces', () => {
    expect(cleBrief('meta', 'Feel')).toBe(cleBrief('META', '  feel '));
    expect(cleBrief('meta', 'Old   Spice')).toBe(cleBrief('meta', 'old spice'));
  });
  it('sépare des marques différentes', () => {
    expect(cleBrief('meta', 'Feel')).not.toBe(cleBrief('meta', 'Feol'));
    expect(cleBrief('meta', 'Feel')).not.toBe(cleBrief('tiktok', 'Feel'));
  });
});

describe('briefFrais · une entrée périmée n’est pas servie', () => {
  it('frais tant qu’on est sous le TTL, périmé au-delà', () => {
    expect(briefFrais(1000, 1000 + BRIEF_TTL_MS - 1)).toBe(true);
    expect(briefFrais(1000, 1000 + BRIEF_TTL_MS)).toBe(false);
    expect(briefFrais(1000, 1000 + BRIEF_TTL_MS + 5_000)).toBe(false);
  });
});

describe('throttle · le plafond par fenêtre coupe la boucle', () => {
  it('ne compte que les appels DANS la fenêtre', () => {
    const now = 1_000_000;
    const horod = [now - BRIEF_FENETRE_MS - 1, now - 10, now - 5]; // 1 hors fenêtre, 2 dedans
    expect(appelsDansFenetre(horod, now)).toEqual([now - 10, now - 5]);
  });

  it('autorise sous le plafond, bloque à l’atteinte', () => {
    const now = 1_000_000;
    const sousMax = Array.from({ length: BRIEF_MAX_PAR_FENETRE - 1 }, () => now - 1);
    expect(briefSousLimite(sousMax, now)).toBe(true);
    const auMax = Array.from({ length: BRIEF_MAX_PAR_FENETRE }, () => now - 1);
    expect(briefSousLimite(auMax, now)).toBe(false);
  });

  it('les appels vieux (hors fenêtre) ne comptent pas dans le plafond', () => {
    const now = 1_000_000;
    // BRIEF_MAX vieux appels, tous hors fenêtre · un nouvel appel doit passer.
    const vieux = Array.from({ length: BRIEF_MAX_PAR_FENETRE + 5 }, () => now - BRIEF_FENETRE_MS - 1);
    expect(briefSousLimite(vieux, now)).toBe(true);
  });
});
