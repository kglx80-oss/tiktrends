import { describe, expect, it } from 'vitest';
import {
  COULOIRS, annonceCibleJarvis, champsBrief, cibleJarvisNoeud, ciblerCouloirs, cheminPorte, classeFormat, couloirsDepuisLignee, couloirsDepuisProjet, ecranSpatial, etatGeneration, etatPlan,
  extraitBulle, formatDuDocument, gesteGenerer, gestesPlan, iconeCalque, legendeFormat, longueurTexte, minuteSeconde, noteCalques, nuancier,
  pastilleEnregistrement, pistesMontage, planDuJob, relectureNecessaire, repliPossible, replierPerdants, reperesTemps, resumeFicheMarque,
  segmentReserveProjets, segmentsHypothese, sourceLecteur, sousTitreProjet, texteTourJarvis,
  type BriefCanonique, type DocumentStudio, type EntreeGestesPlan, type ModeleLignee, type NoeudLignee,
} from '../src';

/**
 * Spatial · rubrique D2 (projet, éditeur, vidéo) · les règles PURES de
 * l'écran. Chaque cas lit un RÉSULTAT (ce que la vue affichera), jamais la
 * présence d'un appel.
 */

const noeud = (id: string, type: NoeudLignee['type'], o: Partial<NoeudLignee> = {}): NoeudLignee => ({ id, type, titre: `${type} ${id}`, resume: `résumé ${id}`, destination: null, badge: null, ...o });
const lignee = (noeuds: NoeudLignee[]): ModeleLignee => ({ noeuds, liens: [], grille: {}, colonnes: 0, aVenir: [], empreinte: 'x' });

describe('Spatial · projet · le canvas en couloirs vient de la lignée réelle', () => {
  const m = lignee([
    noeud('marque', 'marque', { titre: 'Marque · Neva' }),
    noeud('reference:s1', 'reference', { titre: 'Référence · Ploufy', destination: '/veille?ad=1' }),
    noeud('brief:v1', 'brief'), noeud('brief:v2', 'brief'),
    noeud('hypothese:v2', 'hypothese'), noeud('direction:v2', 'direction'),
    noeud('groupe:j1', 'groupe'),
    noeud('creation:a', 'creation'), noeud('creation:b', 'creation'), noeud('creation:c', 'creation'),
    noeud('resultat:a', 'resultat'), noeud('resultat:b', 'resultat', { badge: 'Gagnant', destination: '/adsmap?ad=9' }),
    noeud('apprentissage:b', 'apprentissage'),
    noeud('iteration:v2', 'iteration', { destination: '/studio/projets/p?version=v2' }),
  ]);
  const c = couloirsDepuisLignee(m, { versionVue: 'v2', apercusCreations: { 'creation:b': '/m/b' }, apercusReferences: { 'reference:s1': '/m/s1' }, fiche: { titre: 'Neva · 72 %', texte: 'Ton complice', href: '/brands/b' } });

  it('cinq couloirs dans l’ordre de la maquette, chaque type à sa place', () => {
    expect(c.map((x) => x.titre)).toEqual(['Contexte', 'Hypothèse', 'Créations', 'Mesure', 'Itération']);
    expect(c.map((x) => x.noeuds.length)).toEqual([4, 2, 4, 3, 1]);
    expect(c[0]!.noeuds.map((x) => x.etiquette)).toEqual(['FICHE MARQUE', 'RÉFÉRENCE VEILLE', 'BRIEF', 'BRIEF']);
  });

  it('la fiche marque lue remplace le résumé générique · avec son lien', () => {
    expect(c[0]!.noeuds[0]).toMatchObject({ titre: 'Neva · 72 %', texte: 'Ton complice', lien: { href: '/brands/b', forme: 'pastille' } });
  });

  it('une référence avec vignette réelle montre l’image, sans vignette son texte', () => {
    expect(c[0]!.noeuds[1]).toMatchObject({ titre: 'Ploufy', apercu: { src: '/m/s1' }, texte: null, lien: { href: '/veille?ad=1' } });
  });

  it('la version ouverte est mise en avant · son hypothèse, son itération (sans lien vers elle-même)', () => {
    expect(c[1]!.noeuds[0]!.classe).toBe('sel');
    expect(c[4]!.noeuds[0]).toMatchObject({ classe: 'sel', lien: null });
    const autre = couloirsDepuisLignee(m, { versionVue: 'v1' });
    expect(autre[1]!.noeuds[0]!.classe).toBe('');
    expect(autre[4]!.noeuds[0]!.lien).toMatchObject({ href: '/studio/projets/p?version=v2' });
  });

  it('la création gagnante est marquée (wn, won, pastille), les battues sont repliables, jamais la gagnante', () => {
    const creations = c[2]!.noeuds;
    const b = creations.find((x) => x.id === 'creation:b')!;
    expect(b).toMatchObject({ classe: 'wn', apercu: { classe: 'won' }, pastille: { classe: 'g', libelle: 'Gagnant' }, perdant: false });
    expect(creations.filter((x) => x.perdant).map((x) => x.id)).toEqual(['creation:a']);
    expect(repliPossible(c).possible).toBe(true);
    expect(replierPerdants(c, true)[2]!.noeuds.map((x) => x.id)).toEqual(['groupe:j1', 'creation:b', 'creation:c']);
    expect(replierPerdants(c, false)[2]!.noeuds).toHaveLength(4);
  });

  it('sans gagnant mesuré, rien n’est replié et le bouton le dit', () => {
    const sans = couloirsDepuisLignee(lignee([noeud('creation:a', 'creation'), noeud('resultat:a', 'resultat')]), { versionVue: null });
    expect(sans[2]!.noeuds[0]!.perdant).toBe(false);
    expect(repliPossible(sans)).toEqual({ possible: false, raison: expect.stringContaining('rien à replier') });
  });

  it('repli sans lignée · seuls les nœuds que la fiche porte, couloirs vides honnêtes', () => {
    const r = couloirsDepuisProjet({
      versionId: 'v1', versionN: 1, marque: 'Neva', objectif: null, hypothese: { enonce: 'Si A, alors B.', mesure: 'CTR' }, direction: null, produit: null,
      sources: [], creations: [{ id: 'x', src: '/m/x', titre: 'Lot 1 · sortie 1' }],
    });
    expect(r.map((x) => x.noeuds.length)).toEqual([1, 1, 1, 0, 0]);
    expect(r[0]!.noeuds[0]!.texte).toBe('Version 1 · pas encore de brief rédigé.');
    expect(r[1]!.noeuds[0]).toMatchObject({ classe: 'sel', phrase: 'Si A, alors B.', pastille: { classe: 'c', libelle: 'CTR' } });
    expect(COULOIRS).toHaveLength(5);
  });
});

