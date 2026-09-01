import { describe, it, expect } from 'vitest';
import { servedAssetUrl, assetServing, isPrivateDriveUrl, type AssetAddress } from '../lib/asset-url';

const asset = (o: Partial<AssetAddress> = {}): AssetAddress => ({
  id: 'a1', kind: 'image', source: 'upload', url: 'https://cdn.example/photo.jpg', embedded: false, ...o,
});

describe('aucun contenu d’image ne part dans la page', () => {
  /**
   * Le défaut le plus coûteux qu'on ait eu · une image téléversée est stockée
   * en base sous forme de `data:` URI, jusqu'à six mégaoctets de base64, et la
   * liste la renvoyait telle quelle. Vingt-quatre vignettes pesaient alors plus
   * lourd que tout le reste de l'application.
   */
  it('une image embarquée passe par le proxy', () => {
    expect(servedAssetUrl(asset({ embedded: true, url: '' }))).toBe('/api/asset/a1');
  });

  it('même si la colonne contenait encore le base64, rien ne fuit', () => {
    const u = servedAssetUrl(asset({ embedded: true, url: 'data:image/jpeg;base64,AAAA' }));
    expect(u).not.toContain('base64');
    expect(u).toBe('/api/asset/a1');
  });

  it('une adresse publique reste telle quelle · un saut de plus ne servirait à rien', () => {
    expect(servedAssetUrl(asset())).toBe('https://cdn.example/photo.jpg');
  });
});

/**
 * Le test précédent vérifiait l'ADRESSE, pas que la porte s'ouvre · c'est
 * exactement ce qui a laissé passer le bug : les images Drive étaient envoyées
 * vers un proxy qui ne savait pas les lire, et la bibliothèque affichait des
 * cadres vides.
 *
 * Le mode de service est donc nommé et testé pour lui-même. La route l'épuise
 * avec un `never` final : un quatrième mode casse la compilation tant qu'elle
 * ne le traite pas.
 */
describe('le mode de service dit ce que le proxy devra savoir faire', () => {
  it('embarquée · le proxy décode', () => {
    expect(assetServing(asset({ embedded: true, url: '' }))).toBe('embedded');
  });

  it('Drive privée avec identifiant · le proxy télécharge', () => {
    expect(assetServing(asset({ source: 'drive', url: 'https://drive.google.com/file/x', externalId: 'FID' })))
      .toBe('drive');
  });

  it('Drive SANS identifiant · on ne promet pas un proxy qui échouera', () => {
    // On ne saurait pas quoi demander à Drive · autant tenter l'adresse telle
    // quelle plutôt que de garantir une image qui ne viendra jamais.
    expect(assetServing(asset({ source: 'drive', url: 'https://drive.google.com/file/x', externalId: null })))
      .toBe('direct');
  });

  it('googleusercontent compte aussi comme Drive privé', () => {
    expect(assetServing(asset({ url: 'https://lh3.googleusercontent.com/x', externalId: 'FID' }))).toBe('drive');
  });

  it('adresse publique · direct', () => {
    expect(assetServing(asset())).toBe('direct');
  });

  it('tout ce qui n’est pas direct passe par le proxy, et rien d’autre', () => {
    const cas: AssetAddress[] = [
      asset({ embedded: true, url: '' }),
      asset({ source: 'drive', url: 'https://drive.google.com/f', externalId: 'F' }),
      asset(),
    ];
    for (const c of cas) {
      const parProxy = servedAssetUrl(c).startsWith('/api/asset/');
      expect(parProxy, `${assetServing(c)} mal aiguillé`).toBe(assetServing(c) !== 'direct');
    }
  });
});

describe('ce qui compte comme lien Drive privé', () => {
  it('reconnaît les deux domaines servis par Google', () => {
    expect(isPrivateDriveUrl('https://drive.google.com/uc?id=1')).toBe(true);
    expect(isPrivateDriveUrl('https://lh3.googleusercontent.com/x')).toBe(true);
  });

  it('ne se déclenche pas sur une adresse ordinaire', () => {
    expect(isPrivateDriveUrl('https://cdn.example/photo.jpg')).toBe(false);
  });
});
