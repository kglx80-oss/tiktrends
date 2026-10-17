// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { EtatNouveauProjet, EtatProchainesIterations } from '@tiktrends/core';
import type { CarteProjet as Carte } from '../lib/studios/sources/projet';

/**
 * UX V5 · Studios (liste des projets) · le HTML RENDU de la zone liste porte la
 * présentation du prototype (image 5.webp) · ON LIT CE QU'ON VOIT, jamais « une
 * fonction est appelée ».
 *
 * Alignement vérifié (vraies données uniquement) :
 *  - onglets « Projets » (actif) · « Prompts conseillés » DÉSACTIVÉ (à créer,
 *    pas simulé) ;
 *  - rangée de filtres par ÉTAPE réelle, avec compteurs réels, + recherche ;
 *  - carte projet : bandeau de type, pastille de version réelle, barre d'étapes ;
 *  - carte « Nouveau projet » (raccourci N) en fin de grille ;
 *  - bloc « Prochaines itérations » = le composant de l'Accueil, réutilisé tel
 *    quel (verdict Adsmap réel, Garde/Change, Itérer).
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }) }));

import { OngletsStudios } from '../components/studios/projet/OngletsStudios';
import { ListeProjets } from '../components/studios/projet/ListeProjets';
import { ProchainesIterations } from '../components/accueil/ProchainesIterations';

function carte(p: Partial<Carte> & Pick<Carte, 'id' | 'etape' | 'libelleEtape'>): Carte {
  return {
    id: p.id, title: p.title ?? 'Projet', kind: p.kind ?? 'ads', libelleType: p.libelleType ?? 'Pub statique',
    brandId: p.brandId ?? 'b1', marque: p.marque ?? 'Neva', etape: p.etape, libelleEtape: p.libelleEtape,
    manques: p.manques ?? [], versionN: p.versionN ?? 1, sources: p.sources ?? 2, updatedAt: p.updatedAt ?? '2026-10-01T00:00:00.000Z',
  };
}

const cartes: Carte[] = [
  carte({ id: 'p1', title: 'Le plaisir du premier plongeon', etape: 'production', libelleEtape: 'En production', versionN: 3 }),
  carte({ id: 'p2', title: 'Collection été', etape: 'brief_a_completer', libelleEtape: 'Brief à compléter', versionN: 1 }),
  carte({ id: 'p3', title: 'La piscine au quotidien', etape: 'brief_pret', libelleEtape: 'Brief prêt', versionN: 2 }),
];

const nouveau: EtatNouveauProjet = { etat: 'pret', marque: { id: 'b1', nom: 'Neva' }, libelle: 'Nouveau projet' };

const iterations: EtatProchainesIterations = {
  etat: 'liste', total: 1, boucle: '/resultats', autres: '/suites',
  cartes: [{
    adId: 'ad1', titre: 'Prêts pour le grand plongeon ?', verdict: 'Gagnante', lot: 'Lot #1 conclu', apprentissageValide: true,
    mesure: { valeur: '27 %', libelle: 'taux d’accroche', periode: 'juillet', source: 'Meta' },
    garde: 'Accroche question', change: 'Format 4:5 → 9:16', raison: 'Le 9:16 n’a jamais été testé sur TikTok pour Neva.',
    iterer: '/studio/projets/nouveau?iter=ad1',
  }],
};

describe('Studios · liste des projets · rendu V5', () => {
  it('onglets : Projets actif, Prompts conseillés désactivé (à créer, pas simulé)', () => {
    const html = renderToStaticMarkup(<OngletsStudios />);
    expect(html).toContain('data-onglet="projets"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('data-onglet="prompts"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('Prompts conseillés');
    expect(html).toContain('Bientôt');
  });

  it('rangée de filtres par étape RÉELLE avec compteurs réels + recherche', () => {
    const html = renderToStaticMarkup(<ListeProjets cartes={cartes} nouveau={nouveau} />);
    // « Tous » compte les 3 ; chaque étape réelle a son chip.
    expect(html).toMatch(/data-filtre="tous"[\s\S]*?data-compte[^>]*>3</);
    expect(html).toContain('data-filtre="brief_a_completer"');
    expect(html).toContain('data-filtre="brief_pret"');
    expect(html).toContain('data-filtre="production"');
    // Pas la taxonomie fictive du proto.
    expect(html).not.toContain('En revue');
    expect(html).not.toContain('Brouillons');
    // La recherche.
    expect(html).toContain('data-recherche-projet');
  });

  it('cartes : bandeau type, pastille de version réelle, barre d’étapes', () => {
    const html = renderToStaticMarkup(<ListeProjets cartes={cartes} nouveau={nouveau} />);
    expect(html).toContain('data-projet="p1"');
    expect(html).toContain('data-version'); // pastille version réelle
    expect(html).toContain('>V3<');
    expect(html).toContain('data-barre-etape="production"');
    expect(html).toContain('data-barre-etape="brief_a_completer"');
  });

  it('carte « Nouveau projet » (raccourci N) en fin de grille', () => {
    const html = renderToStaticMarkup(<ListeProjets cartes={cartes} nouveau={nouveau} />);
    expect(html).toContain('data-nouveau-projet="carte"');
    expect(html).toContain('aria-keyshortcuts="N"');
    expect(html).toContain('Nouveau projet');
  });

  it('bloc « Prochaines itérations » réutilisé · verdict Adsmap réel, Garde/Change, Itérer', () => {
    const html = renderToStaticMarkup(<ProchainesIterations etat={iterations} />);
    expect(html).toContain('data-accueil-iterations');
    expect(html).toContain('Prochaines itérations');
    expect(html).toContain('Gagnante');
    expect(html).toContain('Accroche question'); // Garde
    expect(html).toContain('Format 4:5 → 9:16'); // Change
    expect(html).toContain('href="/studio/projets/nouveau?iter=ad1"'); // Itérer
    expect(html).toContain('Itérer sur une autre créative');
  });
});