describe('Spatial · projet · en-tête, génération, états', () => {
  it('le sous-titre et la pastille disent la version servie, en lecture seule si ancienne', () => {
    expect(sousTitreProjet({ marque: 'Neva', libelleType: 'Publicité', versionN: 3, ancienne: false })).toBe('Neva · Publicité · V3');
    expect(sousTitreProjet({ marque: '', libelleType: 'Image', versionN: 1, ancienne: true })).toBe('Image · V1 · lecture seule');
    expect(pastilleEnregistrement({ versionN: 3, ancienne: false })).toEqual({ classe: 'c', libelle: 'Enregistré · version 3', icone: 'check' });
    expect(pastilleEnregistrement({ versionN: 2, ancienne: true }).classe).toBe('w');
  });

  it('« Générer… » ouvre la préparation, jamais une génération · et dit pourquoi quand il ne peut pas', () => {
    const base = { kind: 'image', projetId: 'p', ancienne: false, cadre: true, generationActive: true, liens: { produit: '/studio/projets/p/produit', video: '/studio/projets/p/video', textes: '/studio/projets/p/textes' } };
    expect(gesteGenerer(base)).toEqual({ href: '/studio/projets/p/produit', libelle: 'Préparer l’image…', raison: null });
    expect(gesteGenerer({ ...base, kind: 'video' }).href).toBe('/studio/projets/p/video');
    expect(gesteGenerer({ ...base, kind: 'text', generationActive: false }).href).toBe('/studio/projets/p/textes');
    expect(gesteGenerer({ ...base, generationActive: false })).toMatchObject({ href: null, raison: expect.stringContaining('pas activée') });
    expect(gesteGenerer({ ...base, cadre: false })).toMatchObject({ href: null, raison: expect.stringContaining('Cadre d’abord') });
    expect(gesteGenerer({ ...base, liens: { ...base.liens, produit: null } }).href).toBeNull();
    expect(gesteGenerer({ ...base, ancienne: true })).toMatchObject({ href: '/studio/projets/p', libelle: 'Reprendre la version courante' });
  });

  it('l’état réel d’une génération remplace l’animation simulée · en file, en cours, échec, prête', () => {
    expect(etatGeneration('queued')).toMatchObject({ libelle: 'En file', actif: true, pret: false });
    expect(etatGeneration('running')).toMatchObject({ libelle: 'En cours', actif: true });
    expect(etatGeneration('failed')).toMatchObject({ libelle: 'Échec', classe: 'w', actif: false });
    expect(etatGeneration('completed')).toMatchObject({ libelle: 'Prête', classe: 'g', pret: true, actif: false });
    expect(relectureNecessaire(['completed', 'failed'])).toBe(false);
    expect(relectureNecessaire(['completed', 'persisting'])).toBe(true);
  });

  it('la fiche marque résumée · complétude et manques réels', () => {
    expect(resumeFicheMarque('Neva', { score: 72, ton: 'complice', couleurs: 3, manques: ['l’audience'] })).toEqual({ titre: 'Neva · 72 %', texte: 'Ton complice · 3 couleurs · 1 élément à compléter' });
    expect(resumeFicheMarque('', { score: 100, ton: null, couleurs: 0, manques: [] }).texte).toBe('Fiche complète');
  });

  it('l’hypothèse met « Si » et « alors » en gras, le reste tel quel', () => {
    expect(segmentsHypothese('Si l’accroche pose une question, alors plus de personnes restent.')).toEqual([
      { texte: 'Si', fort: true }, { texte: ' l’accroche pose une question, ', fort: false }, { texte: 'alors', fort: true }, { texte: ' plus de personnes restent.', fort: false },
    ]);
    expect(segmentsHypothese('Une question retient mieux.')).toEqual([{ texte: 'Une question retient mieux.', fort: false }]);
    // « Sicile », « alorsque » ne sont pas des mots charnières.
    expect(segmentsHypothese('Sicile alorsque').every((s) => !s.fort)).toBe(true);
  });

  it('un tour de Jarvis se lit sans marqueurs de source ni tiret cadratin · une bulle se coupe sur un mot', () => {
    expect(texteTourJarvis('Garde B — elle gagne.\n[[SOURCE:K1-v1]]')).toBe('Garde B · elle gagne.');
    const long = 'mot '.repeat(100);
    const e = extraitBulle(long, 40);
    expect(e.endsWith('…')).toBe(true);
    expect(e.length).toBeLessThanOrEqual(40);
    expect(e).not.toMatch(/mo…$/);
  });

  it('le brief en lignes · une variable testée Adsmap (code) s’écrit en clair, un texte libre reste tel quel', () => {
    const b: BriefCanonique = { objective: 'Tester', audience: '', hypothesisId: null, testedVariable: 'opening_visual', facts: [], invariants: [], variables: [], references: [], composition: '', styleIntent: '', texts: [], formats: [], exclusions: [] };
    expect(champsBrief(b, null).find((x) => x.libelle === 'Variable testée')!.valeurs).toEqual(['le visuel d’ouverture']);
    expect(champsBrief({ ...b, testedVariable: 'Visuel avant/après' }, null).find((x) => x.libelle === 'Variable testée')!.valeurs).toEqual(['Visuel avant/après']);
    expect(champsBrief({ ...b, testedVariable: '' }, null).find((x) => x.libelle === 'Variable testée')).toBeUndefined();
  });

  it('le brief en lignes · seuls les champs renseignés, l’objectif en pastille', () => {
    const b: BriefCanonique = { objective: 'Faire découvrir', audience: 'Parents', hypothesisId: 'h1', testedVariable: 'accroche', facts: [{ id: 'f1', claim: 'Vu chez Ploufy', sourceIds: [], kind: 'observed', confidence: 'medium' }], invariants: [], variables: [], references: [], composition: '', styleIntent: 'Complice', texts: ['A', 'B'], formats: ['4:5'], exclusions: [], objectifType: 'conversion' };
    const c = champsBrief(b, { id: 'h1', statement: 'Si A, alors B', sourceIds: [], variable: 'accroche', control: '', treatment: '', invariants: [], metric: 'CTR', decisionRule: '', limitations: [] });
    expect(c.map((x) => x.libelle)).toEqual(['Objectif', 'But', 'Cible', 'Ton', 'Hypothèse', 'Variable testée', 'Mesure', 'Formats', 'Textes', 'Faits observés']);
    expect(c[0]!.options).toBe(true);
    expect(c.find((x) => x.libelle === 'Textes')!.valeurs).toEqual(['A', 'B']);
  });

  it('« nouveau » n’est jamais lu comme un projet · le motif porté l’attrape tant que son écran n’existe pas', () => {
    expect(segmentReserveProjets('nouveau')).toBe(true);
    expect(segmentReserveProjets('0b0e7d4c-1111-4c5e-9a00-000000000000')).toBe(false);
    expect(ecranSpatial('/studio/projets/abc')).toMatchObject({ interne: '/sp/studio/projets/abc', section: 'studios' });
    expect(cheminPorte('/studio/projets/abc/image')).toBe(true);
    expect(cheminPorte('/studio/projets/abc/video?x=1')).toBe(true);
    // Vague 2 · les ateliers du projet sont portés à leur tour · le fichier produit reste servi par sa route.
    for (const s of ['produit', 'textes', 'identites', 'export']) expect(cheminPorte(`/studio/projets/abc/${s}`)).toBe(true);
    expect(cheminPorte('/studio/projets/abc/produit/fichier/a1')).toBe(false);
  });
});

