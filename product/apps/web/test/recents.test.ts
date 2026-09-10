import { describe, it, expect } from 'vitest';
import { ajouterRecent, type EcranRecent } from '../lib/recents';

const e = (path: string): EcranRecent => ({ path, label: path });

describe('la liste des écrans récents', () => {
  it('met le dernier visité en tête', () => {
    const r = ajouterRecent([e('/a'), e('/b')], e('/c'));
    expect(r.map((x) => x.path)).toEqual(['/c', '/a', '/b']);
  });

  it('ne garde pas de doublon · revisiter remonte en tête', () => {
    const r = ajouterRecent([e('/a'), e('/b'), e('/c')], e('/b'));
    expect(r.map((x) => x.path)).toEqual(['/b', '/a', '/c']);
  });

  it('plafonne la liste · elle reste courte', () => {
    let r: EcranRecent[] = [];
    for (const p of ['/1', '/2', '/3', '/4', '/5', '/6', '/7']) r = ajouterRecent(r, e(p));
    expect(r.map((x) => x.path)).toEqual(['/7', '/6', '/5', '/4', '/3', '/2']);
  });

  it('met à jour le libellé d’un chemin revisité', () => {
    const r = ajouterRecent([{ path: '/a', label: 'Vieux' }], { path: '/a', label: 'Neuf' });
    expect(r).toEqual([{ path: '/a', label: 'Neuf' }]);
  });
});
