import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isValidElement, type ReactNode } from 'react';
import { Equipe } from '../spatial/vues/reglages/Equipe';
import { SOUS_NAV_REGLAGES } from '../spatial/vues/reglages/sous-nav';

/**
 * Frontière serveur / client · un composant SERVEUR ne pose jamais de gestionnaire
 * d'événement (`onChange`, `onClick`…) sur un élément. React refuse de sérialiser
 * une fonction vers le navigateur : la page entière répond 500 en production
 * (« Event handlers cannot be passed to Client Component props »), alors que
 * `renderToStaticMarkup` des tests de parité, lui, l'accepte sans broncher.
 *
 * Défaut vu au banc riche le 27/10 : `/team` en 500 dès que l'espace compte un
 * membre autre que soi (le sélecteur de rôle portait un `onChange` vide). Le banc
 * initial n'avait qu'un propriétaire, la ligne n'était jamais rendue.
 */

const WEB = join(__dirname, '..');

/** Les éléments HÔTES (balises) qui portent une fonction en `onX` · le résultat que React refuserait. */
function gestionnairesSurHotes(n: ReactNode, out: string[] = []): string[] {
  if (Array.isArray(n)) { for (const x of n) gestionnairesSurHotes(x, out); return out; }
  if (!isValidElement(n)) return out;
  const props = n.props as Record<string, unknown>;
  if (typeof n.type === 'string') {
    for (const [k, v] of Object.entries(props)) if (/^on[A-Z]/.test(k) && typeof v === 'function') out.push(`<${n.type} ${k}>`);
  }
  gestionnairesSurHotes(props.children as ReactNode, out);
  return out;
}

describe('Spatial · Équipe · rendue par le serveur avec d’autres membres', () => {
  it('le sélecteur de rôle d’un autre membre ne porte aucun gestionnaire (sinon /team répond 500)', () => {
    const arbre = Equipe({
      sousNav: SOUS_NAV_REGLAGES, plan: 'Core', formules: [], suivante: null,
      membres: [
        { cle: 'moi', initiales: 'KB', teinte: '#111', nom: 'Kevin', email: 'k@x.fr', role: 'Propriétaire', moi: true },
        { cle: 'm1', initiales: 'ML', teinte: '#222', nom: 'Marine', email: 'm@x.fr', role: 'Admin', moi: false },
      ],
      invitations: [], roles: [{ valeur: 'member', libelle: 'Membre' }], tousRoles: ['Propriétaire', 'Admin', 'Membre'],
      inviter: null, revoquer: null, retours: {},
    });
    const texte = JSON.stringify(arbre, (_k, v) => (typeof v === 'function' ? undefined : v));
    expect(texte, 'la ligne du second membre doit être rendue').toContain('Rôle de Marine');
    expect(gestionnairesSurHotes(arbre)).toEqual([]);
  });
});

describe('Spatial · aucun gestionnaire d’événement dans un composant serveur', () => {
  it('un fichier sans `use client` sous spatial/ ou app/(spatial) ne pose pas de `onX={…}`', () => {
    const fichiers: string[] = [];
    const parcourir = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? parcourir(p) : /\.tsx$/.test(n) && fichiers.push(p); } };
    parcourir(join(WEB, 'spatial')); parcourir(join(WEB, 'app', '(spatial)'));
    const fautifs: string[] = [];
    for (const f of fichiers) {
      const src = readFileSync(f, 'utf8');
      if (/^\s*['"]use client['"]/.test(src)) continue;
      const sansCommentaires = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      for (const m of sansCommentaires.matchAll(/\s(on[A-Z][A-Za-z]*)=\{/g)) fautifs.push(`${f.slice(WEB.length + 1)} · ${m[1]}`);
    }
    // Un composant interactif vit dans un fichier `'use client'` (ex. `vues/reglages/interactifs.tsx`).
    expect(fautifs).toEqual([]);
  });
});
