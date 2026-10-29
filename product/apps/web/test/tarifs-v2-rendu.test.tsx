import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DROITS_V2, FORFAIT_V2_MIS_EN_AVANT, FORFAITS_ACTUELS, FORFAITS_ACTUELS_ORDRE, FORFAITS_V2, FORFAITS_V2_ORDRE, lignesLimites, prixEcheanceTtc, prixMensuelTtc,
  type CleForfaitV2,
} from '@tiktrends/core';
import * as PageTarifs from '../app/tarifs/page';
import { Landing } from '../app/Landing';
import CGV from '../app/legal/cgv/page';

/**
 * Les pages PUBLIQUES et l'interrupteur `TARIFS_V2` · on rend chaque page et
 * on lit le HTML.
 *
 *  · sous `TARIFS_V2`, `/tarifs`, la page d'accueil et les CGV montrent
 *    Essentiel, Pro et Agence aux valeurs du NOYAU (prix mensuel et annuel
 *    TTC, échéance annuelle, crédits par mois, limites des droits), « Le plus
 *    populaire » sur Pro seul, « Sans engagement », bouton vers l'inscription ;
 *  · sans l'interrupteur (absent ou « 0 »), elles montrent l'offre d'aujourd'hui
 *    et RIEN de la V2.
 *
 * Les valeurs attendues sont recalculées ici depuis les primitives du noyau
 * (`FORFAITS_V2`, `prixMensuelTtc`, `prixEcheanceTtc`, `DROITS_V2`), pas lues
 * dans le module de présentation · un prix écrit en dur dans la page, ou un
 * module public qui dériverait, fait tomber la garde.
 */

