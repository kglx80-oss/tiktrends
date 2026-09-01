import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IMAGE_MODELS, imageModelByKey, falModelFor } from '@tiktrends/core';
import { falGenerateImage, type FalConfig, type FalAspect } from '../src/fal';

/**
 * Ce qui part vraiment chez le fournisseur.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────────
 *
 * Deux pannes de suite sont venues du CORPS de la requête, pas du code qui
 * l'entoure : une taille envoyée dans la convention du modèle précédent, et une
 * adresse d'édition appelée sans image. Les deux ont traversé la compilation,
 * le lint et huit cents tests sans que rien ne bronche · parce que rien ne
 * regardait la requête.
 *
 * On intercepte donc `fetch`. C'est le seul endroit où « le catalogue est juste »
 * cesse d'être une intention pour devenir une vérification.
 *
 * ── Ce qu'on ne teste pas ────────────────────────────────────────────────────
 *
 * Que le fournisseur ACCEPTE la requête · ça, seul un appel réel le dit, et il
 * coûte de l'argent. On teste que ce qu'on envoie correspond à ce qu'on a
 * décidé d'envoyer : la moitié du problème, mais la moitié qui était aveugle.
 */

const cfg: FalConfig = {
  apiKey: 'k', baseUrl: 'https://fal.test', queueUrl: 'https://queue.test',
  imageModel: 'fal-ai/nano-banana-2', imageModelI2I: 'fal-ai/nano-banana-2/edit',
  imageModelText: 'fal-ai/nano-banana-2', imageModelEdit: 'fal-ai/nano-banana-2/edit',
  videoModel: 'v', videoModelI2V: 'v',
};

interface Appel { url: string; body: Record<string, unknown> }
let appels: Appel[] = [];
let reponses: Array<{ ok: boolean; status: number; body?: unknown }> = [];
const vraiFetch = globalThis.fetch;

beforeEach(() => {
  appels = [];
  reponses = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    appels.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) });
    const r = reponses.shift() ?? { ok: true, status: 200, body: { images: [{ url: 'https://out/1.png' }] } };
    return {
      ok: r.ok, status: r.status,
      json: async () => r.body ?? {},
      text: async () => JSON.stringify(r.body ?? {}),
    } as unknown as Response;
  }) as typeof fetch;
});

afterEach(() => { globalThis.fetch = vraiFetch; });

const genere = (o: Partial<Parameters<typeof falGenerateImage>[1]> = {}) =>
  falGenerateImage(cfg, { prompt: 'une scène', aspectRatio: '4:5', ...o });

/* -------------------------------------------------------------------------- */

describe('l’adresse appelée est celle du catalogue', () => {
  it('chaque modèle, avec référence, appelle son endpoint d’édition', async () => {
    for (const m of IMAGE_MODELS) {
      appels = [];
      await genere({ model: falModelFor(m, true), params: m.params, imageUrls: ['https://ref/1.jpg'], edit: true });
      expect(appels[0]!.url, `${m.key} avec référence`).toBe(`${cfg.baseUrl}/${m.falModel}`);
    }
  });

  it('chaque modèle, sans référence, appelle son endpoint simple', async () => {
    for (const m of IMAGE_MODELS) {
      appels = [];
      await genere({ model: falModelFor(m, false), params: m.params });
      expect(appels[0]!.url, `${m.key} sans référence`).toBe(`${cfg.baseUrl}/${m.falModelNoRef ?? m.falModel}`);
    }
  });
});

describe('chaque famille reçoit sa convention de taille', () => {
  /**
   * La panne exacte · GPT Image 2 recevait « 1024x1536 », la convention de son
   * prédécesseur, alors qu'il attend le vocabulaire de Fal.
   */
  it('GPT Image 2 reçoit un libellé Fal, pas des pixels', async () => {
    await genere({ model: 'openai/gpt-image-2/edit', imageUrls: ['https://ref/1.jpg'] });
    expect(appels[0]!.body.image_size).toBe('portrait_4_3');
  });

  it('GPT Image 1 reçoit bien des pixels · sa convention à lui', async () => {
    await genere({ model: 'fal-ai/gpt-image-1/edit-image/byok', imageUrls: ['https://ref/1.jpg'] });
    expect(appels[0]!.body.image_size).toBe('1024x1536');
  });

  it('Nano Banana reçoit un ratio natif, et aucune taille', async () => {
    await genere({ model: 'fal-ai/nano-banana-2/edit', imageUrls: ['https://ref/1.jpg'] });
    expect(appels[0]!.body.aspect_ratio).toBe('4:5');
    expect(appels[0]!.body.image_size).toBeUndefined();
  });

  it('les quatre ratios se traduisent, pour chaque famille', async () => {
    const attendus: Array<[FalAspect, string, string]> = [
      ['9:16', '9:16', 'portrait_16_9'],
      ['4:5', '4:5', 'portrait_4_3'],
      ['1:1', '1:1', 'square_hd'],
      ['16:9', '16:9', 'landscape_16_9'],
    ];
    for (const [ratio, nano, gpt2] of attendus) {
      appels = [];
      await genere({ aspectRatio: ratio, model: 'fal-ai/nano-banana-2' });
      expect(appels[0]!.body.aspect_ratio, `nano ${ratio}`).toBe(nano);
      appels = [];
      await genere({ aspectRatio: ratio, model: 'openai/gpt-image-2' });
      expect(appels[0]!.body.image_size, `gpt2 ${ratio}`).toBe(gpt2);
    }
  });
});

