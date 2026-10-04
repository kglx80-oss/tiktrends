import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLES_LOGO_OUTIL, cleLogoOutil, connecteursBranches, SEUIL_CONTRASTE_PASTILLE, contrasteWcag } from '@tiktrends/core';
import { BrandTile, LogoOutil, logoDisponible } from '../components/BrandIcons';
import { TRACES_SIMPLE_ICONS } from '../components/logos-outils';
import { ConnecteurBientot } from '../components/ConnecteurBientot';

/**
 * Lot A (#120) · les tuiles d'intégrations montrent le VRAI logo de l'outil.
 *
 * ── Ce qu'on empêche ────────────────────────────────────────────────────────
 *
 * Le constat du propriétaire · des tuiles affichaient une pastille générique
 * (une initiale) là où le logo officiel existe ; d'autres un logo faux (le sac
 * Shopify sans son « S », un TikTok éclaté, des Notion/Canva dessinés à la
 * main). On RENDE chaque tuile du catalogue réel et on lit le HTML ·
 *  · un outil fourni montre son logo (`data-logo="officiel"` + un `<svg>`) ;
 *  · un outil sans tracé officiel montre le repli (`data-logo="repli"`), jamais
 *    un SVG inventé ;
 *  · la tuile est décorative (`aria-hidden`), le nom reste écrit à côté ;
 *  · aucun nom du fournisseur de données interne n'atteint l'écran.
 */

/** Les noms d'outils RÉELLEMENT affichés dans le catalogue Connexions. */
const PAGE_CONNEXIONS = readFileSync(join(process.cwd(), 'app/(app)/connections/page.tsx'), 'utf8');
const CATALOGUE: Array<{ name: string; color: string; glyph: string }> = [
  ...PAGE_CONNEXIONS.matchAll(/\{ name: '([^']+)', color: '(#[0-9A-Fa-f]{6})', glyph: '([^']+)'/g),
].map((m) => ({ name: m[1]!, color: m[2]!, glyph: m[3]! }));
const DISPONIBLES = (PAGE_CONNEXIONS.match(/const DISPONIBLES = \[([^\]]+)\]/)?.[1] ?? '')
  .split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);

/**
 * Ce que chaque outil du catalogue DOIT montrer · son logo, ou `null` pour le
 * repli. Un outil ajouté au catalogue sans décision ici fait tomber le garde.
 */
const ATTENDU: Record<string, string | null> = {
  'Shopify': 'shopify', 'Meta Ads': 'meta', 'Google Drive': 'googledrive',
  'TikTok Ads': 'tiktok', 'Google Ads': 'googleads', 'Snapchat Ads': 'snapchat', 'Reddit Ads': 'reddit',
  'Pinterest Ads': 'pinterest', 'LinkedIn Ads': 'linkedin',
  'Google Analytics': 'googleanalytics', 'Search Console': 'googlesearchconsole', 'Google BigQuery': 'googlebigquery',
  'Amplitude': null, 'Snowflake': 'snowflake',
  'Stripe': 'stripe', 'Triple Whale': null,
  'HubSpot': 'hubspot', 'Salesforce': null, 'Pipedrive': null,
  'Intercom': 'intercom', 'Klaviyo': null, 'Mailchimp': 'mailchimp', 'Zendesk': 'zendesk',
  'Facebook': 'facebook', 'Instagram': 'instagram', 'LinkedIn': 'linkedin', 'X (Twitter)': 'x', 'YouTube': 'youtube', 'Snapchat': 'snapchat',
  'Canva': null, 'Figma': 'figma', 'Higgsfield': null,
  'Notion': 'notion', 'Dropbox': 'dropbox', 'OneDrive': null, 'SharePoint': null, 'Confluence': 'confluence',
  'Gmail': 'gmail', 'Outlook': null, 'Google Sheets': 'googlesheets', 'Google Docs': 'googledocs', 'Excel': null, 'Slack': 'slack',
};

describe('le catalogue lu dans la page est bien celui qu’on juge', () => {
  it('la lecture trouve les connecteurs à venir et les disponibles', () => {
    expect(CATALOGUE.length, 'le catalogue n’a pas été lu dans connections/page.tsx').toBeGreaterThan(30);
    expect(DISPONIBLES).toEqual(['Shopify', 'Meta Ads', 'Google Drive']);
  });
  it('chaque outil affiché a une décision de logo (logo officiel ou repli)', () => {
    for (const n of [...DISPONIBLES, ...CATALOGUE.map((c) => c.name)]) {
      expect(Object.keys(ATTENDU), `« ${n} » est affiché sans décision de logo`).toContain(n);
    }
  });
});

