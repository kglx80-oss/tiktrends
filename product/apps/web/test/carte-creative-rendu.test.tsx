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

describe('carte créative · N04 · le badge qualité est explicable et consultable', () => {
  it('le badge est activable MÊME « Prête à diffuser » · pas de bouton inerte', () => {
    // Le constat · un badge désactivé n'ouvre pas sa justification au clavier.
    const q = qualiteCarte({ produitFidele: true, texteLisible: true });
    const h = html({ qualite: q });
    expect(q.libelle).toBe('Prête à diffuser');
    expect(h, 'le badge qualité n’est pas consultable').toContain('aria-expanded');
    expect(h, 'le badge qualité est rendu inerte').not.toContain('disabled=""');
  });

  it('ouvert, il expose les TROIS natures et l’avertissement de preuve', () => {
    const q = qualiteCarte({
      produitFidele: true, texteLisible: true,
      faits: [{ cle: 'temoignage', label: 'Témoignage', etat: 'a_verifier' }],
      provenance: { date: '2026-09-16' },
    });
    const h = html({ qualite: q, initial: { qualite: true } });
    expect(h).toContain('Contrôle technique');
    expect(h).toContain('Validation factuelle');
    expect(h).toContain('Approbation humaine');
    expect(h, 'le témoignage à vérifier n’apparaît pas').toContain('Témoignage · à vérifier');
    expect(h, 'l’avertissement de preuve est absent').toContain('Une absence de défaut détecté n’équivaut pas à la vérification d’une preuve.');
  });

  it('une pub qui porte un témoignage non vérifié n’est pas « Prête à diffuser »', () => {
    const q = qualiteCarte({ produitFidele: true, texteLisible: true, faits: [{ cle: 't', label: 'Témoignage', etat: 'a_verifier' }] });
    const h = html({ qualite: q });
    expect(h, 'le badge annonce « prête » sur un fait non vérifié').not.toContain('Prête à diffuser');
    expect(h).toContain('1 point à vérifier');
  });
});

describe('carte créative · N04-suite · vérifier un fait depuis la carte', () => {
  it('un fait à vérifier propose « Vérifier » quand l’action est branchée', () => {
    const q = qualiteCarte({ produitFidele: true, texteLisible: true, faits: [{ cle: 'temoignage', label: 'Témoignage', etat: 'a_verifier' }] });
    const h = html({ qualite: q, initial: { qualite: true }, onVerifierFait: () => {} });
    expect(h, 'aucun moyen de vérifier le fait').toContain('Vérifier');
  });

  it('un fait vérifié montre sa preuve · source, validateur, version', () => {
    const q = qualiteCarte({ produitFidele: true, texteLisible: true, faits: [{ cle: 'temoignage', label: 'Témoignage', etat: 'verifiee', source: 'https://avis.example/1', validateur: 'Camille', date: '2026-09-17', version: 'v·0a1b2c3d' }] });
    const h = html({ qualite: q, initial: { qualite: true } });
    expect(h, 'la source consultable n’est pas là').toContain('href="https://avis.example/1"');
    expect(h, 'le validateur manque').toContain('Camille');
    expect(h, 'la version validée manque').toContain('v·0a1b2c3d');
  });

  it('un fait devenu caduc le dit et propose « Re-vérifier »', () => {
    const q = qualiteCarte({ produitFidele: true, texteLisible: true, faits: [{ cle: 'offre', label: 'Offre / prix', etat: 'invalidee', source: 'ancienne source', validateur: 'Camille', date: '2026-09-01', version: 'v·ffffffff' }] });
    const h = html({ qualite: q, initial: { qualite: true }, onVerifierFait: () => {} });
    expect(h).toContain('validation caduque');
    expect(h, 'la caducité n’explique pas qu’il faut re-vérifier').toContain('Le contenu a changé depuis');
    expect(h).toContain('Re-vérifier');
  });
});

describe('carte créative · N06 · Ouvrir neutre + titres homonymes distingués', () => {
  it('« Ouvrir » en variante neutre ne porte pas l’accent (ne rivalise pas avec le visuel)', () => {
    const neutre = html({ actionPrincipale: { cle: 'ouvrir', label: 'Ouvrir', icon: 'frame', onClick: () => {}, variant: 'neutre' } });
    expect(neutre, 'l’action « Ouvrir » garde un fond accentué').not.toContain('var(--grad-accent)');
    expect(neutre, 'l’action neutre n’a pas de cadre sobre').toContain('var(--line-2)');
    // Par défaut (sans variante), l’action principale reste accentuée.
    const accent = html({ actionPrincipale: { cle: 'creer', label: 'Créer', onClick: () => {} } });
    expect(accent).toContain('var(--grad-accent)');
  });

  it('un sous-titre distingue deux titres homonymes', () => {
    const h = html({ titre: 'Ma piscine', sousTitre: '17/09 · 14:32' });
    expect(h, 'le distingueur des homonymes n’apparaît pas').toContain('17/09 · 14:32');
  });

  it('sans homonyme, aucun sous-titre n’est ajouté', () => {
    const h = html({ titre: 'Ma piscine' });
    expect(h).not.toContain('17/09');
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