describe('Spatial · vidéo · plans, gestes, montage', () => {
  it('l’état d’un plan · le job réel en cours prime, puis ce qui est produit', () => {
    const jobs = [{ operation: 'keyframe:s1', etat: 'running' as const }, { operation: 'clip:s2', etat: 'failed' as const }];
    expect(etatPlan({ shotId: 's1', keyframe: 'a_produire', clip: 'a_produire', jobs })).toMatchObject({ libelle: 'En cours', actif: true });
    expect(etatPlan({ shotId: 's2', keyframe: 'valide', clip: 'a_produire', jobs })).toMatchObject({ libelle: 'Image clé prête', classe: 'g' });
    expect(etatPlan({ shotId: 's2', keyframe: 'a_produire', clip: 'a_produire', jobs })).toMatchObject({ libelle: 'Échec', classe: 'w' });
    expect(etatPlan({ shotId: 's3', keyframe: 'valide', clip: 'valide', jobs })).toMatchObject({ libelle: 'Animé' });
    expect(etatPlan({ shotId: 's3', keyframe: 'obsolete', clip: 'a_produire', jobs })).toMatchObject({ libelle: 'Obsolète' });
    expect(etatPlan({ shotId: 's4', keyframe: 'a_produire', clip: 'a_produire', jobs: [] })).toMatchObject({ libelle: 'À produire', classe: '' });
    expect(planDuJob('keyframe:s_1')).toEqual({ plan: 's_1', nature: 'keyframe' });
    expect(planDuJob('composition')).toBeNull();
  });

  const OUI = { disponible: true, raison: '' };
  const entree = (o: Partial<EntreeGestesPlan> = {}): EntreeGestesPlan => ({
    disponibilite: { consigne: OUI, montage: OUI, devis: OUI, lancement: OUI, animation: OUI },
    keyframe: { etat: 'a_produire', consigneEnAttente: false, consigneRetenue: null, devisCredits: null },
    clip: { keyframePrete: false, devisCredits: null },
    prixImageCredits: 4, prixClip: { credits: 40, dureeS: 5 }, coutTexte: '≈ 0,02 $', ...o,
  });

  it('six gestes dans l’ordre de la chaîne, chacun avec son prix annoncé', () => {
    const g = gestesPlan(entree());
    expect(g.map((x) => x.cle)).toEqual(['consigne', 'retenir', 'devis', 'lancer', 'devis-clip', 'lancer-clip']);
    expect(g.map((x) => x.prix)).toEqual(['≈ 0,02 $', '0 cr.', '4 cr.', '4 cr.', '40 cr.', '40 cr.']);
    expect(g.filter((x) => x.actif).map((x) => x.cle)).toEqual(['consigne']);
    expect(g.find((x) => x.cle === 'lancer')!.raison).toBe('Demande d’abord un devis.');
  });

  it('le lancement n’est actif qu’avec un devis, et porte le prix du DEVIS', () => {
    const g = gestesPlan(entree({ keyframe: { etat: 'a_produire', consigneEnAttente: false, consigneRetenue: { ok: true, motif: '' }, devisCredits: 6 } }));
    expect(g.find((x) => x.cle === 'devis')!.actif).toBe(true);
    expect(g.find((x) => x.cle === 'lancer')).toMatchObject({ actif: true, prix: '6 cr.', payant: true });
  });

  it('une capacité coupée rend le geste inactif avec SA raison · une consigne refusée bloque le devis', () => {
    const coupe = { disponible: false, raison: 'Plafond atteint.' };
    const g = gestesPlan(entree({ disponibilite: { consigne: coupe, montage: OUI, devis: OUI, lancement: coupe, animation: { disponible: false, raison: 'Aucun fournisseur d’animation.' } } }));
    expect(g.find((x) => x.cle === 'consigne')).toMatchObject({ actif: false, raison: 'Plafond atteint.' });
    expect(g.find((x) => x.cle === 'devis-clip')!.raison).toBe('Aucun fournisseur d’animation.');
    const refusee = gestesPlan(entree({ keyframe: { etat: 'a_produire', consigneEnAttente: false, consigneRetenue: { ok: false, motif: 'Texte interdit.' }, devisCredits: null } }));
    expect(refusee.find((x) => x.cle === 'devis')).toMatchObject({ actif: false, raison: 'Texte interdit.' });
  });

  it('les pistes du montage · parts proportionnelles aux durées, texte et voix réels, repères de temps', () => {
    const p = pistesMontage({
      segments: [{ shotId: 'a', rang: 1, dureeMs: 3000 }, { shotId: 'b', rang: 2, dureeMs: 9000 }],
      plans: { a: { purpose: 'Accroche', onScreenText: ['Prêts ?'], narration: 'Il plonge.' }, b: { purpose: '', onScreenText: [], narration: '' } },
      totalMs: 12_000, nomVoix: 'Voix off', nomMusique: null, sansTexte: false,
    });
    expect(p.scenes).toEqual([{ shotId: 'a', libelle: 'Accroche', flex: 0.25 }, { shotId: 'b', libelle: 'Plan 2', flex: 0.75 }]);
    expect(p.textes.map((t) => t.libelle)).toEqual(['Prêts ?', '–']);
    expect(p.voix).toEqual({ titre: 'Voix · Voix off', texte: 'Il plonge.' });
    expect(p.musique.titre).toBe('Musique · aucune');
    expect(p.reperes).toEqual(['0:00', '0:03', '0:06', '0:09', '0:12']);
    expect(pistesMontage({ segments: [{ shotId: 'a', rang: 1, dureeMs: 3000 }], plans: { a: { purpose: 'x', onScreenText: ['t'], narration: '' } }, totalMs: 3000, nomVoix: null, nomMusique: null, sansTexte: true }).textes[0]!.libelle).toBe('–');
  });

  it('temps, format et lecteur', () => {
    expect(minuteSeconde(75_400)).toBe('1:15');
    expect(reperesTemps(0)).toEqual(['0:00', '0:00', '0:00', '0:00', '0:00']);
    expect(legendeFormat({ largeur: 1080, hauteur: 1920 }, 15_000)).toBe('9:16 · 15 s');
    expect(sourceLecteur({ finale: { url: '/f' }, imagesCles: [{ url: '/k' }] })).toEqual({ type: 'video', src: '/f' });
    expect(sourceLecteur({ finale: null, imagesCles: [null, { url: '/k' }] })).toEqual({ type: 'image', src: '/k' });
    expect(sourceLecteur({ finale: null, imagesCles: [null] })).toBeNull();
  });
});

