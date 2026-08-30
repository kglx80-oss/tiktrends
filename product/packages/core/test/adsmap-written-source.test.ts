import { describe, it, expect } from 'vitest';
import {
  usableImageUrl, isSharePage, writtenDossier, sourceTag, sourceOf,
  WRITTEN_CONFIDENCE_CAP, SOURCE_LABEL,
} from '../src/adsmap/written-source';

describe('on ne donne au modèle qu’une adresse qu’il peut ouvrir', () => {
  it('accepte une image directe', () => {
    expect(usableImageUrl('https://cdn.exemple.com/a/b.jpg')).toBe('https://cdn.exemple.com/a/b.jpg');
  });

  it('accepte une URL sans extension · beaucoup de CDN en servent', () => {
    // Une règle trop stricte perdrait de vrais assets en silence. On tente.
    expect(usableImageUrl('https://cdn.exemple.com/img?id=42&format=jpg')).not.toBeNull();
  });

  it('accepte une donnée en ligne', () => {
    expect(usableImageUrl('data:image/png;base64,AAAA')).toContain('data:image/png');
  });

  it('refuse les pages de partage · elles servent du HTML, jamais une image', () => {
    for (const u of [
      'https://drive.google.com/file/d/abc/view',
      'https://www.dropbox.com/s/abc/pub.mp4',
      'https://www.notion.so/page-123',
      'https://youtu.be/abcdef',
      'https://vimeo.com/12345',
    ]) {
      expect(usableImageUrl(u), u).toBeNull();
      expect(isSharePage(u), u).toBe(true);
    }
  });

  it('refuse un sous-domaine de page de partage', () => {
    expect(usableImageUrl('https://team.sharepoint.com/x/y.png')).toBeNull();
  });

  it('refuse ce qui n’est pas une adresse web', () => {
    expect(usableImageUrl('ftp://x/y.png')).toBeNull();
    expect(usableImageUrl('pas une url')).toBeNull();
    expect(usableImageUrl('')).toBeNull();
    expect(usableImageUrl(null)).toBeNull();
  });

  it('une absence de lien n’est pas une page de partage', () => {
    expect(isSharePage(null)).toBe(false);
    expect(isSharePage('')).toBe(false);
  });
});

describe('le dossier écrit', () => {
  it('refuse de décrire à partir d’un seul champ', () => {
    // Un titre nomme une pub, il ne la décrit pas · le modèle remplirait quand
    // même le formulaire, et ces valeurs entreraient dans les statistiques.
    expect(writtenDossier({ conceptTitle: 'Le garage rangé' })).toBeNull();
    expect(writtenDossier({})).toBeNull();
    expect(writtenDossier({ learnings: ['une seule chose'] })).toBeNull();
  });

  it('compose dès qu’il y a deux éléments', () => {
    const d = writtenDossier({ conceptTitle: 'Le garage rangé', hypothesis: 'Une accroche chiffrée retient mieux.' });
    expect(d).toContain('Le garage rangé');
    expect(d).toContain('Une accroche chiffrée retient mieux.');
  });

  it('prévient le modèle qu’il ne voit rien', () => {
    const d = writtenDossier({ conceptTitle: 'A', hypothesis: 'B' })!;
    expect(d).toContain('tu ne vois PAS la créa');
    expect(d).toContain('Laisse VIDE');
    // Le détail visuel nommément interdit · sans ça le modèle comble.
    expect(d).toContain('coupes');
    expect(d).toContain('sous-titres');
  });

  it('reprend les apprentissages, bornés', () => {
    const d = writtenDossier({
      conceptTitle: 'A', hypothesis: 'B',
      learnings: ['un', 'deux', 'trois', 'quatre', 'cinq', 'six'],
    })!;
    expect(d).toContain('- un');
    expect(d).toContain('- quatre');
    expect(d).not.toContain('- cinq');
  });

  it('ignore les champs vides ou blancs', () => {
    const d = writtenDossier({ conceptTitle: '  ', hypothesis: 'B', callout: 'C' })!;
    expect(d).not.toContain('Concept :');
    expect(d).toContain('Accroche de l’angle : C');
  });

  it('borne la taille · on ne paie pas des jetons pour du remplissage', () => {
    const d = writtenDossier({ conceptTitle: 'A', valueBlock: 'x'.repeat(9000) })!;
    expect(d.length).toBeLessThan(2400);
  });

  it('ne réclame pas d’ordre particulier des champs', () => {
    const a = writtenDossier({ hypothesis: 'B', conceptTitle: 'A' });
    const b = writtenDossier({ conceptTitle: 'A', hypothesis: 'B' });
    expect(a).toBe(b);
  });
});

describe('la provenance ne se perd pas', () => {
  it('marque une description tirée du texte', () => {
    expect(sourceTag('claude-sonnet-5', 'written')).toBe('claude-sonnet-5:texte');
    expect(sourceTag('claude-sonnet-5', 'asset')).toBe('claude-sonnet-5');
  });

  it('se relit dans les deux sens', () => {
    expect(sourceOf(sourceTag('claude-sonnet-5', 'written'))).toBe('written');
    expect(sourceOf(sourceTag('claude-sonnet-5', 'asset'))).toBe('asset');
    expect(sourceOf('manuel')).toBe('manual');
    expect(sourceOf(null)).toBeNull();
  });

  it('la confiance d’un brief est plafonnée sous celle d’un asset', () => {
    expect(WRITTEN_CONFIDENCE_CAP).toBeLessThan(1);
    // Sous le seuil où `summarizeAnalysis` cesse de prévenir, mais pas au point
    // de rendre la donnée inutilisable.
    expect(WRITTEN_CONFIDENCE_CAP).toBeGreaterThan(0.4);
  });

  it('chaque provenance a un libellé affichable', () => {
    expect(SOURCE_LABEL.asset).toContain('créa');
    expect(SOURCE_LABEL.written).toContain('brief');
    expect(SOURCE_LABEL.manual).toContain('main');
  });
});
