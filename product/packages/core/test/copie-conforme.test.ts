import { describe, expect, it } from 'vitest';
import {
  chainesImposees, ressemblance, SEUIL_DEFORMEE, verifieCopie,
} from '../src/copie-conforme';

/**
 * Ce que le modèle d'images a réellement écrit.
 *
 * Le partage tenu ici : au modèle la perception (« quelles lettres »), au code
 * le jugement (« sont-ce les nôtres »). Ces tests exercent le jugement seul ·
 * les lignes « lues » sont fournies à la main, aucune image n'est décodée.
 */

const ACCROCHE = 'Réveillez l’éclat de votre peau';
const imposees = [
  { role: 'accroche', texte: ACCROCHE },
  { role: 'bouton', texte: 'Découvrir' },
];

describe('ce qui compte comme la même phrase', () => {
  it('le seuil sépare bien les deux familles mesurées', () => {
    // Les valeurs qui justifient le seuil sont dans le module · si l'une d'elles
    // dérive, le seuil qu'elle justifie n'a plus de raison d'être. On les
    // remesure ici plutôt que de les croire sur parole.
    const memePhrase = [
      'Réveillez l’éclat de votre pea',        // une lettre en moins
      'Reveillez l’eclat de votre peau',       // accents perdus
      'Réveillez la beauté de votre peau',     // un mot remplacé
      'Ravivez l’éclat de ta peau',            // deux mots changés
      'Réveillez l’éclat',                     // tronquée
    ];
    const autrePhrase = [
      'Le soin qui change tout',
      'Awaken your skin’s radiance',
    ];
    const plancher = Math.min(...memePhrase.map((s) => ressemblance(ACCROCHE, s)));
    const plafond = Math.max(...autrePhrase.map((s) => ressemblance(ACCROCHE, s)));
    expect(plafond, 'une phrase sans rapport passe au-dessus du seuil').toBeLessThan(SEUIL_DEFORMEE);
    expect(plancher, 'une variante de notre accroche tombe sous le seuil').toBeGreaterThan(SEUIL_DEFORMEE);
  });
});

