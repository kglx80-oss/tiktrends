import { describe, expect, it } from 'vitest';
import { signatureFait, versionFait, preuveComplete, preuvePlusRecente, etatFait, faitsPortes, type ValidationFait } from '../src/adsmap/fait-preuve';

/**
 * CDC v7 · N04-suite · la règle PURE qui décide l'état d'un fait · vérifié, à
 * vérifier, ou caduc · face à sa dernière preuve et à son contenu ACTUEL. On
 * teste des RÉSULTATS · même règle au moment de valider et au moment de relire.
 */

const preuve = (o: Partial<ValidationFait> = {}): ValidationFait => ({
  source: 'https://avis.example/1', validateur: 'Camille', date: '2026-09-17T10:00:00Z',
  version: 'v·00000000', signature: signatureFait('Ma piscine n’a jamais été aussi nette'), ...o,
});

describe('signatureFait · normalise l’incident, garde le sens', () => {
  it('espaces de bord, casse et forme Unicode sont neutralisés', () => {
    expect(signatureFait('  -20 %  ')).toBe(signatureFait('-20 %'));
    expect(signatureFait('Alpha')).toBe(signatureFait('alpha'));
  });
  it('un contenu DIFFÉRENT donne une signature différente', () => {
    expect(signatureFait('-20 %')).not.toBe(signatureFait('-25 %'));
  });
});

describe('versionFait · un identifiant court, stable, qui bouge avec le contenu', () => {
  it('déterministe et préfixé', () => {
    expect(versionFait('abc')).toBe(versionFait('abc'));
    expect(versionFait('abc')).toMatch(/^v·[0-9a-f]{8}$/);
  });
  it('change dès que la signature change', () => {
    expect(versionFait(signatureFait('-20 %'))).not.toBe(versionFait(signatureFait('-25 %')));
  });
});

describe('preuveComplete · une case cochée seule ne vaut rien', () => {
  it('exige source ET validateur ET date', () => {
    expect(preuveComplete(preuve())).toBe(true);
    expect(preuveComplete(preuve({ source: '' })), 'sans source').toBe(false);
    expect(preuveComplete(preuve({ source: '  ' })), 'source blanche').toBe(false);
    expect(preuveComplete(preuve({ validateur: '' })), 'sans validateur').toBe(false);
    expect(preuveComplete(preuve({ date: '' })), 'sans date').toBe(false);
    expect(preuveComplete(null)).toBe(false);
  });
});

describe('etatFait · l’état d’un fait face à sa preuve et à son contenu', () => {
  const contenu = 'Ma piscine n’a jamais été aussi nette';

  it('sans preuve → « à vérifier »', () => {
    expect(etatFait(contenu, null)).toBe('a_verifier');
  });
  it('preuve incomplète (case cochée sans source) → « à vérifier », jamais « vérifié »', () => {
    expect(etatFait(contenu, preuve({ source: '' }))).toBe('a_verifier');
  });
  it('preuve complète ET contenu inchangé → « vérifié »', () => {
    expect(etatFait(contenu, preuve())).toBe('verifiee');
    // Insensible à un simple reformatage · même sens, même signature.
    expect(etatFait('  Ma piscine n’a jamais été aussi NETTE  ', preuve())).toBe('verifiee');
  });
  it('preuve complète MAIS contenu changé → « caduque »', () => {
    expect(etatFait('La meilleure piscine du quartier', preuve())).toBe('invalidee');
  });
});

