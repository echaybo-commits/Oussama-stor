import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

interface ServerSecrets {
  encryptionKeyHex: string;
  sessionSecretHex: string;
}

const SECRETS_FILE = path.resolve(process.cwd(), '.youstor_secrets.json');

function loadOrCreateSecrets(): ServerSecrets {
  const envEnc = process.env.ENCRYPTION_SECRET;
  const envSess = process.env.SESSION_SECRET;

  if (envEnc && envSess && !envEnc.startsWith('CHANGE_ME') && !envSess.startsWith('CHANGE_ME')) {
    return {
      encryptionKeyHex: crypto.createHash('sha256').update(envEnc).digest('hex'),
      sessionSecretHex: crypto.createHash('sha256').update(envSess).digest('hex'),
    };
  }

  if (fs.existsSync(SECRETS_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8')) as ServerSecrets;
      if (raw.encryptionKeyHex && raw.sessionSecretHex) {
        return raw;
      }
    } catch {
      // Regenerate below if unreadable
    }
  }

  const generated: ServerSecrets = {
    encryptionKeyHex: crypto.randomBytes(32).toString('hex'),
    sessionSecretHex: crypto.randomBytes(32).toString('hex'),
  };
  fs.writeFileSync(SECRETS_FILE, JSON.stringify(generated, null, 2), { mode: 0o600 });
  return generated;
}

const secrets = loadOrCreateSecrets();
const MASTER_KEY = Buffer.from(secrets.encryptionKeyHex, 'hex');
const SESSION_KEY = Buffer.from(secrets.sessionSecretHex, 'hex');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export interface EncryptedPayload {
  encryptedValue: string;
  iv: string;
  authTag: string;
  keyPrefix: string;
}

export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 10) {
    return `${plaintext.slice(0, 3)}••••${plaintext.slice(-2)}`;
  }
  return `${plaintext.slice(0, 9)}••••${plaintext.slice(-4)}`;
}

export function encryptKey(plaintext: string): EncryptedPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedValue: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyPrefix: maskSecret(plaintext),
  };
}

export function decryptKey(encryptedValue: string, ivBase64: string, authTagBase64: string): string {
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  const encrypted = Buffer.from(encryptedValue, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export function generateApiKey(prefix = 'yst_live_'): string {
  return `${prefix}${crypto.randomBytes(18).toString('hex')}`;
}

export interface SessionPayload {
  userId: number;
  email: string;
  name: string;
  exp: number;
}

export function signSessionToken(payload: SessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_KEY).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', SESSION_KEY).update(encoded).digest('base64url');
    const sigBuf = Buffer.from(sig, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.exp || Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

const ARABIC_TRANSLITERATION: Record<string, string> = {
  أ: 'a', إ: 'i', آ: 'a', ا: 'a', ب: 'b', ت: 't', ث: 'th', ج: 'j',
  ح: 'h', خ: 'kh', د: 'd', ذ: 'dh', ر: 'r', ز: 'z', س: 's', ش: 'sh',
  ص: 's', ض: 'd', ط: 't', ظ: 'z', ع: 'a', غ: 'gh', ف: 'f', ق: 'q',
  ك: 'k', ل: 'l', م: 'm', ن: 'n', ه: 'h', ة: 'a', و: 'w', ي: 'y',
  ى: 'a', ئ: 'e', ؤ: 'o',
};

export function slugifyStoreName(name: string): string {
  const normalized = name.trim().toLowerCase();
  let out = '';
  for (const ch of normalized) {
    if (ARABIC_TRANSLITERATION[ch]) {
      out += ARABIC_TRANSLITERATION[ch];
    } else if (/[a-z0-9]/.test(ch)) {
      out += ch;
    } else if (/[\s\-_.]/.test(ch)) {
      out += '-';
    }
  }
  const cleaned = out.replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 36);
  if (cleaned.length >= 3) {
    return cleaned;
  }
  return `store-${crypto.randomBytes(3).toString('hex')}`;
}

export function generateUniqueStoreSlug(name: string, existsFn: (slug: string) => boolean): string {
  const base = slugifyStoreName(name);
  if (!existsFn(base)) {
    return base;
  }
  for (let i = 2; i < 50; i++) {
    const candidate = `${base}-${i}`;
    if (!existsFn(candidate)) {
      return candidate;
    }
  }
  return `${base}-${crypto.randomBytes(2).toString('hex')}`;
}
