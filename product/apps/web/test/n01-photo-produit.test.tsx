import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AdTemplate } from '@tiktrends/ai';
import { AssistantPub } from '../app/(app)/studio/ads/AssistantPub';

/**
 * CDC v7 · N01 · la divergence photo produit. L'assistant lisait des champs
 * (`imageUrl`/`imageUrls`) que le studio ne lui passait jamais · il affichait
 * donc TOUJOURS « Sans photo · le modèle inventera l'emballage », même sur un
 * produit qui a une photo (le mode avancé, lui, lisait `hasImage`). On rend
 * l'étape « produit » et on vérifie le RÉSULTAT.
 */

const ETAT_BASE = {
  productId: '', aPhotoProduit: false, aDesProduits: true,
  angle: '', offre: '', gabarits: ['benefits'] as readonly string[],
  direction: '', mode: 'entiere', nombre: 2, moteur: 'nano-banana-2',
};

function rendre(produits: Array<{ id: string; name: string; hasImage: boolean; photoUrl?: string | null }>) {
  return renderToStaticMarkup(<AssistantPub
    ouvert onFermer={() => {}}
    etat={{ ...ETAT_BASE }}
    produits={produits}
    libelleGabarit={() => 'Bénéfices'}
    selecteurStyle={<div />}
    conseilMoteurs={{ recommande: null, deconseilles: [], lignes: {}, resume: '' }}
    gabaritsDispo={['benefits'] as AdTemplate[]}
    onProduit={() => {}} onGabarit={() => {}} onAngle={() => {}} onOffre={() => {}}
    onDirection={() => {}} onMode={() => {}} onNombre={() => {}} onMoteur={() => {}}
    onGenerer={() => {}} busy={false} erreur="" budget={null}
  />);
}

describe('N01 · l’assistant lit le vrai état photo, comme le mode avancé et le moteur', () => {
  it('un produit AVEC photo dit « Photo présente » et montre sa référence', () => {
    const h = rendre([{ id: 'p', name: 'Pastilles Effervescentes', hasImage: true, photoUrl: 'data:image/png;base64,AAAA' }]);
    expect(h, 'l’assistant nie encore une photo présente').toContain('Photo présente');
    expect(h, 'un produit avec photo est annoncé « Sans photo »').not.toContain('Sans photo');
    // La vignette montre la référence EXACTE que le moteur recevra.
    expect(h, 'la référence affichée n’est pas celle du produit').toContain('src="data:image/png;base64,AAAA"');
  });

  it('un produit SANS photo dit « Sans photo · le modèle inventera l’emballage »', () => {
    const h = rendre([{ id: 'p', name: 'Sérum', hasImage: false, photoUrl: null }]);
    expect(h).toContain('Sans photo');
    expect(h).not.toContain('Photo présente');
  });

  it('référence indisponible ≠ absente · photo présente mais vignette manquante reste « présente »', () => {
    // Le moteur a bien une référence (hasImage), même si son URL n'est pas
    // affichable ici · on ne bascule pas à tort en « Sans photo ».
    const h = rendre([{ id: 'p', name: 'Crème', hasImage: true, photoUrl: null }]);
    expect(h).toContain('Photo présente');
    expect(h).not.toContain('Sans photo');
  });
});

describe('N01 · la référence affichée EST celle transmise au moteur', () => {
  it('la page dérive photoUrl de products.imageUrl(s) · la même source que le moteur', () => {
    const page = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/page.tsx'), 'utf8');
    expect(page, 'la page ne dérive pas la photo de products.imageUrl').toMatch(/photoUrl = p\.imageUrl \|\| p\.imageUrls\?\.\[0\]/);
    expect(page, 'hasImage n’est pas dérivé de la même référence').toContain('hasImage: !!photoUrl');
  });

  it('le moteur référence bien products.imageUrl(s) · productImageUrls', () => {
    const actions = readFileSync(join(process.cwd(), 'app/actions/ads.ts'), 'utf8');
    // La génération charge imageUrl/imageUrls du produit et les passe en référence.
    expect(actions).toMatch(/imageUrl: schema\.products\.imageUrl/);
    expect(actions).toContain('productImageUrls');
  });
});
