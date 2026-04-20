import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;
const TOTP_WINDOW = 1;

const normalizeSecret = (secret: string) => secret.replace(/\s+/g, '').toUpperCase();
const normalizeToken = (token: string) => token.replace(/\s+/g, '');
const normalizeBackupCode = (code: string) => code.replace(/[^A-Z0-9]/gi, '').toUpperCase();

const base32Encode = (buffer: Buffer) => {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
};

const base32Decode = (value: string) => {
  const secret = normalizeSecret(value);
  let bits = 0;
  let current = 0;
  const output: number[] = [];

  for (const char of secret) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      continue;
    }

    current = (current << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((current >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
};

const formatSecret = (secret: string) => normalizeSecret(secret).match(/.{1,4}/g)?.join(' ') ?? secret;

const generateHotp = (secret: string, counter: number) => {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binaryCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binaryCode % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
};

export const generateTwoFactorSecret = () => {
  const secret = base32Encode(crypto.randomBytes(20));
  return {
    secret,
    formattedSecret: formatSecret(secret),
  };
};

export const verifyTotpToken = (secret: string, token: string) => {
  const normalizedToken = normalizeToken(token);
  if (!/^\d{6}$/.test(normalizedToken)) {
    return false;
  }

  const currentCounter = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
    if (generateHotp(secret, currentCounter + offset) === normalizedToken) {
      return true;
    }
  }

  return false;
};

export const generateOtpAuthUri = (options: {
  secret: string;
  accountName: string;
  issuer: string;
}) => {
  const label = encodeURIComponent(`${options.issuer}:${options.accountName}`);
  const issuer = encodeURIComponent(options.issuer);
  return `otpauth://totp/${label}?secret=${options.secret}&issuer=${issuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
};

export const generateBackupCodes = (count: number) =>
  Array.from({ length: count }, () => {
    const code = crypto.randomBytes(5).toString('hex').slice(0, 10).toUpperCase();
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  });

export const hashBackupCode = (code: string, pepper: string) =>
  crypto.createHash('sha256').update(`${normalizeBackupCode(code)}:${pepper}`).digest('hex');

export const consumeBackupCode = (codes: string[], input: string, pepper: string) => {
  const hash = hashBackupCode(input, pepper);
  const index = codes.findIndex((code) => code === hash);

  if (index === -1) {
    return null;
  }

  return codes.filter((_, currentIndex) => currentIndex !== index);
};
