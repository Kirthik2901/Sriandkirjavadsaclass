/**
 * Symmetric encryption helper for sensitive at-rest values (e.g. manual refund UPI ids).
 * Uses AES-256-GCM. The key is derived from the ENCRYPTION_KEY environment variable so
 * that a rotated secret invalidates old ciphertexts predictably.
 */
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard nonce length
const AUTH_TAG_LENGTH = 16;

/**
 * Derives a stable 32-byte key from the configured secret.
 *
 * @returns {Buffer} The 256-bit encryption key.
 * @throws {Error} If ENCRYPTION_KEY is not configured.
 */
const getKey = () => {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY is not configured');
  }
  return crypto.createHash('sha256').update(String(secret)).digest();
};

/**
 * Encrypts a plaintext string.
 *
 * @param {string} plainText - Value to encrypt.
 * @returns {string} Encoded ciphertext in the form iv:authTag:cipher (hex).
 */
const encrypt = (plainText) => {
  if (plainText === undefined || plainText === null || plainText === '') {
    return '';
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
};

/**
 * Decrypts a value produced by {@link encrypt}.
 *
 * @param {string} payload - Encoded ciphertext (iv:authTag:cipher hex).
 * @returns {string} The decrypted plaintext, or '' when input is empty.
 * @throws {Error} If the payload is malformed or authentication fails.
 */
const decrypt = (payload) => {
  if (!payload) {
    return '';
  }

  const parts = String(payload).split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted payload');
  }

  const [ivHex, authTagHex, cipherHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(cipherHex, 'hex');

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Malformed encrypted payload');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  return decrypted.toString('utf8');
};

/**
 * Masks a UPI id for safe display (e.g. abc***@bank).
 *
 * @param {string} upiId - Raw UPI id.
 * @returns {string} Masked representation.
 */
const maskUpiId = (upiId) => {
  if (!upiId || typeof upiId !== 'string') {
    return '';
  }
  return upiId.replace(/(?<=.{3}).(?=.*@)/g, '*');
};

module.exports = { encrypt, decrypt, maskUpiId };
