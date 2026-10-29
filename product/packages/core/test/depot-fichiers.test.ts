import { describe, expect, it } from 'vitest';
import {
  FORMATS_LOGO, MESSAGES_REFUS_DEPOT, MESSAGES_REFUS_LOGO, PLAFONDS_DEPOT, POIDS_MAX_LOGO, TYPE_DEPOT_NEUTRE,
  decisionDepot, logoTransmissible, nomFichierDepot, refusAdresseLogo, refusCharteLogos,
} from '../src';

/**
 * Dépôt de fichiers et adresses de logo · on lit la DÉCISION rendue (type
 * signé, extension, nom de clé, message), jamais la présence d'un appel.
 */
const accepte = (nom: string, type: string, taille = 10) => {
  const d = decisionDepot({ nom, type, taille });
  if (!d.ok) throw new Error(`refusé : ${nom} ${type} · ${d.erreur}`);
  return d;
};
const refuse = (nom: string, type: string, taille = 10) => {
  const d = decisionDepot({ nom, type, taille });
  return d.ok ? null : d.erreur;
};

describe('decisionDepot · la liste blanche des appelants réels', () => {
  it('Bibliothèque et logo · chaque type servi garde son type et impose son extension', () => {
    expect(accepte('photo.png', 'image/png')).toMatchObject({ contentType: 'image/png', extension: 'png', famille: 'image', nomFichier: 'photo.png' });
    expect(accepte('photo.jpeg', 'image/jpeg')).toMatchObject({ contentType: 'image/jpeg', nomFichier: 'photo.jpg' });
    expect(accepte('a.webp', 'image/webp').contentType).toBe('image/webp');
    expect(accepte('a.gif', 'image/gif').contentType).toBe('image/gif');
    expect(accepte('a.mp4', 'video/mp4')).toMatchObject({ contentType: 'video/mp4', famille: 'video' });
    expect(accepte('a.mov', 'video/quicktime').extension).toBe('mov');
    expect(accepte('a.webm', 'video/webm').contentType).toBe('video/webm');
    expect(accepte('a.mp3', 'audio/mpeg')).toMatchObject({ contentType: 'audio/mpeg', famille: 'audio' });
    expect(accepte('a.m4a', 'audio/x-m4a').contentType).toBe('audio/mp4');
    expect(accepte('a.heic', 'image/heic').contentType).toBe('image/heic');
    // Les formats du logo sont tous acceptés, avec leur propre type.
    for (const t of FORMATS_LOGO) expect(accepte('logo', t, POIDS_MAX_LOGO).contentType).toBe(t);
  });

  it('PDF et média rare du sélecteur · acceptés, déposés en type neutre', () => {
    expect(accepte('devis.pdf', 'application/pdf')).toMatchObject({ contentType: TYPE_DEPOT_NEUTRE, extension: 'pdf', famille: 'document', nomFichier: 'devis.pdf' });
    expect(accepte('scan.tiff', 'image/tiff')).toMatchObject({ contentType: TYPE_DEPOT_NEUTRE, extension: 'bin', famille: 'image' });
    expect(accepte('voix.ogg', 'audio/ogg')).toMatchObject({ contentType: TYPE_DEPOT_NEUTRE, famille: 'audio' });
  });

  it('SVG, HTML, XML, script, texte, archive · refusés', () => {
    for (const t of ['image/svg+xml', 'text/html', 'application/xhtml+xml', 'text/xml', 'application/xml', 'text/javascript',
      'application/javascript', 'text/plain', 'application/zip', 'application/x-shockwave-flash', 'image/svg', 'nimporte', 'image/', 'text/html, image/png']) {
      expect(refuse('x.png', t), t).toBe(MESSAGES_REFUS_DEPOT.type);
    }
  });

  it('contournements · casse, paramètres, alias ramenés au type canonique ; jamais un SVG déguisé', () => {
    expect(accepte('a.png', 'IMAGE/PNG').contentType).toBe('image/png');
    expect(accepte('a.png', 'image/png; charset=utf-8').contentType).toBe('image/png');
    expect(accepte('a.jpg', ' Image/JPG ').contentType).toBe('image/jpeg');
    expect(refuse('a.png', 'IMAGE/SVG+XML')).toBe(MESSAGES_REFUS_DEPOT.type);
    expect(refuse('a.png', 'image/svg+xml; charset=utf-8')).toBe(MESSAGES_REFUS_DEPOT.type);
    expect(refuse('a.png', 'TEXT/HTML;charset=utf-8')).toBe(MESSAGES_REFUS_DEPOT.type);
    // Casse ramenée AVANT les comparaisons propres au dépôt (PDF, type neutre).
    expect(accepte('devis.pdf', 'APPLICATION/PDF')).toMatchObject({ contentType: TYPE_DEPOT_NEUTRE, famille: 'document' });
    expect(accepte('IMG_0001.HEIC', 'Application/Octet-Stream').contentType).toBe('image/heic');
  });

  it('double extension · l’extension vient du TYPE, jamais du nom', () => {
    expect(accepte('photo.html.png', 'image/png').nomFichier).toBe('photo-html.png');
    expect(accepte('logo.png.svg', 'image/png').nomFichier).toBe('logo-png.png');
    expect(accepte('page.html', 'image/png').nomFichier).toBe('page.png');
    expect(accepte('Été 2026 (v2).JPG', 'image/jpeg').nomFichier).toBe('ete-2026-v2.jpg');
    expect(accepte('../../x', 'image/png').nomFichier).toBe('x.png');
    expect(nomFichierDepot('...', 'png')).toBe('fichier.png');
  });

  it('sans type déclaré · reconnu par l’extension de la liste, sinon refusé', () => {
    expect(accepte('IMG_0001.HEIC', '').contentType).toBe('image/heic');
    expect(accepte('clip.mov', TYPE_DEPOT_NEUTRE).contentType).toBe('video/quicktime');
    expect(accepte('doc.pdf', '').contentType).toBe(TYPE_DEPOT_NEUTRE);
    expect(refuse('page.html', '')).toBe(MESSAGES_REFUS_DEPOT.type);
    expect(refuse('logo.svg', TYPE_DEPOT_NEUTRE)).toBe(MESSAGES_REFUS_DEPOT.type);
    expect(refuse('sans-extension', '')).toBe(MESSAGES_REFUS_DEPOT.type);
  });

  it('plafonds MESURÉS · 64 Mio pour une image, 1 Go ailleurs (valeurs écrites en clair, pas relues du module)', () => {
    expect(accepte('a.png', 'image/png', 67_108_864).ok).toBe(true);
    expect(refuse('a.png', 'image/png', 67_108_865)).toBe('Image trop lourde (64 Mo au plus).');
    expect(accepte('a.mp4', 'video/mp4', 1_073_741_824).ok).toBe(true);
    expect(refuse('a.mp4', 'video/mp4', 1_073_741_825)).toBe('Vidéo trop lourde (1 Go au plus).');
  });

  it('plafonds par famille · à la limite accepté, un octet de plus refusé', () => {
    expect(accepte('a.png', 'image/png', PLAFONDS_DEPOT.image).ok).toBe(true);
    expect(refuse('a.png', 'image/png', PLAFONDS_DEPOT.image + 1)).toBe('Image trop lourde (64 Mo au plus).');
    expect(accepte('a.mp4', 'video/mp4', PLAFONDS_DEPOT.video).ok).toBe(true);
    expect(refuse('a.mp4', 'video/mp4', PLAFONDS_DEPOT.video + 1)).toBe('Vidéo trop lourde (1 Go au plus).');
    expect(refuse('a.mp3', 'audio/mpeg', PLAFONDS_DEPOT.audio + 1)).toBe('Son trop lourd (1 Go au plus).');
    expect(refuse('a.pdf', 'application/pdf', PLAFONDS_DEPOT.document + 1)).toBe('Fichier trop lourd (1 Go au plus).');
    // Le plafond d'un média rare est celui de sa famille.
    expect(refuse('a.tiff', 'image/tiff', PLAFONDS_DEPOT.image + 1)).toBe('Image trop lourde (64 Mo au plus).');
    // Le logo (4 Mo côté client) tient sous le plafond image.
    expect(POIDS_MAX_LOGO).toBeLessThan(PLAFONDS_DEPOT.image);
  });

  it('taille et nom invalides · refusés', () => {
    expect(refuse('a.png', 'image/png', 0)).toBe(MESSAGES_REFUS_DEPOT.vide);
    for (const t of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(refuse('a.png', 'image/png', t)).toBe(MESSAGES_REFUS_DEPOT.invalide);
    expect(refuse('', 'image/png')).toBe(MESSAGES_REFUS_DEPOT.invalide);
    expect(decisionDepot({ nom: 'a.png', type: undefined as unknown as string, taille: 1 })).toEqual({ ok: false, erreur: MESSAGES_REFUS_DEPOT.invalide });
  });
});

describe('refusAdresseLogo · https public seulement', () => {
  it('accepte une adresse https publique', () => {
    for (const a of ['https://cdn.shopify.com/s/files/logo.png', 'https://exemple.fr/logo.webp?v=2', 'https://maison-été.fr/l.png', ' https://a.b.co/l.png ']) {
      expect(refusAdresseLogo(a), a).toBeNull();
    }
  });
  it('refuse les schémas autres que https', () => {
    for (const a of ['http://exemple.fr/logo.png', 'javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:image/png;base64,AAAA', 'data:image/svg+xml,<svg/>', 'file:///etc/passwd', 'ftp://exemple.fr/l.png', 'blob:https://exemple.fr/x']) {
      expect(refusAdresseLogo(a), a).toBe(MESSAGES_REFUS_LOGO.schema);
    }
  });
  it('refuse les identifiants dans l’adresse', () => {
    for (const a of ['https://user@exemple.fr/l.png', 'https://user:mdp@exemple.fr/l.png', 'https://exemple.fr@169.254.169.254/l.png']) {
      expect(refusAdresseLogo(a), a).toBe(MESSAGES_REFUS_LOGO.identifiants);
    }
  });
  it('refuse IP littérales (toutes formes), localhost et noms internes', () => {
    for (const a of ['https://127.0.0.1/l.png', 'https://169.254.169.254/latest/meta-data', 'https://10.0.0.5/l.png', 'https://8.8.8.8/l.png',
      'https://0x7f.1/l.png', 'https://2130706433/l.png', 'https://0177.0.0.1/l.png', 'https://[::1]/l.png', 'https://[::ffff:127.0.0.1]/l.png',
      'https://[fe80::1]/l.png', 'https://[2001:db8::1]/l.png', 'https://localhost/l.png', 'https://LOCALHOST./l.png', 'https://api.localhost/l.png',
      'https://imprimante.local/l.png', 'https://metadata.google.internal/l.png', 'https://redis/l.png', 'https://box.home.arpa/l.png']) {
      expect(refusAdresseLogo(a), a).toBe(MESSAGES_REFUS_LOGO.hote);
    }
  });
  it('refuse un port non standard et une adresse illisible', () => {
    expect(refusAdresseLogo('https://exemple.fr:8443/l.png')).toBe(MESSAGES_REFUS_LOGO.port);
    expect(refusAdresseLogo('https://exemple.fr:443/l.png')).toBeNull(); // le port par défaut est retiré par l'analyseur
    for (const a of ['', '   ', 'logo.png', '//exemple.fr/l.png', 'https://']) expect(refusAdresseLogo(a), a).toBe(MESSAGES_REFUS_LOGO.illisible);
  });
});

describe('refusCharteLogos · seules les adresses nouvelles sont contrôlées', () => {
  const ANCIENNE = 'http://ancien-site.fr/logo.png';
  it('une adresse déjà enregistrée, même invalide, peut être renvoyée', () => {
    expect(refusCharteLogos({ logoUrl: ANCIENNE, logos: [ANCIENNE] }, [ANCIENNE])).toBeNull();
    expect(refusCharteLogos({ logoUrl: 'https://neuf.fr/l.png', logos: [ANCIENNE, 'https://neuf.fr/l.png'] }, [ANCIENNE])).toBeNull();
  });
  it('une adresse nouvelle invalide est refusée, en défaut comme en variante', () => {
    expect(refusCharteLogos({ logoUrl: 'javascript:alert(1)', logos: [] }, [])).toBe(MESSAGES_REFUS_LOGO.schema);
    expect(refusCharteLogos({ logoUrl: '', logos: ['https://127.0.0.1/x.png'] }, [ANCIENNE])).toBe(MESSAGES_REFUS_LOGO.hote);
    expect(refusCharteLogos({ logoUrl: '', logos: [] }, [])).toBeNull();
  });
  it('un objet du bucket de CET espace est admis, celui d’un autre espace non', () => {
    const bucket = { base: 'http://127.0.0.1:3299/tt', espace: 'ws-a' };
    expect(refusCharteLogos({ logoUrl: 'http://127.0.0.1:3299/tt/assets/ws-a/1-logo.png', logos: [] }, [], bucket)).toBeNull();
    expect(refusCharteLogos({ logoUrl: 'http://127.0.0.1:3299/tt/assets/ws-b/1-logo.png', logos: [] }, [], bucket)).toBe(MESSAGES_REFUS_LOGO.schema);
  });
});

describe('logoTransmissible · lecture pour les fournisseurs', () => {
  it('écarte une adresse enregistrée invalide, garde https public, image embarquée et objet de l’espace', () => {
    expect(logoTransmissible('https://cdn.exemple.fr/l.png')).toBe(true);
    expect(logoTransmissible('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(logoTransmissible('http://127.0.0.1:3299/tt/assets/ws-a/l.png', { base: 'http://127.0.0.1:3299/tt', espace: 'ws-a' })).toBe(true);
    for (const a of ['http://exemple.fr/l.png', 'https://169.254.169.254/x', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'https://user@exemple.fr/l.png', '', null, undefined]) {
      expect(logoTransmissible(a), String(a)).toBe(false);
    }
  });
});
