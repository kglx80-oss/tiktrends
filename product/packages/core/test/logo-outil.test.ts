import { describe, it, expect } from 'vitest';
import {
  cleLogoOutil, pastilleLogo, encreMonogramme, contrasteWcag, SEUIL_CONTRASTE_PASTILLE,
} from '../src/logo-outil';

/**
 * Lot A (#120) · quel logo pour quel outil, et sur quel fond.
 *
 * On teste la RÈGLE pure · la valeur retournée pour chaque nom réellement
 * affiché à l'écran (catalogue Connexions, fiche marque, Réglages).
 */

describe('cleLogoOutil · chaque outil reçoit SON logo, pas celui de sa maison mère', () => {
  const ATTENDU: Array<[string, string]> = [
    ['Meta Ads', 'meta'], ['Meta', 'meta'], ['Shopify', 'shopify'], ['Google Drive', 'googledrive'],
    ['TikTok Ads', 'tiktok'], ['Google Ads', 'googleads'], ['Snapchat Ads', 'snapchat'], ['Reddit Ads', 'reddit'],
    ['Pinterest Ads', 'pinterest'], ['LinkedIn Ads', 'linkedin'],
    ['Google Analytics', 'googleanalytics'], ['Search Console', 'googlesearchconsole'], ['Google BigQuery', 'googlebigquery'],
    ['Snowflake', 'snowflake'], ['Stripe', 'stripe'], ['HubSpot', 'hubspot'], ['Intercom', 'intercom'],
    ['Mailchimp', 'mailchimp'], ['Zendesk', 'zendesk'],
    ['Facebook', 'facebook'], ['Instagram', 'instagram'], ['LinkedIn', 'linkedin'], ['X (Twitter)', 'x'],
    ['YouTube', 'youtube'], ['Snapchat', 'snapchat'], ['Figma', 'figma'], ['Notion', 'notion'], ['Dropbox', 'dropbox'],
    ['Confluence', 'confluence'], ['Gmail', 'gmail'], ['Google Sheets', 'googlesheets'], ['Google Docs', 'googledocs'],
    ['Slack', 'slack'], ['Anthropic', 'anthropic'], ['  google   drive ', 'googledrive'],
  ];
  for (const [nom, cle] of ATTENDU) {
    it(`« ${nom} » → ${cle}`, () => {
      expect(cleLogoOutil(nom), `« ${nom} » doit recevoir le logo ${cle}`).toBe(cle);
    });
  }

  it('un produit Google ne retombe JAMAIS sur le « G » générique', () => {
    for (const nom of ['Google Ads', 'Google Analytics', 'Search Console', 'Google BigQuery', 'Google Sheets', 'Google Docs', 'Gmail', 'Google Drive']) {
      expect(cleLogoOutil(nom), `« ${nom} » a pris le logo générique de Google`).not.toBe('google');
    }
  });
});

describe('cleLogoOutil · repli explicite quand aucun tracé officiel n’est embarqué', () => {
  const SANS_TRACE = ['Amplitude', 'Triple Whale', 'Salesforce', 'Pipedrive', 'Klaviyo', 'Higgsfield',
    'OneDrive', 'SharePoint', 'Outlook', 'Excel', 'Canva', 'Fal.ai', 'Kling', '', null, undefined];
  for (const nom of SANS_TRACE) {
    it(`« ${String(nom)} » → aucun logo (repli)`, () => {
      expect(cleLogoOutil(nom), `« ${String(nom)} » a reçu un logo sans tracé officiel`).toBeNull();
    });
  }
  it('un nom qui COMMENCE comme un outil connu ne lui vole pas son logo', () => {
    expect(cleLogoOutil('Metabase')).toBeNull();
    expect(cleLogoOutil('Xero')).toBeNull();
    expect(cleLogoOutil('Google Tag Manager')).toBeNull();
  });
});

describe('marque blanche · le fournisseur de données interne n’a jamais de logo', () => {
  // « Shopify · Trendtrack » commence comme Shopify · sans le garde-fou, il
  // emprunterait le logo Shopify pour désigner le fournisseur interne.
  for (const nom of ['Trendtrack', 'TrendTrack Ads', 'trend track', 'Meta · Trendtrack', 'Shopify · Trendtrack']) {
    it(`« ${nom} » → null`, () => {
      expect(cleLogoOutil(nom), 'le fournisseur interne a reçu un logo').toBeNull();
    });
  }
});

describe('pastilleLogo · une teinte trop pâle pour le blanc passe sur sa propre teinte', () => {
  it('Snapchat, Mailchimp, Intercom · pastille de leur teinte, logo à l’encre', () => {
    expect(pastilleLogo('#FFFC00')).toEqual({ fond: '#FFFC00', trait: '#111111' });
    expect(pastilleLogo('#FFE01B')).toEqual({ fond: '#FFE01B', trait: '#111111' });
    expect(pastilleLogo('#6AFDEF')).toEqual({ fond: '#6AFDEF', trait: '#111111' });
  });
  it('Shopify, Snowflake, Meta · logo dans sa teinte officielle sur blanc', () => {
    expect(pastilleLogo('#7AB55C')).toEqual({ fond: '#FFFFFF', trait: '#7AB55C' });
    expect(pastilleLogo('#29B5E8')).toEqual({ fond: '#FFFFFF', trait: '#29B5E8' });
    expect(pastilleLogo('#0467DF')).toEqual({ fond: '#FFFFFF', trait: '#0467DF' });
  });
  it('le seuil tombe dans le trou MESURÉ · au-dessus des teintes pâles, sous les autres', () => {
    // Tableau mesuré dans le module · 1,32 (Mailchimp) … 2,15 (Canva).
    expect(contrasteWcag('#FFE01B', '#FFFFFF')).toBeLessThan(SEUIL_CONTRASTE_PASTILLE);
    expect(contrasteWcag('#00C4CC', '#FFFFFF')).toBeGreaterThan(SEUIL_CONTRASTE_PASTILLE);
  });
  it('une couleur illisible ne casse pas la pastille', () => {
    expect(pastilleLogo('rouge')).toEqual({ fond: '#FFFFFF', trait: '#111111' });
  });
});

describe('encreMonogramme · le repli reste lisible sur une teinte pâle', () => {
  it('encre sombre sur jaune, blanche ailleurs (comportement d’avant le lot conservé)', () => {
    expect(encreMonogramme('#FFFC00')).toBe('#111111');
    expect(encreMonogramme('#FFE01B')).toBe('#111111');
    expect(encreMonogramme('#0EA5E9')).toBe('#fff');
    expect(encreMonogramme('#00C4CC')).toBe('#fff');
    expect(encreMonogramme('#3a2e3a')).toBe('#fff');
  });
});