const plat = (s: string) => s.replace(/&#x27;/g, '’').replace(/[\s  ]+/g, ' ');
const euros = (n: number) => plat(`${n.toLocaleString('fr-FR', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`);
const nombre = (n: number) => plat(n.toLocaleString('fr-FR'));

function rendreTarifs(): string {
  return plat(renderToStaticMarkup(PageTarifs.default()));
}
const rendreAccueil = () => plat(renderToStaticMarkup(<Landing />));
const rendreCgv = () => plat(renderToStaticMarkup(<CGV />));

/** Le morceau de HTML d'une carte · de son `data-forfait` au suivant. */
function carte(html: string, cle: CleForfaitV2): string {
  const debut = html.indexOf(`data-forfait="${cle}"`);
  expect(debut, `la carte ${cle} est absente`).toBeGreaterThan(-1);
  const suite = FORFAITS_V2_ORDRE.map((k) => html.indexOf(`data-forfait="${k}"`)).filter((i) => i > debut);
  return html.slice(debut, suite.length ? Math.min(...suite) : undefined);
}

afterEach(() => { vi.unstubAllEnvs(); });

describe('pages publiques · sans TARIFS_V2, l’offre d’aujourd’hui et rien de la V2', () => {
  for (const valeur of [undefined, '0']) {
    it(`TARIFS_V2 ${valeur === undefined ? 'absent' : `= « ${valeur} »`}`, async () => {
      if (valeur === undefined) vi.stubEnv('TARIFS_V2', undefined as unknown as string); else vi.stubEnv('TARIFS_V2', valeur);
      const tarifs = rendreTarifs();
      const accueil = rendreAccueil();
      for (const k of FORFAITS_ACTUELS_ORDRE) {
        const f = FORFAITS_ACTUELS[k];
        expect(tarifs, `/tarifs · ${f.libelle} absent`).toContain(f.libelle);
        expect(tarifs, `/tarifs · prix ${f.prixMensuelEur}€ de ${k} absent`).toContain(`${nombre(f.prixMensuelEur)}€`);
        expect(accueil, `accueil · prix ${f.prixMensuelEur}€ de ${k} absent`).toContain(`${f.prixMensuelEur}€`);
      }
      expect(tarifs).toContain('2 mois offerts');
      for (const html of [tarifs, accueil, rendreCgv()]) {
        for (const k of FORFAITS_V2_ORDRE) expect(html, `${FORFAITS_V2[k].libelle} affiché sans l’interrupteur`).not.toMatch(new RegExp(`>${FORFAITS_V2[k].libelle}<|\\b${FORFAITS_V2[k].libelle}[,)]`));
        expect(html, 'la V2 fuit sans l’interrupteur').not.toMatch(/Le plus populaire|TTC|data-forfait/);
      }
      expect(rendreCgv()).toContain('(Starter, Core, Plus, Business)');
      expect(accueil).toContain('"highPrice":"990","offerCount":"4"');
      expect((await PageTarifs.generateMetadata()).description).toContain('Starter, Core, Plus, Business');
    });
  }
});

describe('pages publiques · sous TARIFS_V2, la grille V2 aux valeurs du noyau', () => {
  const PRIX_ACTUELS = FORFAITS_ACTUELS_ORDRE.map((k) => FORFAITS_ACTUELS[k].prixMensuelEur).filter((n) => n > 0);

  it('/tarifs · chaque carte, en mensuel et en annuel, crédits, limites, étiquette, engagement, inscription', () => {
    vi.stubEnv('TARIFS_V2', '1');
    const html = rendreTarifs();
    expect(html.match(/data-forfait="/g)?.length, 'trois cartes attendues').toBe(FORFAITS_V2_ORDRE.length);
    for (const k of FORFAITS_V2_ORDRE) {
      const c = carte(html, k);
      const f = FORFAITS_V2[k];
      expect(c).toContain(`>${f.libelle}<`);
      expect(c, `${k} · prix mensuel`).toContain(`data-prix="mensuel"><b>${euros(prixMensuelTtc(k, 'mensuel'))}</b> <span class="tp-per">/ mois TTC`);
      expect(c, `${k} · prix annuel ramené au mois`).toContain(`data-prix="annuel"><b>${euros(prixMensuelTtc(k, 'annuel'))}</b>`);
      expect(c, `${k} · échéance annuelle`).toContain(`soit ${euros(prixEcheanceTtc(k, 'annuel'))} TTC prélevés une fois par an`);
      expect(c, `${k} · crédits par mois`).toContain(`data-credits="true">${nombre(f.creditsMois)}</b> crédits IA / mois`);
      for (const l of lignesLimites(DROITS_V2[k])) expect(c, `${k} · limite « ${l} »`).toContain(l);
      expect(c).toContain('Sans engagement, annulable à tout moment');
      expect(c).toContain(`href="/signup"`);
      expect(c.includes('Le plus populaire'), `${k} · étiquette`).toBe(k === FORFAIT_V2_MIS_EN_AVANT);
    }
    expect(html).toContain('Comparer les offres');
    expect(html).toMatch(/tp-save">−30 %/);
    for (const p of PRIX_ACTUELS) expect(html, `l’ancien prix ${p}€ reste affiché`).not.toContain(`${nombre(p)}€`);
    expect(html).not.toContain('2 mois offerts');
    expect(html).not.toContain('—');
    expect(html).not.toMatch(/Trendtrack/i);
  });

  it('/tarifs · le comparatif porte les droits du serveur', () => {
    vi.stubEnv('TARIFS_V2', '1');
    const html = rendreTarifs();
    const droits = html.slice(html.indexOf('>Droits<'));
    for (const k of FORFAITS_V2_ORDRE) {
      expect(droits).toContain(`Jusqu’à ${DROITS_V2[k].videoMaxSecondes} s`);
    }
    const ligneMarques = droits.slice(droits.indexOf('<th>Marques</th>'), droits.indexOf('</tr>', droits.indexOf('<th>Marques</th>')));
    expect(ligneMarques.match(/<td[^>]*>([^<]*)<\/td>/g)?.map((td) => td.replace(/<[^>]+>/g, ''))).toEqual(FORFAITS_V2_ORDRE.map((k) => String(DROITS_V2[k].marques)));
  });

  it('accueil · trois cartes V2, JSON-LD à la fourchette du noyau, plus rien de l’ancienne grille', () => {
    vi.stubEnv('TARIFS_V2', 'true');
    const html = rendreAccueil();
    for (const k of FORFAITS_V2_ORDRE) {
      const c = carte(html, k);
      expect(c, `${k} · prix mensuel`).toContain(`data-prix="mensuel">${euros(prixMensuelTtc(k, 'mensuel'))}<span class="lp-muted" style="font-size:14px"> / mois TTC`);
      expect(c, `${k} · prix annuel`).toContain(`ou ${euros(prixMensuelTtc(k, 'annuel'))} / mois TTC en annuel (−30 %)`);
      expect(c, `${k} · crédits`).toContain(`data-credits="true">${nombre(FORFAITS_V2[k].creditsMois)}</b> crédits IA / mois`);
      expect(c).toContain(lignesLimites(DROITS_V2[k]).join(' · '));
      expect(c.includes('Le plus populaire')).toBe(k === FORFAIT_V2_MIS_EN_AVANT);
      expect(c).toContain('href="/signup"');
    }
    const prixV2 = FORFAITS_V2_ORDRE.map((k) => FORFAITS_V2[k].prixMensuelTtc);
    expect(html).toContain(`"lowPrice":"${Math.min(...prixV2)}","highPrice":"${Math.max(...prixV2)}","offerCount":"${prixV2.length}"`);
    expect(html).toContain('Sans engagement, annulable à tout moment · prix TTC');
    expect(html).toContain('href="/tarifs"');
    for (const p of PRIX_ACTUELS) expect(html, `l’ancien prix ${p}€ reste affiché`).not.toContain(`${p}€`);
    expect(html).not.toContain('Recommandé');
    expect(html).not.toContain('—');
  });

  it('CGV et métadonnées · les formules V2 et la règle TTC', async () => {
    vi.stubEnv('TARIFS_V2', 'oui');
    const noms = FORFAITS_V2_ORDRE.map((k) => FORFAITS_V2[k].libelle).join(', ');
    const cgv = rendreCgv();
    expect(cgv).toContain(`(${noms})`);
    expect(cgv).toContain('toutes taxes comprises (TTC)');
    expect(cgv).toContain('mensuel ou annuel');
    expect(cgv).not.toContain('Starter, Core, Plus, Business');
    const meta = await PageTarifs.generateMetadata();
    expect(meta.description).toContain(noms);
    expect(meta.openGraph?.description).toContain(noms);
  });
});

describe('pages publiques · l’interrupteur est lu à la requête, jamais figé au build', () => {
  it('/tarifs est rendue dynamiquement (TARIFS_V2 vit dans .env.deploy, absent du build)', () => {
    expect(PageTarifs.dynamic).toBe('force-dynamic');
  });
});
