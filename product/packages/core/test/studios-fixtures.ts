import type { ContenuVersion, DocumentStudio, PlanStudio, TimelineStudio } from '../src/studios/document';

/** Jeu synthétique · trois plans, deux identités, un produit, un document, une timeline. */

export function plan(shotId: string, refs: string[], narration = '', speechMode: PlanStudio['speechMode'] = 'none'): PlanStudio {
  return {
    shotId, purpose: 'accroche', subject: 'une personne', action: 'tient le flacon', framing: 'plan moyen',
    camera: 'fixe', lighting: 'jour', environment: 'salle de bain', referenceIds: refs, narration,
    onScreenText: [], speechMode, estimatedDurationMs: 3000,
  };
}

export function documentStudio(): DocumentStudio {
  return {
    width: 1080, height: 1350, colorSpace: 'sRGB',
    fonts: { f_titre: { family: 'Inter', assetId: null } },
    layers: {
      l_fond: { id: 'l_fond', kind: 'image', name: 'Fond', visible: true, locked: false, x: 0, y: 0, width: 1080, height: 1350, rotationDeg: 0, opacity: 1, z: 0, assetId: 'a_fond', sourceWidth: 1080, sourceHeight: 1350, mask: null },
      l_titre: { id: 'l_titre', kind: 'text', name: 'Titre', visible: true, locked: false, x: 60, y: 80, width: 960, height: 200, rotationDeg: 0, opacity: 1, z: 2, text: 'Peau nette en 7 jours', fontId: 'f_titre', fontSizePx: 72, color: '#111111', align: 'left', lineHeight: 1.1 },
      l_logo: { id: 'l_logo', kind: 'logo', name: 'Logo', visible: true, locked: true, x: 900, y: 1200, width: 120, height: 120, rotationDeg: 0, opacity: 1, z: 3, assetId: 'a_logo' },
    },
  };
}

export function timelineStudio(): TimelineStudio {
  return {
    timebase: 1_000_000, fps: { num: 30000, den: 1001 }, durationTicks: 9_000_000,
    tracks: {
      t_video: { id: 't_video', kind: 'video', z: 0, muted: false, gainDb: 0, items: {
        i1: { id: 'i1', source: { shotId: 's_ouverture' }, startTicks: 0, inTicks: 0, outTicks: 3_000_000 },
      } },
    },
    voice: { voiceId: 'v_claire' },
    music: { assetId: 'a_musique', gainDb: -12 },
    subtitles: { enabled: true },
  };
}

export function contenuVideo(): ContenuVersion {
  return {
    brief: { objectif: 'tester une accroche douleur', hypothese: 'la douleur convertit mieux' },
    productRef: { productId: 'p_serum', assetId: 'a_serum' },
    styleRef: { material: 'mat', palette: ['#ffffff'], lighting: 'douce' },
    characterRefs: { c_lea: { tenue: 'pull bleu' }, c_tom: { tenue: 'chemise blanche' } },
    shots: {
      order: ['s_ouverture', 's_produit', 's_fin'],
      byId: {
        s_ouverture: plan('s_ouverture', ['c_lea'], 'Tu en as marre des boutons ?', 'voiceover'),
        s_produit: plan('s_produit', ['p_serum', 'c_tom'], 'Voici le sérum.', 'lipsync'),
        s_fin: plan('s_fin', ['c_tom'], ''),
      },
    },
    document: documentStudio(),
    timeline: timelineStudio(),
  };
}

export const copie = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