describe('Spatial · éditeur · format, calques, couleurs', () => {
  const doc = (o: Partial<DocumentStudio> = {}): DocumentStudio => ({ width: 1080, height: 1350, colorSpace: 'sRGB', fonts: {}, layers: {}, ...o });

  it('le format actif se lit sur les dimensions réelles du document', () => {
    expect(formatDuDocument({ width: 1080, height: 1350 })).toBe('4:5');
    expect(formatDuDocument({ width: 540, height: 960 })).toBe('9:16');
    expect(formatDuDocument({ width: 2000, height: 2000 })).toBe('1:1');
    expect(formatDuDocument({ width: 1200, height: 628 })).toBeNull();
    expect([classeFormat('1:1'), classeFormat('4:5'), classeFormat('9:16'), classeFormat(null)]).toEqual(['r11', '', 'r916', '']);
  });

  it('icônes · la photo produit et le logo portent l’étiquette, comme la maquette', () => {
    expect(iconeCalque({ id: 'produit', kind: 'image' })).toBe('tag');
    expect(iconeCalque({ id: 'img-1', kind: 'image' })).toBe('img');
    expect(iconeCalque({ id: 'l', kind: 'logo' })).toBe('tag');
    expect(iconeCalque({ id: 't', kind: 'text' })).toBe('text');
    expect(iconeCalque({ id: 's', kind: 'shape' })).toBe('spark');
  });

  it('la note des calques dit ce que le verrou garantit', () => {
    expect(noteCalques(null)).toContain('Ajoute');
    const base = { visible: true, x: 0, y: 0, width: 1, height: 1, rotationDeg: 0, opacity: 1, z: 0 };
    expect(noteCalques(doc({ layers: { produit: { ...base, id: 'produit', name: 'Produit', locked: true, kind: 'image', assetId: 'a', sourceWidth: 1, sourceHeight: 1, mask: null } } }))).toContain('Le produit est verrouillé');
    expect(noteCalques(doc({ layers: { t: { ...base, id: 't', name: 'Titre', locked: false, kind: 'text', text: '', fontId: 'sans', fontSizePx: 40, color: '#000000', align: 'left', lineHeight: 1.2 } } }))).toContain('Choisis un calque');
  });

  it('le nuancier · couleurs de la marque d’abord, puis celles du document, sans doublon, borné', () => {
    const base = { visible: true, locked: false, x: 0, y: 0, width: 1, height: 1, rotationDeg: 0, opacity: 1, z: 0 };
    const d = doc({ layers: {
      t: { ...base, id: 't', name: 'T', kind: 'text', text: '', fontId: 'sans', fontSizePx: 40, color: '#25334A', align: 'left', lineHeight: 1.2 },
      f: { ...base, id: 'f', name: 'F', kind: 'shape', shape: 'rect', fill: '#c4e6ef' },
    } });
    expect(nuancier(['#C4E6EF', 'pas une couleur', '#f4b6c8'], d)).toEqual(['#c4e6ef', '#f4b6c8', '#25334a', '#ffffff', '#000000']);
    expect(nuancier(['#111111', '#222222', '#333333', '#444444', '#555555'], null, 4)).toHaveLength(4);
    expect(longueurTexte('Prêts ?')).toBe('7 caractères');
    expect(longueurTexte('A')).toBe('1 caractère');
  });
});

