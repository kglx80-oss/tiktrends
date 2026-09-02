import { describe, it, expect } from 'vitest';
import { withParam } from '../src/url-param';

describe('ajouter un paramètre sans casser l’URL', () => {
  it('ouvre la query quand il n’y en a pas', () => {
    // C'est le cas qui cassait : `/api/asset/<id>&t=1` faisait lire au routeur
    // un identifiant qui n'existe pas, et la vignette s'affichait cassée.
    expect(withParam('/api/asset/abc', 't', 1)).toBe('/api/asset/abc?t=1');
  });

  it('enchaîne quand il y en a déjà une', () => {
    expect(withParam('/api/ad/xyz?v=3', 't', 1)).toBe('/api/ad/xyz?v=3&t=1');
  });

  it('garde le fragment en queue', () => {
    // Un paramètre glissé après le dièse ne serait jamais envoyé au serveur.
    expect(withParam('/a/b#zone', 't', 1)).toBe('/a/b?t=1#zone');
    expect(withParam('/a/b?v=1#zone', 't', 1)).toBe('/a/b?v=1&t=1#zone');
  });

  it('laisse intactes les adresses qui portent la donnée', () => {
    const data = 'data:image/png;base64,AAAA';
    expect(withParam(data, 't', 1)).toBe(data);
    expect(withParam('blob:https://x/y', 't', 1)).toBe('blob:https://x/y');
  });

  it('échappe ce qui doit l’être', () => {
    expect(withParam('/a', 'r', '4:5')).toBe('/a?r=4%3A5');
  });

  it('ne fabrique rien à partir de rien', () => {
    expect(withParam('', 't', 1)).toBe('');
    expect(withParam('   ', 't', 1)).toBe('');
  });

  it('marche sur une URL absolue', () => {
    expect(withParam('https://cdn.x/i.png', 't', 1)).toBe('https://cdn.x/i.png?t=1');
  });
});