describe('les références partent, et sous le bon nom', () => {
  it('Nano et GPT Image reçoivent plusieurs références', async () => {
    for (const model of ['fal-ai/nano-banana-2/edit', 'openai/gpt-image-2/edit']) {
      appels = [];
      await genere({ model, imageUrls: ['https://a.jpg', 'https://b.jpg'] });
      expect(appels[0]!.body.image_urls, model).toEqual(['https://a.jpg', 'https://b.jpg']);
      expect(appels[0]!.body.image_url, `${model} ne doit pas envoyer image_url`).toBeUndefined();
    }
  });

  it('Flux ne prend qu’une image de départ · c’est sa limite, pas la nôtre', async () => {
    await genere({ model: 'fal-ai/flux/dev/image-to-image', imageUrls: ['https://a.jpg', 'https://b.jpg'] });
    expect(appels[0]!.body.image_url).toBe('https://a.jpg');
    expect(appels[0]!.body.image_urls).toBeUndefined();
  });

  it('huit références au maximum · au-delà, le modèle les ignore et on paie le transfert', async () => {
    const dix = Array.from({ length: 10 }, (_, i) => `https://r/${i}.jpg`);
    await genere({ model: 'fal-ai/nano-banana-2/edit', imageUrls: dix });
    expect((appels[0]!.body.image_urls as string[]).length).toBe(8);
  });

  it('sans référence, aucun champ d’image n’est envoyé', async () => {
    await genere({ model: 'fal-ai/nano-banana-2' });
    expect(appels[0]!.body.image_urls).toBeUndefined();
    expect(appels[0]!.body.image_url).toBeUndefined();
  });
});

describe('les paramètres de variante partent, et se retirent au besoin', () => {
  it('la qualité demandée est envoyée', async () => {
    await genere({ model: 'openai/gpt-image-2', params: { quality: 'high' } });
    expect(appels[0]!.body.quality).toBe('high');
  });

  /**
   * Le repli progressif · un réglage optionnel refusé ne doit pas coûter la
   * génération à l'utilisateur.
   */
  it('un refus retire d’abord les paramètres de variante', async () => {
    reponses = [{ ok: false, status: 422, body: { detail: 'quality' } }];
    await genere({ model: 'openai/gpt-image-2', params: { quality: 'high' } });
    expect(appels).toHaveLength(2);
    expect(appels[1]!.body.quality).toBeUndefined();
    expect(appels[1]!.body.image_size).toBe('portrait_4_3');
  });

  it('un second refus retire la taille · il reste le strict nécessaire', async () => {
    reponses = [
      { ok: false, status: 422, body: { detail: 'quality' } },
      { ok: false, status: 400, body: { detail: 'image_size' } },
    ];
    await genere({ model: 'openai/gpt-image-2', params: { quality: 'high' } });
    expect(appels).toHaveLength(3);
    expect(appels[2]!.body.image_size).toBeUndefined();
    expect(appels[2]!.body.quality).toBeUndefined();
    expect(appels[2]!.body.prompt).toBe('une scène');
  });

  it('un 500 ne déclenche aucun repli · ce n’est pas la demande qui est fautive', async () => {
    reponses = [{ ok: false, status: 500, body: {} }, { ok: false, status: 500, body: {} }];
    await expect(genere({ model: 'openai/gpt-image-2', params: { quality: 'high' } })).rejects.toThrow(/500/);
    expect(appels).toHaveLength(1);
  });
});

describe('ce que dit l’échec', () => {
  it('le message porte le modèle ET la réponse du fournisseur', async () => {
    reponses = [{ ok: false, status: 404, body: { detail: 'model not found' } }];
    await expect(genere({ model: 'openai/gpt-image-2' })).rejects.toThrow(/openai\/gpt-image-2/);
    reponses = [{ ok: false, status: 404, body: { detail: 'model not found' } }];
    await expect(genere({ model: 'openai/gpt-image-2' })).rejects.toThrow(/model not found/);
  });

  it('une réponse sans image est une erreur, pas un succès vide', async () => {
    reponses = [{ ok: true, status: 200, body: { images: [] } }];
    await expect(genere({ model: 'fal-ai/nano-banana-2' })).rejects.toThrow(/aucune image/);
  });
});

describe('le catalogue tient debout tel qu’il est écrit', () => {
  it('aucun modèle du catalogue n’envoie une requête vide de description', async () => {
    for (const m of IMAGE_MODELS) {
      appels = [];
      await genere({ model: falModelFor(m, false), params: m.params });
      expect(appels[0]!.body.prompt, m.key).toBe('une scène');
      expect(appels[0]!.body.num_images, m.key).toBe(1);
    }
  });

  it('le modèle par défaut est appelable sans rien préciser', async () => {
    const def = imageModelByKey(null);
    appels = [];
    await genere({ model: falModelFor(def, false) });
    expect(appels[0]!.url).toBe(`${cfg.baseUrl}/${def.falModelNoRef ?? def.falModel}`);
  });
});
