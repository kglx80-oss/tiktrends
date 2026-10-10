import { describe, it, expect } from 'vitest';
import { calculerPlanImpact, generationsDuPlan, grapheImpact } from '../src/studios/impact';
import { contenuVideo, copie } from './studios-fixtures';

const ids = (p: ReturnType<typeof calculerPlanImpact>) => p.aRefaire.map((n) => n.id);

describe('impact · aucune modification', () => {
  it('rien à refaire, tout réutilisé, empreinte stable', () => {
    const a = contenuVideo();
    const p = calculerPlanImpact(a, copie(a));
    expect(p.aRefaire).toEqual([]);
    expect(p.obsoletes).toEqual([]);
    expect(p.reutilisees.length).toBe(grapheImpact(a).size);
    expect(calculerPlanImpact(a, copie(a)).empreinte).toBe(p.empreinte);
  });
});

describe('impact · texte écran, typo, logo → composition et export, AUCUNE image', () => {
  it('texte incrusté d’un plan vidéo · ni image, ni clip, ni voix', () => {
    const a = contenuVideo();
    const b = copie(a);
    b.shots.byId.s_produit!.onScreenText = ['-20 % aujourd’hui'];
    const p = calculerPlanImpact(a, b);
    expect(generationsDuPlan(p), 'un changement de texte écran a déclenché une génération').toEqual([]);
    expect(ids(p)).toContain('montage');
    expect(ids(p)).toContain('export');
  });

  it('titre et logo du document statique · composition et export seulement', () => {
    const a = contenuVideo();
    const b = copie(a);
    (b.document!.layers.l_titre as { text: string }).text = 'Peau nette en 5 jours';
    b.document!.layers.l_logo!.x = 40;
    const p = calculerPlanImpact(a, b);
    expect(generationsDuPlan(p)).toEqual([]);
    expect(ids(p)).toEqual(['composition', 'export']);
  });
});

describe('impact · tenue / identité → seuls les plans qui la citent', () => {
  it('changer la tenue de Léa rend obsolètes sa fiche, son plan et son clip · le reste est réutilisé', () => {
    const a = contenuVideo();
    const b = copie(a);
    b.characterRefs.c_lea = { tenue: 'robe rouge' };
    const p = calculerPlanImpact(a, b);
    expect(generationsDuPlan(p).sort()).toEqual(['clip:s_ouverture', 'identite:c_lea', 'keyframe:s_ouverture']);
    for (const r of ['keyframe:s_produit', 'keyframe:s_fin', 'clip:s_produit', 'clip:s_fin', 'identite:c_tom', 'voix:s_ouverture', 'voix:s_produit']) {
      expect(p.reutilisees, `${r} devrait être réutilisé`).toContain(r);
    }
    expect(p.obsoletes).toContain('keyframe:s_ouverture');
    expect(p.obsoletes).not.toContain('keyframe:s_fin');
  });
});

describe('impact · ordre des plans → rien n’est régénéré', () => {
  it('réordonner ne refait que le montage, le mix, les sous-titres et l’export', () => {
    const a = contenuVideo();
    const b = copie(a);
    b.shots.order = ['s_fin', 's_ouverture', 's_produit'];
    const p = calculerPlanImpact(a, b);
    expect(generationsDuPlan(p), 'réordonner a déclenché une génération').toEqual([]);
    expect(ids(p)).toEqual(['montage', 'mix', 'sous_titres', 'export']);
  });
});

describe('impact · narration, voix, musique', () => {
  it('narration en voix off · la voix du plan seulement, pas le clip', () => {
    const a = contenuVideo();
    const b = copie(a);
    b.shots.byId.s_ouverture!.narration = 'Encore des boutons ?';
    const p = calculerPlanImpact(a, b);
    expect(generationsDuPlan(p)).toEqual(['voix:s_ouverture']);
    expect(p.reutilisees).toContain('keyframe:s_ouverture');
    expect(p.reutilisees).toContain('clip:s_ouverture');
  });

  it('narration en lipsync · la voix ET le clip du plan', () => {
    const a = contenuVideo();
    const b = copie(a);
    b.shots.byId.s_produit!.narration = 'Le sérum qui change tout.';
    expect(generationsDuPlan(calculerPlanImpact(a, b)).sort()).toEqual(['clip:s_produit', 'voix:s_produit']);
  });

  it('changer de voix · toutes les voix et les clips lipsync, aucune image', () => {
    const a = contenuVideo();
    const b = copie(a);
    b.timeline!.voice = { voiceId: 'v_grave' };
    expect(generationsDuPlan(calculerPlanImpact(a, b)).sort()).toEqual(['clip:s_produit', 'voix:s_ouverture', 'voix:s_produit']);
  });

  it('musique et gain · mix et export seulement', () => {
    const a = contenuVideo();
    const b = copie(a);
    b.timeline!.music = { assetId: 'a_musique', gainDb: -6 };
    expect(ids(calculerPlanImpact(a, b))).toEqual(['mix', 'export']);
  });
});

describe('impact · produit et style', () => {
  it('changer la photo produit ne touche que le plan qui cite le produit', () => {
    const a = contenuVideo();
    const b = copie(a);
    b.productRef = { productId: 'p_serum', assetId: 'a_serum_v2' };
    expect(generationsDuPlan(calculerPlanImpact(a, b)).sort()).toEqual(['clip:s_produit', 'keyframe:s_produit']);
  });
});

describe('impact · sorties absentes', () => {
  it('une sortie jamais produite est à faire, pas « obsolète »', () => {
    const a = contenuVideo();
    const p = calculerPlanImpact(a, copie(a), { sortiesExistantes: ['keyframe:s_ouverture'] });
    expect(p.obsoletes).toEqual([]);
    expect(p.reutilisees).toEqual(['keyframe:s_ouverture']);
    expect(ids(p)).toContain('keyframe:s_fin');
    expect(ids(p)).not.toContain('keyframe:s_ouverture');
  });

  it('ordre du DAG · une fiche avant ses images, les images avant les clips, l’export en dernier', () => {
    const a = contenuVideo();
    const p = calculerPlanImpact(a, copie(a), { sortiesExistantes: [] });
    const rang = (id: string) => ids(p).indexOf(id);
    expect(rang('identite:c_lea')).toBeLessThan(rang('keyframe:s_ouverture'));
    expect(rang('keyframe:s_ouverture')).toBeLessThan(rang('clip:s_ouverture'));
    expect(rang('clip:s_ouverture')).toBeLessThan(rang('montage'));
    expect(ids(p).at(-1)).toBe('export');
  });
});
