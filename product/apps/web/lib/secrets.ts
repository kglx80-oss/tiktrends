import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Chiffrement AES-256-GCM des secrets (tokens Shopify/Meta) stockés en base.
 * Clé dérivée de TOKEN_ENC_KEY (ou AUTH_SECRET en repli). Jamais de secret en clair en base.
 */
function key(): Buffer {
  const src = process.env.TOKEN_ENC_KEY || process.env.AUTH_SECRET || 'tiktrends-dev-key';
  return createHash('sha256').update(src).digest(); // 32 octets
}

/** Chiffre une valeur → base64 « iv.tag.ciphertext ». */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${ct.toString('base64')}`;
}

/** Déchiffre une valeur produite par encryptSecret. Renvoie '' si invalide. */
export function decryptSecret(enc: string | null | undefined): string {
  if (!enc) return '';
  try {
    const [ivB, tagB, ctB] = enc.split('.');
    if (!ivB || !tagB || !ctB) return '';
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()]).toString('utf8');
  } catch { return ''; }
}

/** Masque un secret pour l'affichage (jamais la valeur complète). */
export function maskSecret(enc: string | null | undefined): string {
  return enc ? '••••••••' : '';
}
