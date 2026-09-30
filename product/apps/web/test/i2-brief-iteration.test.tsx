import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { briefDepuisTest, type TestSource } from '@tiktrends/core';
import { PanneauIteration, type EtatIteration } from '../app/(app)/studio/ads/PanneauIteration';

/**
 * I2 · le brief d'itération en tête du Studio. On RÉEND le panneau et on lit le
 * HTML · provenance, natures distinctes, retour au test, et ce qu'un refus ne
 * divulgue pas. Le câblage serveur (droits, marque, préremplissage) se lit en
 * source · la page tire session et base.
 */
const AD = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const src: TestSource = {
  adId: AD, variantCode: 'v2', concept: 'Concept 2', angle: 'Angle 1', persona: 'Mères actives', personaId: 'p1',
  verdictStatus: 'validated', validated: 'winner', comparable: true, testedVariable: 'hook', variableValue: 'Question choc',
  metrics: { cpa: 14, hookRate: 0.33, ctr: 0.012 },
  learnings: [{ statement: 'Le témoignage chiffré tient mieux que la promesse seule.', confidence: 4, scope: 'ad' }],
};
const ok = (): EtatIteration => { const b = briefDepuisTest(src); if (!b.eligible) throw new Error('éligible attendu'); return { etat: 'ok', adId: AD, ...b }; };
const html = (it: EtatIteration) => renderToStaticMarkup(<PanneauIteration it={it} marque="Neva" />);

describe('I2 · le panneau montre d’où vient le brief, sans rien confondre', () => {
  const h = html(ok());
  it('provenance · le test, son verdict arbitré et ses chiffres', () => {
    expect(h).toContain('Brief d’itération · Itération de v2 · Concept 2');
    expect(h).toContain('Gagnante · verdict arbitré');
    expect(h).toContain('CPA 14 €');
  });
  it('les quatre natures sont nommées et séparées · mesuré, appris, repris, suggéré', () => {
    for (const t of ['Mesuré', 'Appris', 'Repris dans le formulaire', 'Suggéré']) expect(h, `bloc « ${t} » absent`).toContain(t);
    expect(h, 'la suggestion ne se dit pas suggestion').toContain('à valider, rien n’est mesuré ici');
  });
  it('l’apprentissage est repris mot pour mot', () => {
    expect(h).toContain('« Le témoignage chiffré tient mieux que la promesse seule. »');
  });
  it('rien n’est généré à l’ouverture, et les limites sont dites', () => {
    expect(h).toContain('Rien n’est généré ni enregistré à l’ouverture');
    expect(h).toContain('ne sont pas transmises à la génération');
  });
  it('retour au test · lien interne vers son panneau Adsmap', () => {
    expect(h).toContain(`href="/adsmap?ad=${AD}&amp;depuis=studio"`);
  });
  it('les blocs ne s’étirent pas · la section est une grille, pas un flex en colonne qui enroule', () => {
    // Mesuré à 1440 · en flex colonne + wrap, la grille des blocs montait à 269 px
    // pour 128 px de contenu (hauteur calculée sur une largeur intrinsèque).
    const section = /<section[^>]*aria-labelledby="brief-iteration-titre"[^>]*style="([^"]*)"/.exec(h)?.[1] ?? '';
    expect(section).toContain('display:grid');
    expect(section).not.toMatch(/flex-direction:column[^"]*flex-wrap:wrap|flex-wrap:wrap[^"]*flex-direction:column/);
  });
  it('retour Codex #1 · ce que le test faisait varier est son HISTORIQUE, pas un champ prérempli', () => {
    // La variable n'est pas transmise à la génération · rangée sous « Repris
    // dans le formulaire », elle se lisait comme préremplie.
    const blocs = h.split('Suggéré')[0]!;
    const mesure = blocs.slice(blocs.indexOf('Mesuré'), blocs.indexOf('Appris'));
    const repris = blocs.slice(blocs.indexOf('Repris dans le formulaire'));
    expect(mesure).toContain('Ce test faisait varier · Hook = « Question choc »');
    expect(repris, 'la variable du test est encore présentée comme reprise').not.toContain('faisait varier');
    expect(repris).toContain('angle et audience seulement');
  });
  it('retour Codex #2 · le bloc prérempli mène aux vrais champs (bouton, jamais un lien de génération)', () => {
    const repris = h.slice(h.indexOf('Repris dans le formulaire'), h.indexOf('Suggéré'));
    expect(repris).toMatch(/<button type="button"[^>]*>Modifier l’angle et l’audience ›<\/button>/);
  });
  it('retour Codex #2 · à 390 le titre garde la largeur · base 260, le lien passe dessous', () => {
    const titre = /<h2 id="brief-iteration-titre" style="([^"]*)"/.exec(h)?.[1] ?? '';
    expect(titre).toContain('flex:1 1 260px');
  });
  it('nom long · titre et apprentissage reviennent à la ligne, sans débordement', () => {
    const long = { ...src, concept: 'Un concept au nom vraiment très long qui ne doit jamais faire déborder le panneau du brief' };
    const b = briefDepuisTest(long); if (!b.eligible) throw new Error();
    expect(html({ etat: 'ok', adId: AD, ...b })).toContain('overflow-wrap:anywhere');
  });
});

describe('I2 · les cas sans brief', () => {
  it('non éligible · le motif et le retour au test, aucun brief', () => {
    const h = html({ etat: 'non_eligible', adId: AD, motif: 'Aucun apprentissage consigné sur ce test · l’itération part de ce qu’il a appris.' });
    expect(h).toContain('Pas de brief d’itération');
    expect(h).toContain('Aucun apprentissage consigné');
    expect(h).not.toContain('Repris dans le formulaire');
  });
  it('refus (supprimé, autre marque, hors droits) · même message, ni lien ni détail', () => {
    const h = html({ etat: 'refuse' });
    expect(h).toContain('Ce test n’est pas disponible');
    expect(h, 'un refus expose un lien vers le test').not.toContain('/adsmap?ad=');
    expect(h, 'un refus divulgue un détail du test').not.toMatch(/Concept|verdict|v2/);
  });
});

describe('I2 · câblage de la page Studio (lecture seule, droits, marque)', () => {
  const PAGE = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/page.tsx'), 'utf8');
  const STUDIO = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');
  it('le test n’est lu qu’avec l’accès Adsmap ET dans la marque active', () => {
    expect(PAGE, 'la marque active n’est plus vérifiée avant de lire le test').toContain('adsmapOpen && brand ? (await adsDeLaMarque(s.workspaceId, brand.id, [iterDemande])).has(iterDemande) : false');
    expect(PAGE).toContain('const lu = dansMarque ? await adDetailAction(iterDemande) : null;');
    expect(PAGE, 'un test illisible n’aboutit plus à un refus').toContain("if (!d) iteration = { etat: 'refuse' };");
  });
  it('l’audience n’est reprise que si le persona existe dans la marque active', () => {
    expect(PAGE).toContain('personas.some((p) => p.id === iteration.prefill.personaId)');
    expect(STUDIO, 'le Studio ignore l’audience préremplie').toContain('useState(initialPersonaId)');
    expect(PAGE).toContain('initialAngle={angleInitial} initialPersonaId={personaInitial}');
  });
});