describe('Spatial · projet · « Cibler Jarvis » depuis un nœud', () => {
  const cibles = [{ cible: 'shot:s1', libelle: 'Plan 1' }, { cible: 'brief', libelle: 'Brief' }];
  it('seuls brief, hypothèse et direction de la version COURANTE ciblent le brief', () => {
    for (const id of ['brief:v3', 'hypothese:v3', 'direction:v3']) expect(cibleJarvisNoeud(id, { versionCourante: 'v3', cibles })).toEqual({ cible: 'brief', libelle: 'Brief' });
    for (const id of ['brief:v2', 'creation:a', 'resultat:b', 'iteration:v3', 'marque', 'reference:s1']) expect(cibleJarvisNoeud(id, { versionCourante: 'v3', cibles }), id).toBeNull();
  });
  it('version antérieure ou formulaire sans cible « brief » (lecture seule) · aucun geste', () => {
    expect(cibleJarvisNoeud('brief:v3', { versionCourante: null, cibles })).toBeNull();
    expect(cibleJarvisNoeud('brief:v3', { versionCourante: 'v3', cibles: [] })).toBeNull();
  });
  it('les couloirs gardent leurs nœuds · seuls les nœuds ciblables reçoivent une cible', () => {
    const couloirs = [{ cle: 'contexte' as const, titre: 'Contexte', noeuds: [{ id: 'brief:v3' }, { id: 'marque' }] }] as never;
    const r = ciblerCouloirs(couloirs, { versionCourante: 'v3', cibles });
    expect(r[0]!.noeuds.map((x) => [x.id, x.cible?.cible ?? null])).toEqual([['brief:v3', 'brief'], ['marque', null]]);
  });
  it('l’annonce ne promet aucun envoi', () => {
    expect(annonceCibleJarvis('Brief', true)).toMatch(/Rien n’est envoyé/);
    expect(annonceCibleJarvis('Brief', false)).toMatch(/Rien n’a été envoyé/);
  });
});
