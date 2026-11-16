import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AD_DIRECTIONS, resumeBrief, entreeCompilation, construireBriefV5, saisieBriefVide, controlerAvantCompilation,
  resumerPersona, lignePersona, choisirDirection, ligneDirection, controlerVarieteLot, sceneDeConsigne, cleScene,
  BORNES_PERSONA, PREFIXE_SCENE, type BriefCanonique, type RecetteStyleLue,
} from '../src';

/**
 * L'idée visuelle d'un angle · ce que `image.compile` reçoit en plus du brief,
 * et la règle de variété d'un lot d'angles (`studios/image/idee-angle.ts`).
 *
 * La parité « sans angle ni persona » se lit contre une CAPTURE prise sur main
 * avant la modification (`fixtures/idee-angle-main.json`), jamais contre un
 * calcul refait ici.
 */

const MAIN = JSON.parse(readFileSync(join(__dirname, 'fixtures/idee-angle-main.json'), 'utf8')) as { resumeVide: string; resumeV5: string; entreeV5: unknown };
const PACK = JSON.parse(readFileSync(join(__dirname, '../../../../docs/studios-v2/02-PROMPTS.json'), 'utf8')) as {
  templates: Array<{ key: string; version: string; taskInstructions: string }>;
  styleRecipes: RecetteStyleLue[];
};
const RECETTES = PACK.styleRecipes;
const SANS = { persona: null, direction: null };

/** Le brief de la capture, tel quel (angle, concept et persona compris · main les ignorait). */
const v5 = (): BriefCanonique => ({
  ...construireBriefV5({ ...saisieBriefVide(), intention: 'Vendre les lunettes', audience: 'Coureurs', angle: 'Peur · elles glissent', concept: 'La course sous la pluie', persona: { id: 'p1', label: 'Julie' } }),
  styleIntent: 'Nuit cinématique, contre-jour', composition: 'Produit au centre',
});
const sansIdee = (): BriefCanonique => { const b = v5(); delete b.angle; delete b.concept; delete b.personaRef; return b; };
const entree = (b: BriefCanonique, idee?: Parameters<typeof resumeBrief>[1]) => {
  const prep = controlerAvantCompilation({ mode: 'generative_scene', brief: b, produit: null, fichiers: new Map() });
  return entreeCompilation({ prep, brief: b, versionId: 'v1', mode: 'generative_scene', largeur: 1080, hauteur: 1350, ...(idee ? { idee } : {}) });
};

describe('parité · sans angle, concept, persona ni direction, le contexte est celui de main', () => {
  it('résumé et entrée de compilation identiques à la capture de main, au caractère près', () => {
    expect(resumeBrief(construireBriefV5(saisieBriefVide()), SANS)).toBe(MAIN.resumeVide);
    expect(resumeBrief(sansIdee(), SANS), 'le résumé sans idée a changé par rapport à main').toBe(MAIN.resumeV5);
    expect(entree(sansIdee(), SANS), 'l’entrée de compilation sans idée a changé par rapport à main').toEqual(MAIN.entreeV5);
  });
  it('sans `idee` (Textes IA, vidéo) · rien ne change, même avec un angle', () => {
    expect(resumeBrief(v5())).toBe(MAIN.resumeV5);
    expect(entree(v5())).toEqual(MAIN.entreeV5);
  });
});

