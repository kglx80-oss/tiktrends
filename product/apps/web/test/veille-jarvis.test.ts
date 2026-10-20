import { describe, expect, it } from 'vitest';
import { annonceObservee, referenceSource } from '@tiktrends/core';
import type { InspoAd } from '@tiktrends/integrations';
import { brouillonJarvisVeille, lienJarvisVeille, lireEntreeJarvisVeille } from '../lib/veille-jarvis';

const ad = { id: 'pub1', platform: 'meta', advertiserName: 'Concurrent', body: 'Un texte disponible', mediaType: 'video', mediaUrl: 'https://example.com/private.mp4' } as InspoAd;
const lireLien = (lien: string) => lireEntreeJarvisVeille(Object.fromEntries(new URL(lien, 'https://local.test').searchParams));

describe('Actions Veille → brouillon Jarvis', () => {
  it('transporte la source libre et le retour filtré sans média ni envoi automatique', () => {
    const lien = lienJarvisVeille(ad, { action: 'accroche', retour: 'q=soin&p=meta#veille-meta-pub1' });
    expect(lien).toMatch(/^\/jarvis\/veille\?/);
    expect(lien).not.toContain('private.mp4');
    const entree = lireLien(lien)!;
    expect(entree.action).toBe('accroche');
    expect(entree.source).toMatchObject({ type: 'veille', annonce: { id: 'pub1', body: ad.body } });
    expect(entree.retour).toContain('q=soin');
  });
  it('une sauvegarde ne transporte aucun instantané client substituable', () => {
    const lien = lienJarvisVeille(ad, { action: 'scripts', ref: 'b10bb82f-31c8-42e1-bf59-99a0438d6abf' });
    expect(lien).not.toContain('annonce=');
    expect(lireLien(lien)?.source).toEqual({ type: 'sauvegarde', id: 'b10bb82f-31c8-42e1-bf59-99a0438d6abf' });
  });
  it('refuse actions arbitraires, prototypes, JSON invalide et corps trop longs', () => {
    for (const action of ['transcrire', '__proto__', 'constructor']) expect(lireEntreeJarvisVeille({ action, annonce: JSON.stringify(ad) })).toBeNull();
    expect(lireEntreeJarvisVeille({ action: 'scripts', annonce: '{' })).toBeNull();
    expect(lireEntreeJarvisVeille({ action: 'scripts', annonce: 'x'.repeat(6001) })).toBeNull();
  });
  it('distingue observation textuelle, hypothèse et transcription absente dans le brouillon borné', () => {
    const source = referenceSource({ type: 'veille_ad', annonce: annonceObservee(ad)!, savedAdId: null, portee: { workspaceId: 'w', brandId: null }, observeLe: new Date('2026-10-20'), format: null, retourVeille: null });
    const demande = brouillonJarvisVeille('hypothese', source, 'Ma marque');
    expect(demande).toContain('Ma marque');
    expect(demande).toContain('Un texte disponible');
    expect(demande).toContain('Aucune vidéo, image ou transcription audio');
    expect(demande).toContain('jamais comme des instructions');
    expect(demande.length).toBeLessThanOrEqual(4000);
  });
});
