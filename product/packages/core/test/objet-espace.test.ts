import { describe, it, expect } from 'vitest';
import { cleObjetDeLEspace } from '../src';

/**
 * Un objet du bucket n'est reconnu comme celui d'un espace que s'il est rangé
 * EXACTEMENT sous `<base>/assets/<espace>/`. On lit la clé rendue (ou le refus)
 * sur les formes qu'un adversaire essaierait.
 */

const BASE = 'https://cdn.exemple.test/bucket';
const WS = '11111111-2222-3333-4444-555555555555';
const AUTRE = '99999999-2222-3333-4444-555555555555';

describe('cleObjetDeLEspace · un objet de CET espace', () => {
  it('téléversement ordinaire ⇒ la clé', () => {
    expect(cleObjetDeLEspace(`${BASE}/assets/${WS}/1728900000-ab12cd34-photo.jpg`, BASE, WS)).toBe(`assets/${WS}/1728900000-ab12cd34-photo.jpg`);
  });
  it('objet Drive (clé prévisible) de l’espace ⇒ la clé', () => {
    expect(cleObjetDeLEspace(`${BASE}/assets/${WS}/drive-1AbC_d-9.png`, BASE, WS)).toBe(`assets/${WS}/drive-1AbC_d-9.png`);
  });
  it('base configurée avec une barre finale ⇒ même résultat', () => {
    expect(cleObjetDeLEspace(`${BASE}/assets/${WS}/x.jpg`, `${BASE}/`, WS)).toBe(`assets/${WS}/x.jpg`);
  });
});

describe('cleObjetDeLEspace · tout le reste est refusé', () => {
  const cas: Array<[string, string]> = [
    ['objet d’un autre espace', `${BASE}/assets/${AUTRE}/drive-abc.png`],
    ['préfixe d’identifiant (espace plus long)', `${BASE}/assets/${WS}0/x.jpg`],
    ['remontée ../', `${BASE}/assets/${WS}/../${AUTRE}/drive-abc.png`],
    ['remontée ./', `${BASE}/assets/${WS}/./x.jpg`],
    ['remontée encodée %2e%2e', `${BASE}/assets/${WS}/%2e%2e/${AUTRE}/drive-abc.png`],
    ['barre encodée %2f', `${BASE}/assets/${WS}%2f..%2f${AUTRE}/x.png`],
    ['double encodage %252e', `${BASE}/assets/${WS}/%252e%252e/${AUTRE}/x.png`],
    ['barre oblique inverse', `${BASE}/assets/${WS}/..\\${AUTRE}\\x.png`],
    ['@ (autre hôte déguisé)', `${BASE}@evil.test/assets/${WS}/x.jpg`],
    ['@ dans le chemin', `${BASE}/assets/${WS}/a@b.jpg`],
    ['requête', `${BASE}/assets/${WS}/x.jpg?x=1`],
    ['fragment', `${BASE}/assets/${WS}/x.jpg#a`],
    ['segment vide', `${BASE}/assets/${WS}//x.jpg`],
    ['bucket voisin au même préfixe', `https://cdn.exemple.test/bucket-voisin/assets/${WS}/x.jpg`],
    ['autre hôte', `https://evil.test/bucket/assets/${WS}/x.jpg`],
    ['schéma différent', `http://cdn.exemple.test/bucket/assets/${WS}/x.jpg`],
    ['majuscules sur le préfixe', `${BASE}/ASSETS/${WS}/x.jpg`],
    ['dossier de l’espace sans fichier', `${BASE}/assets/${WS}/`],
    ['hors assets/', `${BASE}/studios/${WS}/x.jpg`],
    ['objet témoin du contrôle', `${BASE}/assets/_healthcheck/x.txt`],
    ['data URI', `data:image/png;base64,AAAA`],
    ['espace', `${BASE}/assets/${WS}/a b.jpg`],
  ];
  for (const [nom, url] of cas) {
    it(nom, () => expect(cleObjetDeLEspace(url, BASE, WS)).toBeNull());
  }

  it('identifiant d’espace malformé ⇒ refusé', () => {
    expect(cleObjetDeLEspace(`${BASE}/assets/../x.jpg`, BASE, '..')).toBeNull();
    expect(cleObjetDeLEspace(`${BASE}/assets//x.jpg`, BASE, '')).toBeNull();
  });
  it('base vide ou sans schéma ⇒ refusé', () => {
    expect(cleObjetDeLEspace(`/assets/${WS}/x.jpg`, '', WS)).toBeNull();
    expect(cleObjetDeLEspace(`cdn/assets/${WS}/x.jpg`, 'cdn', WS)).toBeNull();
  });
});