describe('Connexions · chaque tuile du catalogue montre le logo attendu, ou le repli', () => {
  for (const c of CATALOGUE) {
    const attendu = ATTENDU[c.name];
    it(`${c.name} · ${attendu ? `logo ${attendu}` : 'repli monogramme'}`, () => {
      const html = renderToStaticMarkup(<ConnecteurBientot c={c} />);
      // Le nom reste ÉCRIT · c'est lui qui porte le nom accessible.
      expect(html).toContain(`>${c.name.replace(/&/g, '&amp;')}</div>`);
      // La tuile est décorative.
      expect(html, `la tuile de ${c.name} n'est pas aria-hidden`).toMatch(/<span aria-hidden="true" data-logo="/);
      if (attendu) {
        expect(html, `${c.name} devrait montrer son logo officiel`).toContain(`data-logo="officiel" data-outil="${attendu}"`);
        expect(html, `${c.name} · logo sans SVG`).toContain('<svg');
      } else {
        expect(html, `${c.name} devrait montrer le repli explicite`).toContain('data-logo="repli"');
        expect(html, `${c.name} · un SVG est rendu sans tracé officiel`).not.toContain('<svg');
        expect(html, `${c.name} · le monogramme manque`).toContain(`>${c.glyph.replace(/&/g, '&amp;')}</span>`);
      }
    });
  }
});

describe('les connecteurs disponibles et la fiche marque montrent leur logo', () => {
  for (const n of DISPONIBLES) {
    it(`${n} (disponible) · logo officiel`, () => {
      expect(renderToStaticMarkup(<BrandTile name={n} />)).toContain(`data-logo="officiel" data-outil="${ATTENDU[n]}"`);
    });
  }
  it('la bande « Connecté » de la fiche marque · Meta et Shopify avec leur logo', () => {
    const branches = connecteursBranches({ metaToken: 'x', shopifyToken: 'y' });
    expect(branches.map((b) => b.label)).toEqual(['Meta', 'Shopify']);
    for (const b of branches) {
      expect(renderToStaticMarkup(<BrandTile name={b.label} tile={24} />), `${b.label} sans logo sur la fiche marque`)
        .toContain('data-logo="officiel"');
    }
  });
});

describe('le registre · pas de clé sans tracé, pas de tracé sans clé', () => {
  it('chaque logo annoncé par le noyau a un tracé embarqué et se rend en SVG', () => {
    for (const cle of CLES_LOGO_OUTIL) {
      expect(logoDisponible(cle), `la clé ${cle} n'a aucun tracé`).toBe(true);
      expect(renderToStaticMarkup(<LogoOutil cle={cle} />), `${cle} ne rend pas de SVG`).toMatch(/^<svg[^>]*aria-hidden="true"/);
    }
  });
  it('chaque tracé Simple Icons correspond à une clé du noyau, viewBox 24, teinte hex', () => {
    for (const [cle, t] of Object.entries(TRACES_SIMPLE_ICONS)) {
      expect(CLES_LOGO_OUTIL as readonly string[], `${cle} n'est pas une clé du noyau`).toContain(cle);
      expect(t.hex).toMatch(/^#[0-9A-F]{6}$/);
      expect(t.d.length, `${cle} · tracé vide`).toBeGreaterThan(40);
    }
  });
});

describe('fond de pastille · une teinte trop pâle passe sur sa teinte', () => {
  it('Snapchat · fantôme à l’encre sur jaune, pas un jaune invisible sur blanc', () => {
    const html = renderToStaticMarkup(<BrandTile name="Snapchat" />);
    expect(html).toContain('background:#FFFC00');
    expect(html).toContain('fill="#111111"');
  });
  it('Shopify · son vert officiel sur blanc', () => {
    const html = renderToStaticMarkup(<BrandTile name="Shopify" />);
    expect(html).toContain('background:#FFFFFF');
    expect(html).toContain('fill="#7AB55C"');
  });
  it('chaque teinte embarquée est soit lisible sur blanc, soit posée sur elle-même', () => {
    for (const [cle, t] of Object.entries(TRACES_SIMPLE_ICONS)) {
      const html = renderToStaticMarkup(<BrandTile name={t.titre} />);
      const lisible = contrasteWcag(t.hex, '#FFFFFF') >= SEUIL_CONTRASTE_PASTILLE;
      // Le nom publié par Simple Icons doit lui-même mener à la clé (MailChimp, Google BigQuery…).
      expect(cleLogoOutil(t.titre), `« ${t.titre} » ne mène pas au logo ${cle}`).toBe(cle);
      expect(html, `${cle} · fond de pastille inattendu`).toContain(lisible ? 'background:#FFFFFF' : `background:${t.hex}`);
    }
  });
});

describe('marque blanche · le fournisseur de données interne n’apparaît jamais', () => {
  it('aucune tuile ne rend son nom ni un logo pour lui', () => {
    const html = renderToStaticMarkup(<BrandTile name="Trendtrack" glyph="Bi" />);
    expect(html).not.toMatch(/trendtrack/i);
    expect(html).not.toContain('<svg');
    expect(html).toContain('data-logo="repli"');
  });
  it('le catalogue rendu ne contient pas son nom', () => {
    const html = CATALOGUE.map((c) => renderToStaticMarkup(<ConnecteurBientot c={c} />)).join('');
    expect(html).not.toMatch(/trendtrack/i);
  });
  it('les fichiers de logos ne contiennent aucun tracé ni nom du fournisseur interne', () => {
    for (const f of ['components/BrandIcons.tsx', 'components/logos-outils.ts']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8');
      expect(src, `${f} cite le fournisseur interne`).not.toMatch(/trendtrack/i);
    }
  });
});