describe('preuvePlusRecente · l’active est déterministe, même sur égalité de date', () => {
  it('la DATE tranche d’abord', () => {
    const vieille = { id: 'zzzz', poseeA: 100 };
    const neuve = { id: 'aaaa', poseeA: 200 };
    expect(preuvePlusRecente(vieille, neuve)).toBe(neuve);
    expect(preuvePlusRecente(neuve, vieille)).toBe(neuve);
  });
  it('sur égalité de date, l’`id` départage · choix STABLE quel que soit l’ordre', () => {
    const petit = { id: '00000000-0000-4000-8000-000000000001', poseeA: 500 };
    const grand = { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', poseeA: 500 };
    // Le même gagnant dans les deux sens · pas de dépendance à l'ordre d'entrée.
    expect(preuvePlusRecente(petit, grand).id).toBe(grand.id);
    expect(preuvePlusRecente(grand, petit).id).toBe(grand.id);
  });
});

describe('faitsPortes · ce qu’un gabarit affirme, avec sa matière', () => {
  it('un témoignage porte sa citation ET son accroche · les deux affirment', () => {
    const f = faitsPortes({ template: 'testimonial', headline: 'Noté #1 par 10 000 clients', quote: 'Génial' });
    expect(f[0]).toMatchObject({ cle: 'temoignage', label: 'Témoignage' });
    expect(f[0]!.contenu).toContain('Génial');
    expect(f[0]!.contenu).toContain('Noté #1 par 10 000 clients');
  });
  it('une offre porte sa pastille ET son accroche', () => {
    const f = faitsPortes({ template: 'offer', headline: 'Offre spéciale', badge: '-20 %' });
    expect(f[0]!.contenu).toContain('-20 %');
    expect(f[0]!.contenu).toContain('Offre spéciale');
  });
  // Le cœur du bug #2 · éditer UN champ porteur invalide, quel qu'il soit.
  it('éditer l’accroche d’une offre CHANGE la matière signée · l’invalidation ne rate plus', () => {
    const avant = faitsPortes({ template: 'offer', headline: 'Offre spéciale', badge: '-20 %' })[0]!.contenu;
    const apres = faitsPortes({ template: 'offer', headline: '-50 % aujourd’hui', badge: '-20 %' })[0]!.contenu;
    expect(signatureFait(apres)).not.toBe(signatureFait(avant));
  });
  it('éditer la citation d’un témoignage change aussi la matière signée', () => {
    const avant = faitsPortes({ template: 'testimonial', headline: 'Avis', quote: 'Génial' })[0]!.contenu;
    const apres = faitsPortes({ template: 'testimonial', headline: 'Avis', quote: 'Décevant' })[0]!.contenu;
    expect(signatureFait(apres)).not.toBe(signatureFait(avant));
  });
  it('un gabarit qui n’affirme rien à prouver ne porte aucun fait', () => {
    expect(faitsPortes({ template: 'benefits', headline: 'Des bienfaits' })).toEqual([]);
    expect(faitsPortes({ template: 'problem_solution', headline: 'X' })).toEqual([]);
  });
  it('sans matière (contenu vide), pas de fait fantôme', () => {
    expect(faitsPortes({ template: 'stat', headline: '  ' })).toEqual([]);
    expect(faitsPortes({ template: 'offer', headline: '  ', badge: '' })).toEqual([]);
  });
});

/**
 * CDC v8 · F02 · une affirmation commerciale présente dans le rendu (une pastille
 * « -50 % » sur un gabarit « Problème / solution ») échappait au contrôle parce
 * que le format n'était pas « Offre ». Le fait doit venir de TOUS les champs,
 * pas du seul gabarit · et une citation posée hors d'un gabarit « Témoignage »
 * affirme quand même une parole tierce.
 */
describe('faitsPortes · F02 · l’offre et la citation ne dépendent plus du gabarit', () => {
  it('une pastille « -50 % » sur un gabarit « Problème / solution » lève un fait « offre »', () => {
    const f = faitsPortes({ template: 'problem_solution', headline: 'Votre piscine vire au vert', badge: '-50 %' });
    const offre = f.find((x) => x.cle === 'offre');
    expect(offre, 'le -50 % doit lever un fait offre').toBeTruthy();
    expect(offre!.contenu).toContain('-50 %');
  });
  it('un pourcentage seul en PASTILLE suffit (une pastille est promotionnelle)', () => {
    const f = faitsPortes({ template: 'benefits', headline: 'Des bienfaits', badge: '50%' });
    expect(f.some((x) => x.cle === 'offre')).toBe(true);
  });
  it('un prix ou une gratuité dans un sous-titre ou un bénéfice compte, quel que soit le gabarit', () => {
    expect(faitsPortes({ template: 'problem_solution', headline: 'Enfin propre', subhead: 'Livraison offerte dès 19 €' }).some((x) => x.cle === 'offre')).toBe(true);
    expect(faitsPortes({ template: 'benefits', headline: 'Confort', benefits: ['Doux', '2+1 ce week-end'] }).some((x) => x.cle === 'offre')).toBe(true);
  });
  it('un bénéfice chiffré HORS pastille (« +40% d’énergie ») n’est pas pris pour une offre', () => {
    const f = faitsPortes({ template: 'problem_solution', headline: '+40% d’énergie' });
    expect(f.some((x) => x.cle === 'offre')).toBe(false);
    expect(f).toEqual([]);
  });
  it('éditer le champ porteur de l’offre hors gabarit rend la matière signée différente', () => {
    const avant = faitsPortes({ template: 'problem_solution', headline: 'Piscine nette', badge: '-50 %' }).find((x) => x.cle === 'offre')!.contenu;
    const apres = faitsPortes({ template: 'problem_solution', headline: 'Piscine nette', badge: '-30 %' }).find((x) => x.cle === 'offre')!.contenu;
    expect(signatureFait(apres)).not.toBe(signatureFait(avant));
  });
  it('une citation posée hors gabarit « Témoignage » lève un fait « témoignage »', () => {
    const f = faitsPortes({ template: 'problem_solution', headline: 'Enfin propre', quote: 'Ma piscine n’a jamais été aussi nette' });
    const temoin = f.find((x) => x.cle === 'temoignage');
    expect(temoin).toBeTruthy();
    expect(temoin!.contenu).toContain('Ma piscine');
  });
  it('le gabarit « offer » garde EXACTEMENT son fait (pas de doublon, signature intacte)', () => {
    const f = faitsPortes({ template: 'offer', headline: 'Offre spéciale', badge: '-20 %' });
    expect(f.filter((x) => x.cle === 'offre')).toHaveLength(1);
    expect(f[0]!.contenu).toBe('-20 % · Offre spéciale');
  });
});
