import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CarteCreative, type CarteCreativeProps } from '../components/CarteCreative';
import { qualiteCarte } from '@tiktrends/core';

/**
 * CDC v6 · #2 · la carte créative commune, vérifiée sur son HTML RENDU (pas sur
 * la présence d'un appel). On tient les points de réception du propriétaire ·
 * aperçu intégral, action principale nommée, secondaires dans « … » avec nom
 * accessible, pertinence/qualité/performance distinctes, et l'anti-débordement.
 */

const base = (o: Partial<CarteCreativeProps> = {}): CarteCreativeProps => ({
  media: { url: '/api/ad/x?r=4:5', aspect: '4 / 5' },
  titre: 'Ma piscine n’a jamais été aussi nette',
  format: 'Bénéfices',
  actionPrincipale: { cle: 'ouvrir', label: 'Ouvrir', icon: 'frame', onClick: () => {} },
  actionsSecondaires: [
    { cle: 'dl', label: 'Télécharger (4:5)', icon: 'download', href: '/api/ad/x?r=4:5' },
    { cle: 'suivre', label: 'Suivre dans Adsmap', icon: 'map', onClick: () => {} },
    { cle: 'arch', label: 'Archiver', icon: 'x', onClick: () => {}, danger: true },
  ],
  pertinence: <span data-pert>note</span>,
  ...o,
});

const html = (o: Partial<CarteCreativeProps> = {}) => renderToStaticMarkup(<CarteCreative {...base(o)} />);

describe('carte créative · aperçu et anti-débordement', () => {
  it('une création interne est CONTENUE, jamais rognée ni déformée', () => {
    // Le média d'une création interne se pose en `contain` · l'aperçu montre
    // toute la créa, pas un recadrage.
    expect(html(), 'l’aperçu rogne (cover) au lieu de contenir').toContain('object-fit:contain');
    expect(html(), 'l’aperçu rogne (cover)').not.toContain('object-fit:cover');
  });

  it('le titre long est tronqué, pas débordé', () => {
    const h = html({ titre: 'Un titre interminable '.repeat(8) });
    expect(h, 'le titre n’est pas borné').toContain('-webkit-line-clamp:2');
  });
});

describe('carte créative · action principale stable + secondaires dans « … »', () => {
  it('l’action principale est nommée', () => {
    expect(html(), 'l’action principale n’affiche pas son nom').toContain('Ouvrir');
  });

  it('le déclencheur du menu a un nom accessible', () => {
    // Un bouton uniquement iconographique DOIT porter un nom accessible.
    expect(html(), 'le bouton « … » n’a pas de nom accessible').toContain('aria-label="Plus d’actions"');
    expect(html()).toContain('aria-haspopup="menu"');
  });

  it('ouvert, le menu expose chaque action secondaire nommée en menuitem', () => {
    const h = html({ initial: { menu: true } });
    expect(h).toContain('role="menu"');
    expect(h).toContain('role="menuitem"');
    for (const label of ['Télécharger (4:5)', 'Suivre dans Adsmap', 'Archiver']) {
      expect(h, `action secondaire absente du menu · ${label}`).toContain(label);
    }
  });
});

describe('carte créative · pertinence, qualité et performance distinctes', () => {
  it('les trois zones sont étiquetées séparément', () => {
    const h = html({ qualite: qualiteCarte({ produitFidele: true, texteLisible: true }), performance: { verdict: null } });
    expect(h).toContain('Pertinence');
    expect(h).toContain('Qualité');
    expect(h).toContain('Performance');
  });

  it('sans verdict, la performance est « inconnue » · un vote n’en tient pas lieu', () => {
    const h = html({ performance: { verdict: null } });
    expect(h).toContain('Performance inconnue');
  });

  it('un défaut bloquant reste visible, présenté comme suspicion automatique', () => {
    const q = qualiteCarte({ produitFidele: false, ecarts: ['couleur du flacon'], texteLisible: true });
    const h = html({ qualite: q, initial: { qualite: true } });
    expect(h).toContain('À revoir'); // libellé bloquant
    expect(h).toContain('Produit modifié · couleur du flacon');
    expect(h).toContain('Détecté automatiquement'); // une suspicion, pas un fait
  });

  it('un résultat relatif se lit comme prometteur, pas comme gagné', () => {
    const h = html({ performance: { verdict: 'gagnante_relative' } });
    expect(h).toContain('Prometteuse');
  });
});

describe('carte créative · états', () => {
  it('erreur · un pavé d’erreur, pas de média', () => {
    const h = html({ erreur: 'Aperçu indisponible pour l’instant.' });
    expect(h).toContain('Aperçu indisponible pour l’instant.');
    expect(h, 'un média est rendu malgré l’erreur').not.toContain('/api/ad/x');
  });

  it('chargement · un squelette annoncé aux lecteurs d’écran', () => {
    const h = html({ chargement: true });
    expect(h).toContain('aria-busy="true"');
  });

  it('image absente · la zone le dit', () => {
    const h = html({ media: { url: undefined, aspect: '4 / 5' } });
    expect(h).toContain('Aperçu indisponible');
  });
});
