import { describe, expect, it } from 'vitest';
import { proseAffichee, sansTiretCadratin, VALEUR_ABSENTE } from '../src/ponctuation-ecran';

/**
 * A2 · aucun tiret cadratin à l'écran, y compris dans la prose d'un modèle.
 * On lit la VALEUR rendue par la règle, cas limite par cas limite.
 */
describe('sansTiretCadratin · prose', () => {
  it('incise espacée · « a — b » devient « a · b »', () => {
    expect(sansTiretCadratin('Le hook tient — le reste suit.')).toBe('Le hook tient · le reste suit.');
  });

  it('tiret collé aux mots (« a—b ») · les espaces sont posés', () => {
    expect(sansTiretCadratin('efficace—et rapide')).toBe('efficace · et rapide');
  });

  it('espaces insécables, fines et tabulations absorbés', () => {
    expect(sansTiretCadratin('a — b')).toBe('a · b');
    expect(sansTiretCadratin('a — b')).toBe('a · b');
    expect(sansTiretCadratin('a\t—  b')).toBe('a · b');
  });

  it('début de ligne · puce « — x » devient « · x », sur chaque ligne', () => {
    expect(sansTiretCadratin('— premier\n— second')).toBe('· premier\n· second');
  });

  it('fin de ligne · le tiret disparaît, la ligne suivante reste à sa place', () => {
    expect(sansTiretCadratin('on garde le hook —\nPuis on teste')).toBe('on garde le hook\nPuis on teste');
    expect(sansTiretCadratin('fin —')).toBe('fin');
  });

  it('une ligne faite d’un seul tiret devient vide, sans fusionner les lignes', () => {
    expect(sansTiretCadratin('avant\n—\naprès')).toBe('avant\n\naprès');
  });

  it('plusieurs tirets, ou un tiret collé à un « · », ne font qu’un « · »', () => {
    expect(sansTiretCadratin('a —— b')).toBe('a · b');
    expect(sansTiretCadratin('a — — b')).toBe('a · b');
    expect(sansTiretCadratin('a · — b')).toBe('a · b');
    expect(sansTiretCadratin('a — b — c')).toBe('a · b · c');
  });

  it('demi-cadratin d’incise (espacé, ou puce) remplacé · intervalle collé intact', () => {
    expect(sansTiretCadratin('Le hook – pas l’offre – a gagné')).toBe('Le hook · pas l’offre · a gagné');
    expect(sansTiretCadratin('– point un\n– point deux')).toBe('· point un\n· point deux');
    expect(sansTiretCadratin('Femmes 30–45 ans, variantes F01–F24, pages 1–25')).toBe('Femmes 30–45 ans, variantes F01–F24, pages 1–25');
  });

  it('idempotente, et sans effet sur un texte sans tiret', () => {
    const t = 'Le hook — le reste – suit\n— puce';
    expect(sansTiretCadratin(sansTiretCadratin(t))).toBe(sansTiretCadratin(t));
    const sans = 'Rien à changer · ni « - » simple, ni trait d’union.';
    expect(sansTiretCadratin(sans)).toBe(sans);
  });
});

describe('sansTiretCadratin · ce qu’elle ne touche jamais', () => {
  it('bloc de code (```), même non refermé pendant le flux', () => {
    const t = 'Voici — le test :\n```ts\nconst a = "x — y";\n```\nEt voilà — fin.';
    expect(sansTiretCadratin(t)).toBe('Voici · le test :\n```ts\nconst a = "x — y";\n```\nEt voilà · fin.');
    expect(sansTiretCadratin('Début — puis\n```\nfoo — bar')).toBe('Début · puis\n```\nfoo — bar');
  });

  it('code en ligne', () => {
    expect(sansTiretCadratin('Lance `a — b` — puis relis')).toBe('Lance `a — b` · puis relis');
  });

  it('URL contenant un tiret (cadratin, demi-cadratin, trait d’union)', () => {
    const url = 'https://exemple.fr/guide—complet/30–45-ans?q=a—b';
    expect(sansTiretCadratin(`Lis ${url} — c’est court.`)).toBe(`Lis ${url} · c’est court.`);
    expect(sansTiretCadratin(`(${url}) — ok`)).toBe(`(${url}) · ok`);
    expect(sansTiretCadratin('www.site—test.fr — voilà')).toBe('www.site—test.fr · voilà');
  });

  it('chemins et identifiants (/, \\, @, _, =)', () => {
    expect(sansTiretCadratin('Ouvre /studio/projets—v2 — puis valide')).toBe('Ouvre /studio/projets—v2 · puis valide');
    expect(sansTiretCadratin('variante hook_A—B — gagnante')).toBe('variante hook_A—B · gagnante');
    expect(sansTiretCadratin('écris à equipe—x@exemple.fr — merci')).toBe('écris à equipe—x@exemple.fr · merci');
  });

  it('tiret juste après du code · « `x` — y » garde ses espaces', () => {
    expect(sansTiretCadratin('`x` — y')).toBe('`x` · y');
    expect(sansTiretCadratin('`x` – y')).toBe('`x` · y');
    expect(sansTiretCadratin('`x`–y')).toBe('`x`–y');
  });
});

describe('proseAffichee · seule la prose d’un modèle est réécrite', () => {
  it('jarvis et agent réécrits, saisie humaine et origine inconnue intactes', () => {
    expect(proseAffichee('a — b', 'jarvis')).toBe('a · b');
    expect(proseAffichee('a — b', 'agent')).toBe('a · b');
    expect(proseAffichee('a — b', 'human')).toBe('a — b');
    expect(proseAffichee('a — b', 'inconnue')).toBe('a — b');
  });
});

describe('VALEUR_ABSENTE', () => {
  it('n’est pas un tiret cadratin', () => {
    expect(VALEUR_ABSENTE).not.toMatch(/[—–]/);
    expect(VALEUR_ABSENTE.trim().length).toBeGreaterThan(0);
  });
});