describe('le verdict sur une publicité entière', () => {
  it('se tait quand tout est exact', () => {
    // Une copie irréprochable n'a pas besoin d'un encadré vert · le silence est
    // une réponse, et un bandeau permanent apprend à ne plus lire les bandeaux.
    const v = verifieCopie(imposees, ['Réveillez l’éclat de votre peau', 'Découvrir', 'KLOREA']);
    expect(v.lignes.every((l) => l.etat === 'exacte')).toBe(true);
    expect(v.resume).toBe('');
    expect(v.grave).toBe(false);
    expect(v.fidelite).toBe(1);
  });

  it('ignore la casse et les apostrophes typographiques', () => {
    // Une accroche rendue en capitales est une décision de mise en page · la
    // compter comme une faute ferait crier au loup sur la moitié des créas.
    const v = verifieCopie(imposees, ['RÉVEILLEZ L\'ÉCLAT DE VOTRE PEAU', 'découvrir']);
    expect(v.lignes.map((l) => l.etat)).toEqual(['exacte', 'exacte']);
  });

  it('nomme les accents perdus sans les confondre avec une réécriture', () => {
    // C'est la faute la plus fréquente et la plus visible en français · elle
    // mérite son propre nom, sinon elle se noie dans « réécrite » et on ne sait
    // pas que c'est CE défaut-là que le moteur produit.
    const v = verifieCopie(imposees, ['Reveillez l’eclat de votre peau', 'Découvrir']);
    expect(v.lignes[0]!.etat).toBe('accents');
    expect(v.resume).toContain('accents perdus');
    // Les accents ne condamnent pas la pub · elle dit encore ce qu'on voulait.
    expect(v.grave).toBe(false);
  });

  it('déclare grave une accroche réécrite', () => {
    // C'est le seul texte éliminatoire · un bouton réécrit se corrige, une
    // accroche inventée fait de la publicité une AUTRE publicité.
    const v = verifieCopie(imposees, ['Réveillez la beauté de votre peau', 'Découvrir']);
    expect(v.lignes[0]!.etat).toBe('deformee');
    expect(v.grave).toBe(true);
    expect(v.resume).toContain('réécrite');
  });

  it('déclare grave une accroche absente', () => {
    const v = verifieCopie(imposees, ['Le soin qui change tout', 'Découvrir']);
    expect(v.lignes[0]!.etat).toBe('absente');
    expect(v.lignes[0]!.lu).toBeNull();
    expect(v.grave).toBe(true);
  });

  it('un bouton fautif ne condamne pas la publicité', () => {
    const v = verifieCopie(imposees, ['Réveillez l’éclat de votre peau', 'Acheter maintenant']);
    expect(v.lignes[1]!.etat).toBe('absente');
    expect(v.grave, 'un bouton réécrit ne devrait pas condamner la créa').toBe(false);
    expect(v.fidelite).toBe(0.5);
  });

  it('ne reproche jamais le texte EN PLUS', () => {
    // L'étiquette du produit porte légitimement des mots · c'est même ce qu'on
    // exige d'elle. Compter les lignes en trop transformerait la fidélité du
    // packaging, qui est notre exigence n° 1, en défaut.
    const v = verifieCopie(imposees, [
      'Réveillez l’éclat de votre peau', 'Découvrir',
      'KLOREA', 'Sérum visage · 30 ml', 'Bio · Fabriqué en France',
    ]);
    expect(v.resume).toBe('');
    expect(v.fidelite).toBe(1);
  });

  it('une même ligne lue ne satisfait pas deux consignes', () => {
    // Sans ça, une publicité amputée passerait pour complète · une seule ligne
    // « Découvrir » couvrirait à la fois le bouton et la pastille.
    const v = verifieCopie(
      [{ role: 'bouton', texte: 'Découvrir' }, { role: 'pastille', texte: 'Découvrir' }],
      ['Découvrir'],
    );
    expect(v.lignes[0]!.etat).toBe('exacte');
    expect(v.lignes[1]!.etat, 'la seconde consigne a réutilisé la même ligne').toBe('absente');
  });

  it('sans rien à vérifier, il n’invente pas de verdict', () => {
    const v = verifieCopie([], ['KLOREA']);
    expect(v.fidelite).toBeNull();
    expect(v.grave).toBe(false);
    expect(v.resume).toBe('');
  });

  it('une image sans aucun texte lu déclare tout absent', () => {
    // Le cas qui compte le plus : le modèle a rendu une belle photo, sans un
    // mot. C'est un échec total du mode « entière », et il doit se voir.
    const v = verifieCopie(imposees, []);
    expect(v.lignes.map((l) => l.etat)).toEqual(['absente', 'absente']);
    expect(v.grave).toBe(true);
    expect(v.fidelite).toBe(0);
  });
});

describe('les chaînes qu’on impose', () => {
  it('laisse tomber les vides et nomme chaque rôle', () => {
    const c = chainesImposees({
      kicker: '', headline: 'Accroche', subhead: null,
      benefits: ['Un', 'Deux'], cta: 'Voir', badge: '  ',
    });
    expect(c.map((x) => x.role)).toEqual(['accroche', 'bénéfice 1', 'bénéfice 2', 'bouton']);
  });

  it('ne demande jamais plus de trois bénéfices', () => {
    // La consigne envoyée au modèle n'en donne que trois · en vérifier quatre
    // reprocherait l'absence d'un texte qu'on n'a pas demandé.
    const c = chainesImposees({ headline: 'A', benefits: ['1', '2', '3', '4'] });
    expect(c.filter((x) => x.role.startsWith('bénéfice'))).toHaveLength(3);
  });
});
