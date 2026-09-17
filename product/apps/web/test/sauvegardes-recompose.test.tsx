import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { BarreOnglets } from '../components/SavedTabs';

/**
 * CDC v6 · #3 · Sauvegardes recomposée autour de son usage principal. On vérifie
 * le RÉSULTAT rendu de la barre d'onglets, et par adoption de la source la
 * réorganisation de la page (les créas d'abord, la découverte en secondaire).
 */

describe('la barre d’onglets de Sauvegardes', () => {
  const html = (actif: 'creations' | 'marques' | 'nouveautes') => renderToStaticMarkup(
    <BarreOnglets actif={actif} onChange={() => {}} compteurs={{ creations: 12, marques: 3, nouveautes: 2 }} />,
  );

  it('nomme les trois espaces et porte leurs compteurs', () => {
    const h = html('creations');
    for (const label of ['Créations', 'Marques suivies', 'Nouveautés']) expect(h).toContain(label);
    expect(h).toContain('>12<'); // compteur créations
    expect(h).toContain('>3<');
    expect(h).toContain('>2<');
  });

  it('l’onglet actif est annoncé (role tab + aria-selected)', () => {
    // Le clavier et le lecteur d'écran doivent savoir où l'on est.
    expect(html('creations')).toContain('role="tab"');
    expect(html('creations')).toMatch(/id="onglet-creations"[^>]*aria-selected="true"/);
    // Un autre onglet actif déplace la sélection · le garde ne constate pas un true figé.
    expect(html('nouveautes')).toMatch(/id="onglet-nouveautes"[^>]*aria-selected="true"/);
    expect(html('nouveautes')).toMatch(/id="onglet-creations"[^>]*aria-selected="false"/);
  });
});

describe('la page Sauvegardes remet l’usage principal au premier plan', () => {
  const page = readFileSync(join(process.cwd(), 'app/(app)/saved/page.tsx'), 'utf8');

  it('organise la page en onglets · les créas gardées ne sont plus enterrées', () => {
    expect(page, 'la page n’utilise pas les onglets').toContain('<SavedTabs');
    // Les créas gardées sont l'onglet Créations.
    expect(page).toMatch(/creations=\{<SavedBoards/);
    // La découverte et l'analyse passent en SECONDAIRE (prop explorer), plus
    // empilées avant les créas.
    expect(page, 'la découverte n’est pas reléguée en secondaire').toMatch(/explorer=\{[^}]*DecouverteSection/s);
    expect(page, 'l’analyse de catégorie n’est pas reléguée en secondaire').toMatch(/explorer=\{[^}]*GrammaireCategorie/s);
  });

  it('rouvre le même onglet au retour · l’onglet vient de l’URL', () => {
    expect(page).toMatch(/initial=\{ongletValide\(sp\.onglet\)\}/);
  });
});

describe('la recherche et le vocabulaire des créas gardées', () => {
  const boards = readFileSync(join(process.cwd(), 'components/SavedBoards.tsx'), 'utf8');
  const grammaire = readFileSync(join(process.cwd(), 'components/GrammaireCategorie.tsx'), 'utf8');

  it('les créas gardées se cherchent · champ nommé, filtre au noyau', () => {
    expect(boards).toContain('aria-label="Rechercher dans les créas gardées"');
    expect(boards, 'le filtre n’est pas la règle pure du noyau').toContain('correspondSauvegarde(');
  });

  it('le texte obscur « ce que tes entières vont suivre » a disparu', () => {
    expect(grammaire, 'le texte obscur est encore là').not.toContain('entières vont suivre');
  });
});