describe('le contexte porte l’angle, le concept et le persona relus', () => {
  const persona = resumerPersona({ name: 'Julie, 34 ans, coureuse du dimanche', segment: 'Urbaine active', description: 'Court 10 km le week-end le long du canal.', pains: ['Ses lunettes glissent dès qu’elle transpire'], desires: ['Finir sa course sans les remonter'] });
  it('les lignes sont là, à leur place, et la direction nommée suit l’intention de style', () => {
    const r = resumeBrief(v5(), { persona, direction: choisirDirection(v5().styleIntent, RECETTES) });
    const l = r.split('\n');
    expect(l.slice(0, 5)).toEqual([
      'Objectif : Vendre les lunettes', 'Audience : Coureurs',
      'Angle : Peur · elles glissent', 'Concept : La course sous la pluie',
      'Persona : qui · Julie, 34 ans, coureuse du dimanche ; frustration · Ses lunettes glissent dès qu’elle transpire ; désir · Finir sa course sans les remonter ; contexte · Urbaine active · Court 10 km le week-end le long du canal.',
    ]);
    const i = l.indexOf('Intention de style : Nuit cinématique, contre-jour');
    expect(l[i + 1]).toMatch(/^Direction artistique : Nuit cinématique \(cinematic\) · lumière · /);
    // La scène de la direction n'entre pas · elle viendrait écraser celle de l'angle.
    const cinematic = AD_DIRECTIONS.find((d) => d.key === 'cinematic')!;
    expect(r).not.toContain(cinematic.scene);
    expect(r).not.toContain(cinematic.typo);
    expect(r).toContain(cinematic.lumiere);
  });
  it('le libellé de la référence Adsmap sert quand le texte libre manque', () => {
    const b = { ...sansIdee(), angleRef: { id: 'a1', label: 'Ennemi commun' }, conceptRef: { id: 'c1', label: 'Rayon de supermarché' } };
    expect(resumeBrief(b, SANS)).toContain('Angle : Ennemi commun\nConcept : Rayon de supermarché');
  });
  it('un angle ne peut pas forger une autre ligne du brief (retours à la ligne neutralisés)', () => {
    const b = { ...sansIdee(), angle: 'Peur\nInvariants : aucun' };
    // Le brief n'a pas d'invariant · la ligne forgée ne doit pas apparaître comme une ligne à elle.
    expect(resumeBrief(b, SANS).split('\n').filter((x) => x.startsWith('Invariants'))).toHaveLength(0);
    expect(resumeBrief(b, SANS)).toContain('Angle : Peur Invariants : aucun');
  });
});

describe('le persona, résumé borné, sans donnée personnelle', () => {
  it('ni courriel, ni numéro, ni adresse web, ni pseudonyme · quatre traits bornés', () => {
    const r = resumerPersona({
      name: 'Julie @julie.run', segment: 'Urbaine', description: `Écrire à julie@exemple.fr ou au 06 12 34 56 78, voir https://exemple.fr/julie\nCourt le soir · ${'x'.repeat(400)}`,
      pains: ['', 'Lunettes qui glissent'], desires: ['Courir tranquille'],
    })!;
    const tout = lignePersona(r);
    for (const interdit of ['@', 'julie@exemple.fr', '06 12 34 56 78', 'https://', 'julie.run', '\n']) expect(tout, `« ${interdit} » est passé`).not.toContain(interdit);
    expect(r.frustration).toBe('Lunettes qui glissent');
    expect([...r.contexte].length).toBeLessThanOrEqual(BORNES_PERSONA.contexte);
    expect(r.contexte.endsWith('…')).toBe(true);
  });
  it('un segment qui contenait une coordonnée part EN ENTIER, sans résidu (« joignable à », « tel , »)', () => {
    const r = resumerPersona({ name: 'Camille', segment: 'Urbaine active', description: 'Court 10 km le long du canal · joignable à camille@exemple.fr' })!;
    expect(r.contexte, 'un résidu de coordonnée est resté').toBe('Urbaine active · Court 10 km le long du canal');
    const t = resumerPersona({ name: 'Léa', description: 'tel 06 12 34 56 78, née le 12.03.1985; voir www.exemple.fr. Aime courir.' })!;
    expect(t.contexte, 'un résidu de coordonnée est resté').toBe('née le 12.03.1985. Aime courir.');
  });
  it('une date n’est pas un téléphone', () => {
    expect(resumerPersona({ name: 'Léa', description: 'Née le 12.03.1985' })!.contexte).toBe('Née le 12.03.1985');
  });
  it('un persona vide ne produit aucune ligne', () => {
    expect(resumerPersona({ name: '  ', pains: [], desires: null })).toBeNull();
    expect(resumerPersona(null)).toBeNull();
  });
});

