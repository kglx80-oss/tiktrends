import { describe, it, expect } from 'vitest';
import { servedAssetUrl, isPrivateDriveUrl, type AssetAddress } from '../lib/asset-url';

const asset = (o: Partial<AssetAddress> = {}): AssetAddress => ({
  id: 'a1', kind: 'image', source: 'upload', url: 'https://cdn.example/photo.jpg', embedded: false, ...o,
});

describe('aucun contenu d’image ne part dans la page', () => {
  /**
   * Le défaut le plus coûteux qu'on ait eu · une image téléversée est stockée
   * en base sous forme de `data:` URI, jusqu'à six mégaoctets de base64, et la
   * liste la renvoyait telle quelle. Vingt-quatre vignettes pesaient alors plus
   * lourd que tout le reste de l'application, dans une page qu'aucun cache ne
   * peut aider.
   */
  it('une image embarquée passe par le proxy', () => {
    expect(servedAssetUrl(asset({ embedded: true, url: '' }))).toBe('/api/asset/a1');
  });

  it('même si la colonne contenait encore le base64, rien ne fuit', () => {
    const u = servedAssetUrl(asset({ embedded: true, url: 'data:image/jpeg;base64,AAAA' }));
    expect(u).not.toContain('base64');
    expect(u).toBe('/api/asset/a1');
  });

  it('une image Drive privée passe aussi par le proxy · elle n’est pas affichable sinon', () => {
    expect(servedAssetUrl(asset({ source: 'drive', url: 'https://drive.google.com/file/x' })))
      .toBe('/api/asset/a1');
  });

  it('une adresse publique reste telle quelle · un saut de plus ne servirait à rien', () => {
    expect(servedAssetUrl(asset())).toBe('https://cdn.example/photo.jpg');
  });

  it('une vidéo Drive n’est pas détournée · le proxy ne sert que les images', () => {
    expect(servedAssetUrl(asset({ kind: 'video', source: 'drive', url: 'https://drive.google.com/file/v' })))
      .toBe('https://drive.google.com/file/v');
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
