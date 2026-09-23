import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { RailFicheCrea, type DeclinaisonRow } from '../app/(app)/studio/ads/RailFicheCrea';

/**
 * La fiche créa · le rail d'actions est rangé en QUATRE rubriques nommées
 * (Itérer · Modifier · Contrôler · Exporter), dans cet ordre, avec l'identité
 * de la créa (gabarit, verdict, lignée, accroche) en tête et « Archiver » en
 * pied. On empilait dix actions à plat · rien ne disait « où j'itère », « où je
 * contrôle », « où j'exporte ».
 *
 * Le rail est PRÉSENTIEL (RailFicheCrea) · on le REND et on lit le HTML, la
 * seule vérification que le défaut « ordre / hiérarchie » ne sait pas
 * contourner. La primauté de l'aperçu (média flexible, rail à largeur fixe)
 * vit dans la modale d'AdsStudio · non rendable · éprouvée par adoption source.
 */

const declinaisons: DeclinaisonRow[] = [
  { key: 'mise_en_page', label: 'Mise en page', prixLabel: 'gratuit', contrat: 'Change la mise en page · garde le texte', disabled: false, busy: false, autreBusy: false, title: '', onClick: () => {} },
  { key: 'accroche', label: 'Accroche', prixLabel: '1 cr.', contrat: 'Change l’accroche · garde la scène', disabled: false, busy: false, autreBusy: false, title: '', onClick: () => {} },
];

function rendu(over: Partial<Parameters<typeof RailFicheCrea>[0]> = {}): string {
  return renderToStaticMarkup(
    <RailFicheCrea
      onClose={() => {}}
      editText={false}
      templateLabel="Bénéfices"
      verdict={<span>en mesure</span>}
      declinaison={null}
      lignee={null}
      headline="Une accroche témoin qui doit primer"
      declinaisons={declinaisons}
      onVarier={() => {}}
      varierBusy={false}
      varierDisabled={false}
      varierCredits={9}
      onEditerTexte={() => {}}
      score={<button type="button">Score Jarvis · 2 cr.</button>}
      pertinence={<span>note</span>}
      onCopierLien={() => {}}
      lienCopie={false}
      telechargementHref="#"
      telechargementLabel="Télécharger"
      noteFormat={undefined}
      onArchiver={() => {}}
      {...over}
    />,
  );
}

describe('Fiche créa · rail rangé en quatre rubriques nommées', () => {
  it('les quatre rubriques sortent dans le bon ordre · Itérer, Modifier, Contrôler, Exporter', () => {
    const html = rendu();
    const iterer = html.indexOf('Itérer');
    const modifier = html.indexOf('Modifier');
    const controler = html.indexOf('Contrôler');
    const exporter = html.indexOf('Exporter');
    expect(iterer, 'rubrique Itérer absente').toBeGreaterThan(-1);
    expect(modifier, 'rubrique Modifier absente').toBeGreaterThan(-1);
    expect(controler, 'rubrique Contrôler absente').toBeGreaterThan(-1);
    expect(exporter, 'rubrique Exporter absente').toBeGreaterThan(-1);
    expect(iterer, 'Itérer doit précéder Modifier').toBeLessThan(modifier);
    expect(modifier, 'Modifier doit précéder Contrôler').toBeLessThan(controler);
    expect(controler, 'Contrôler doit précéder Exporter').toBeLessThan(exporter);
  });

  it('l’accroche (identité) est EN TÊTE · avant la première rubrique', () => {
    const html = rendu();
    expect(html.indexOf('Une accroche témoin qui doit primer')).toBeLessThan(html.indexOf('Itérer'));
  });

  it('chaque action reste présente et dans sa rubrique', () => {
    const html = rendu();
    // Itérer · les déclinaisons puis Varier
    expect(html).toContain('Mise en page');
    expect(html).toContain('Varier (3)');
    // Modifier · éditer le texte
    expect(html).toContain('Éditer le texte');
    // Contrôler · score + pertinence
    expect(html).toContain('Score Jarvis');
    expect(html).toContain('Pertinence · entraîne Jarvis');
    // Exporter · lien + téléchargement
    expect(html).toContain('Copier le lien');
    expect(html).toContain('Télécharger');
    // Archiver en pied
    expect(html).toContain('Archiver');
  });

  it('« Archiver » est en PIED · après la rubrique Exporter', () => {
    const html = rendu();
    expect(html.indexOf('Exporter')).toBeLessThan(html.lastIndexOf('Archiver'));
  });

  it('la croix de fermeture atteint la cible tactile (40 px carrés)', () => {
    const html = rendu();
    expect(html).toContain('aria-label="Fermer"');
    expect(html, 'la croix doit faire 40 px de large').toContain('width:40px');
    expect(html, 'la croix doit faire 40 px de haut').toContain('height:40px');
  });

  it('en mode « Éditer le texte », le rail bascule sur les champs', () => {
    const html = rendu({ editText: true, textPret: true, champsTexte: <span>champs de texte</span> });
    expect(html).toContain('champs de texte');
    expect(html).toContain('Appliquer les textes');
    // Le rail d'actions n'est plus monté · pas de double affichage
    expect(html).not.toContain('Itérer');
  });
});

describe('Fiche créa · l’aperçu domine le rail (adoption source, modale non rendable)', () => {
  const studio = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');
  const rail = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/RailFicheCrea.tsx'), 'utf8');

  it('la zone média est FLEXIBLE (flex: 1) · elle prend la place', () => {
    // La colonne aperçu · fond sombre + flex: 1 · c'est elle qui s'étire.
    const i = studio.indexOf("background: '#0c080e'");
    expect(i, 'colonne média introuvable').toBeGreaterThan(-1);
    const bloc = studio.slice(i - 200, i);
    expect(bloc, 'la zone média ne s’étire pas (flex: 1 manquant)').toContain('flex: 1');
  });

  it('le rail est à LARGEUR FIXE et ne grandit pas · il n’écrase pas l’aperçu', () => {
    expect(rail, 'le rail doit être borné en largeur').toContain('width: 236');
    expect(rail, 'le rail ne doit pas grandir').toContain('flexShrink: 0');
  });
});