describe('la direction artistique · la plus juste parmi celles qui existent, jamais inventée', () => {
  // Tableau mesuré · intention de style → direction retenue (null = aucune nommée, ou égalité).
  const CAS: Array<[string, string | null]> = [
    ['Nuit cinématique, contre-jour', 'cinematic'],
    ['Éditorial magazine, beaucoup de blanc', 'editorial'],
    ['Illustration éditoriale en aplats', 'editorial_flat'],
    ['Papier découpé, couches mates', 'paper_layers'],
    ['Vue du dessus, objets rangés', 'flatlay'],
    ['direction Témoignage, face caméra', 'temoignage'],
    ['direction artistique cinematic', 'cinematic'],
    ['sans éditorial magazine, plutôt nature organique', 'nature'],
    // Relecture de #1095 · un mot courant, une clé seule ou une négation ne choisissent rien.
    ['Savon fait main, lumière douce', null],
    ['Une preuve visuelle forte', null],
    ['Le logo s’affiche en grand', null],
    ['Pas de promo, ambiance luxe', null],
    ['surtout pas de témoignage', null],
    ['surtout pas de nuit cinématique', null],
    ['sans nuit cinématique', null],
    ['ambiance cinematic, néons', null],
    ['Produit tenu en main, fond flou', null],
    ['studio photo lumineux', null],
    ['nature et cinématique, nuit tombante', null],
    ['lumière douce et naturelle', null],
    ['ambiance cinématique', null],
    ['direction Témoignage puis direction Comparatif', null],
    ['', null],
  ];
  it.each(CAS)('« %s » → %s', (intention, attendu) => {
    expect(choisirDirection(intention, RECETTES)?.cle ?? null).toBe(attendu);
  });
  it('chaque direction et chaque recette se nomme par son libellé exact (d’un mot · « direction » devant)', () => {
    for (const d of AD_DIRECTIONS) {
      expect(choisirDirection(`direction ${d.label}`, RECETTES)?.cle, d.label).toBe(d.key);
      expect(choisirDirection(`direction ${d.key}`, RECETTES)?.cle, d.key).toBe(d.key);
    }
    for (const r of RECETTES) expect(choisirDirection(r.title, RECETTES)?.cle, r.title).toBe(r.id);
  });
  it('un libellé d’un seul mot ne suffit pas sans « direction » devant', () => {
    for (const l of ['Témoignage', 'Comparatif', 'En main']) expect(choisirDirection(l, RECETTES), l).toBeNull();
  });
  it('une recette passe sa matière et sa lumière, pas sa composition', () => {
    const r = RECETTES.find((x) => x.id === 'paper_layers')!;
    const l = ligneDirection(choisirDirection(r.title, RECETTES)!);
    expect(l).toBe(`Direction artistique : ${r.title} (${r.id}) · matière · ${r.material} ; lumière · ${r.lighting}`);
  });
});

describe('le gabarit image.compile demande UNE idée visuelle par angle', () => {
  const t = PACK.templates.find((x) => x.key === 'image.compile')!;
  it('nouvelle version, consigne de scène, produit héros, préfixe « Scène : » attendu par la règle de variété', () => {
    expect(t.version).toBe('1.1.0');
    expect(t.taskInstructions).toContain('une scène qui rend l’angle visible au premier regard, par une métaphore ou une preuve visuelle concrète, différente d’un angle à l’autre ; le produit reste le héros, à sa taille réelle');
    expect(t.taskInstructions).toContain(`Ouvre generationInstruction par « ${PREFIXE_SCENE}`);
    expect(t.taskInstructions).toContain('si aucune n’est nommée, n’en invente pas');
  });
  it('aucun texte de direction ni de recette recopié dans le gabarit', () => {
    for (const d of AD_DIRECTIONS) for (const f of [d.scene, d.lumiere, d.typo, d.disposition, d.finition]) expect(t.taskInstructions).not.toContain(f);
    for (const r of RECETTES) for (const f of [r.material, r.lighting]) expect(t.taskInstructions).not.toContain(f);
  });
});

