import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { loadavg, cpus } from 'node:os';
import { mesurerEchelle } from './l8c-chemins';
import { contenuSynthetique } from '../src/studios/perf/synthetique';
import { CHEMINS_CHAUDS, chronometrer } from './l8c-chemins';

/**
 * L8-C · MESURE (sur demande, jamais en CI) · `L8C_MESURE=1 pnpm vitest run
 * test/l8c-mesure.test.ts`. 30 tirages par chemin et par échelle, après trois
 * tirages à blanc ; la charge de la machine est notée avant et après. Le
 * tableau obtenu est recopié dans `src/studios/perf/mesures.ts` : c'est lui
 * qui fixe les cibles, pas l'instinct. `L8C_SORTIE=<fichier>` écrit le JSON.
 */

const actif = process.env.L8C_MESURE === '1';
const N = Number(process.env.L8C_TIRAGES ?? 30);

describe.skipIf(!actif)('L8-C · mesure des chemins chauds du noyau', () => {
  it('petit (20 plans, 100 calques), grand (200 plans, 1000 calques), et au-delà pour la courbe', () => {
    const chargeAvant = loadavg();
    const petit = mesurerEchelle('petit', N);
    const grand = mesurerEchelle('grand', N);
    // Au-delà du cahier · pour voir la PENTE et placer la limite (2× et 4×, sous la taille maximale du contenu).
    const courbe: Record<string, Record<string, unknown>> = {};
    for (const [plans, calques] of [[400, 2000], [800, 4000]] as const) {
      const c = contenuSynthetique({ plans, calques });
      const r: Record<string, unknown> = { caracteres: JSON.stringify(c).length };
      // Au-delà des limites, un chemin qui valide REFUSE (c'est le but) : on le note au lieu de le chronométrer.
      for (const ch of CHEMINS_CHAUDS) {
        try { r[ch.id] = chronometrer(ch.preparer(c), Math.min(N, 20), 1); } catch (e) { r[ch.id] = { refus: e instanceof Error ? e.message : String(e) }; }
      }
      courbe[`${plans}p_${calques}c`] = r;
    }
    const sortie = {
      machine: `${cpus()[0]?.model} · ${cpus().length} cœurs · node ${process.version}`,
      chargeAvant, chargeApres: loadavg(), tirages: N,
      caracteres: { petit: JSON.stringify(contenuSynthetique({ plans: 20, calques: 100 })).length, grand: JSON.stringify(contenuSynthetique({ plans: 200, calques: 1000 })).length },
      petit, grand, courbe,
    };
    console.log(JSON.stringify(sortie, null, 1));
    if (process.env.L8C_SORTIE) writeFileSync(process.env.L8C_SORTIE, JSON.stringify(sortie, null, 1));
    expect(Object.keys(grand).length).toBe(CHEMINS_CHAUDS.length);
  }, 600_000);
});
