import { it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { AD_TEMPLATES } from '@tiktrends/ai';
import { layoutsFor } from '@tiktrends/core';
import { renderAdPng, type AdRecipe } from '../lib/ad-render';
import { decodePng } from './png';
import { encodePng, planche } from './tools/sheet';

const S = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAC7klEQVR4nO3RxVJccRDF4fNUISF5igh5m0B2cXd3F9zd3SIMgwzukk2yyKZpFlM1NTVc7iTQ51LVi+/UXd7/rzE8/UscD4amNsXxYDCxKY4HAzqOB/2TG+J40DexIY4HvTqOBz3j6+J40K3jeNA1ti6OB53xNXE86NBxPGgfXRPHg7bYqjgetOo4HrSMrIrj8QOwD9D8c0UcD5p+rIjjQaOO40HD92VxPKj/tiyOB3U6jge1w0vieFCj43hQPbQkjgdVg4vieFCp43hQMbAojgfl/QvieFCm43hQ2rcgjudAHuD3n787Yv9b1gco6Z2XqAsKvhv2v+8GxT3zElX/Ez4d+y07QZFO1Oxl+HTst6VDYfecRMl+xk9ivzEVvnbNSRRYhE/HfvM2fNFhY8RPYr8dnztnhY15APbb8UmHiRk/ifl+fOyYFRZ2+FSsBvjQPiMM7OCZMDrgvQ4DO3YmjA541zYj1tihg1i3wNvWabHGjhzEugXe6FhjRw5i3QKvW6bFEjtwGJY9/ADsA7xqnhJL7LhhWPbAy6YpscSOG4ZlD7zQscIOmw2rJnjemBAr7KjZsGqCZw0JscKOmg2rJniqY4UdNRtWTfCkflKssKNmw6oJHutYYocNw7IHHtVNiiV23DAse+Bh7YRYYscNw7IHHuhYYscNw7IH7tdMiDV24CDWLXCvelyssSMHsW6BuzrW2JGDWLfAnapxYWCHzoTRgXaAqB2B1QC3K8eEhR09FasBblWMCRM7/Dbm+3FTh40Zn/123CiPSxQw4rPfvA3Xy+ISFZbx2W9NwjWdKLGIz35jKlwtHZUo2o/w7Ddlgis6UbYX4dlvCILLJaNyEPxLePY/h4FLxTFxPLio43hwoSgmjgfnC0fE8eCcjuPBsdNnxfH4AfgHKBDHg6N5BeJ4/ADsA+Tm5YvjQe4p/XA0fgD2AY7oOB4/APsAh0/mi+PRA5wRx4McHceDnBP64WhwSMfx+AHoBziuH45mCyWeoctiovx6AAAAAElFTkSuQmCC';
/** Écrite hors du dépôt · c'est un objet à regarder, pas un fichier à versionner. */
const SORTIE = '/tmp/planche-tiktrends.png';

const base: Partial<AdRecipe> = {
  sceneUrl: S, kicker: 'ARRÊTE LE CASSE-TÊTE', headline: '4 produits en 1 pastille',
  subhead: 'Une pastille par semaine, et l’eau reste claire.',
  benefits: ['Fini les 4 bidons', 'Dosage impossible à rater', 'Temps et argent'],
  quote: 'Ma piscine est claire en 24 h, sans rien calculer', author: 'Sophie, 41 ans', rating: 5,
  stat: '24h', statLabel: 'pour une eau claire', badge: '-20%',
  cta: 'Je teste', accent: '#2563EB', brandName: 'Klorea', variant: 0,
};

/**
 * La planche de contact · toutes les combinaisons sur une image.
 *
 * ── Pourquoi elle existe ─────────────────────────────────────────────────────
 *
 * On mesure des rendus depuis des semaines : quantité d'encre, centre de
 * gravité, luminance d'une bande, part d'une couleur. Mesurer répond aux
 * questions qu'on pense à poser.
 *
 * Une mise en page effondrée en ligne au lieu d'en colonne a traversé trois
 * gardes verts. Deux éléments qui ne s'affichaient pas du tout — la frontière
 * « AVANT / APRÈS » et l'aplat du « champ de couleur » — n'ont été vus qu'en
 * OUVRANT l'image.
 *
 * ── Ce que le test vérifie, et ce que la planche sert ────────────────────────
 *
 * Le test vérifie que les vingt-cinq combinaisons se rendent sans exception ·
 * c'est peu, mais c'est vrai, et ça tourne à chaque fois.
 *
 * La planche écrite à côté ne prouve rien toute seule · elle sert à REGARDER,
 * ce qu'aucune mesure ne remplace. On l'ouvre après un changement de maquette.
 */
it('les vingt-cinq combinaisons se rendent, et la planche s’écrit', async () => {
  const cells = [];
  const noms: string[] = [];
  for (const template of AD_TEMPLATES) {
    for (const layout of layoutsFor(template)) {
      const buf = await renderAdPng({ ...base, template, layout, width: 260, height: 325 } as AdRecipe);
      cells.push(decodePng(Buffer.from(buf)));
      noms.push(`${template}/${layout}`);
    }
  }
  writeFileSync(SORTIE, encodePng(planche(cells, 5)));
  // Aucune combinaison ne manque · une exception dans l'une d'elles aurait fait
  // échouer la boucle avant d'arriver ici, mais un catalogue qui rétrécit en
  // silence passerait sans ça.
  expect(cells.length, noms.join(' | ')).toBe(noms.length);
  expect(cells.length).toBeGreaterThanOrEqual(25);
}, 600000);