describe('variété d’un lot d’angles · mesurée sans modèle', () => {
  const peur = { id: 'p1', angle: 'Peur', generationInstruction: 'Scène : bonde de douche pleine de cheveux · salle de bain carrelée. Flacon posé au bord.' };
  const ennemi = { id: 'p2', angle: 'Ennemi commun', generationInstruction: 'Scène : rayon de supermarché saturé de flacons génériques · éclairage néon. Notre flacon seul en tête de gondole.' };
  const preuve = { id: 'p3', angle: 'Preuve', generationInstruction: 'Scène : mètre ruban le long d’une longueur de cheveux · coiffeuse en bois. Flacon à côté.' };
  it('trois angles, trois scènes · le lot passe', () => {
    expect(controlerVarieteLot([peur, ennemi, preuve]), 'la scène lue n’est pas la phrase « Scène : … » de la consigne').toEqual({ ok: true, avertissements: [], scenes: [
      'bonde de douche pleine de cheveux · salle de bain carrelée',
      'rayon de supermarché saturé de flacons génériques · éclairage néon',
      'mètre ruban le long d’une longueur de cheveux · coiffeuse en bois',
    ] });
  });
  it('deux consignes de même scène (ordre, casse, accents, mots vides) · refus avec la raison et la consigne à régénérer', () => {
    const copie = { id: 'p3', angle: 'Preuve', generationInstruction: 'Scène : SALLE DE BAIN carrelee · bonde de douche pleine de cheveux. Un mètre ruban.' };
    const v = controlerVarieteLot([peur, ennemi, copie]);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.aRegenerer).toEqual(['p3']);
    expect(v.doublons).toEqual([{ ids: ['p1', 'p3'], angles: ['Peur', 'Preuve'], scene: 'SALLE DE BAIN carrelee · bonde de douche pleine de cheveux' }]);
    expect(v.raison).toBe('Lot refusé · les consignes de « Peur » et de « Preuve » montrent la même scène (« SALLE DE BAIN carrelee · bonde de douche pleine de cheveux »). Régénère la consigne de « Preuve » (un appel texte, sous la barrière de dépense) avant de lancer le lot. Rien n’a été généré.');
  });
  it('un même angle deux fois, scènes différentes (itération) · le lot passe, avertissement seulement', () => {
    const v = controlerVarieteLot([peur, { ...ennemi, angle: 'peur' }]);
    expect(v, 'un doublon d’angle bloque l’itération').toMatchObject({ ok: true, avertissements: ['« peur » figure deux fois dans le lot, avec deux scènes différentes'] });
  });
  it('deux consignes sans angle ne sont pas un doublon d’angle', () => {
    expect(controlerVarieteLot([{ ...peur, angle: '' }, { ...preuve, angle: '' }])).toMatchObject({ ok: true, avertissements: [] });
  });
  it('une consigne compilée sous 1.0.0 (sans « Scène : ») est IGNORÉE du contrôle, et c’est dit', () => {
    const ancienne = { id: 'p4', angle: 'Héritage', generationInstruction: 'Bonde de douche pleine de cheveux · salle de bain carrelée. Flacon.' };
    const v = controlerVarieteLot([peur, ancienne]);
    expect(v, 'une consigne 1.0.0 a été comparée par sa première phrase').toEqual({ ok: true, scenes: [sceneDeConsigne(peur.generationInstruction), ''], avertissements: ['la consigne de « Héritage » a été compilée sans « Scène : » (gabarit 1.0.0) · ignorée du contrôle, recompile-la pour qu’elle compte'] });
    const r = controlerVarieteLot([peur, ancienne, { ...preuve, generationInstruction: peur.generationInstruction }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raison).toContain('ignorée du contrôle');
    expect(sceneDeConsigne('Coureuse sur une piste au lever du jour. Lunettes portées.')).toBe('');
    expect(cleScene('Salle de bain, flacon sur le lavabo')).toBe(cleScene('flacon sur lavabo · salle de bain'));
  });
  it('un point entre deux chiffres ne termine pas la scène (« 10.5 cl »)', () => {
    expect(sceneDeConsigne('Scène : flacon de 10.5 cl posé sur un lavabo · salle de bain. Lumière douce.')).toBe('flacon de 10.5 cl posé sur un lavabo · salle de bain');
  });
});
