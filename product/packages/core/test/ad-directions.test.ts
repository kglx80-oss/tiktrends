import { describe, expect, it } from 'vitest';
import { AD_DIRECTIONS, directionByKey, directionPrompt, directionScenePrompt } from '../src/ad-directions';
import { promptPubEntiere } from '../src/production-mode';

describe('le catalogue est complet et distinct', () => {
  it('chaque direction porte ses cinq fragments', () => {
    // Une direction incomplète laisse le modèle inventer ce qui manque · c'est
    // exactement ce qui faisait varier la mise en page sans raison.
    for (const d of AD_DIRECTIONS) {
      for (const [nom, v] of Object.entries({ label: d.label, hint: d.hint, scene: d.scene, lumiere: d.lumiere, typo: d.typo, disposition: d.disposition, finition: d.finition })) {
        expect(v?.trim(), `${d.key} · ${nom}`).toBeTruthy();
      }
      expect(d.scene.length, `${d.key} · scène trop courte`).toBeGreaterThan(60);
      expect(d.typo.length, `${d.key} · typographie trop courte`).toBeGreaterThan(40);
    }
  });

  it('les clés sont uniques', () => {
    const cles = AD_DIRECTIONS.map((d) => d.key);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it('garde les huit clés historiques', () => {
    // Elles sont consignées dans les recettes déjà produites, et les essais
    // d'ambiance se cumulent dessus · les renommer effacerait cet historique.
    for (const k of ['studio', 'lifestyle', 'editorial', 'nature', 'bold', 'cinematic', 'flatlay', 'energy']) {
      expect(directionByKey(k), k).not.toBeNull();
    }
  });

  it('en offre nettement plus que les huit d’avant', () => {
    expect(AD_DIRECTIONS.length).toBeGreaterThanOrEqual(14);
  });

  it('aucune n’en répète une autre sur la typographie', () => {
    // Deux directions au même registre typographique rendent deux fois la
    // même publicité · c'est le reproche exact qu'on nous a fait.
    const typos = AD_DIRECTIONS.map((d) => d.typo.toLowerCase());
    expect(new Set(typos).size).toBe(typos.length);
    const dispositions = AD_DIRECTIONS.map((d) => d.disposition.toLowerCase());
    expect(new Set(dispositions).size).toBe(dispositions.length);
  });

  it('rend `null` sur une clé inconnue', () => {
    expect(directionByKey('inexistante')).toBeNull();
    expect(directionByKey(null)).toBeNull();
  });
});

describe('la direction écrite pour le modèle', () => {
  const d = AD_DIRECTIONS[0]!;

  it('nomme chaque fragment', () => {
    // Fondus en un paragraphe ils se diluent · un modèle qui lit
    // « Typography: … » traite la typographie comme une instruction.
    const p = directionPrompt(d);
    for (const r of ['Scene:', 'Lighting:', 'Typography:', 'Layout:', 'Finish:']) {
      expect(p, r).toContain(r);
    }
  });

  it('la version SCÈNE tait la typographie et la disposition', () => {
    // En mode composé c'est nous qui posons le texte · lui demander un registre
    // typographique lui ferait écrire des mots qu'on recouvrirait, et dicter
    // une disposition réserverait de la place à un texte qui n'ira pas là.
    const p = directionScenePrompt(d);
    expect(p).toContain('Scene:');
    expect(p).toContain('Lighting:');
    expect(p).not.toContain('Typography:');
    expect(p).not.toContain('Layout:');
  });
});

describe('la consigne de pub entière porte la direction', () => {
  it('inclut les cinq fragments quand une direction est donnée', () => {
    const p = promptPubEntiere({
      copie: { headline: 'Une accroche' }, sceneBrief: 'x', avecProduit: true,
      direction: AD_DIRECTIONS.find((d) => d.key === 'editorial')!,
    });
    expect(p).toContain('Typography:');
    expect(p).toContain('Layout:');
  });

  it('retombe sur un prompt maison quand il y en a un', () => {
    const p = promptPubEntiere({
      copie: { headline: 'Une accroche' }, sceneBrief: 'x', avecProduit: true,
      universPrompt: 'ma direction à moi',
    });
    expect(p).toContain('ma direction à moi');
    expect(p).not.toContain('Typography:');
  });

  it('se passe des deux sans rien casser', () => {
    const p = promptPubEntiere({ copie: { headline: 'Une accroche' }, sceneBrief: 'x', avecProduit: false });
    expect(p).toContain('Une accroche');
  });
});
