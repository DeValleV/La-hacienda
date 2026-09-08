const encoder = new TextEncoder();
const PBKDF2_ITERATIONS = 310000;
const SESSION_HOURS = 12;

function toBase64(bytes) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function derivePassword(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 10) throw new Error('La contraseña debe tener al menos 10 caracteres.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password, encodedHash) {
  const [algorithm, iterationsText, saltText, hashText] = String(encodedHash).split('$');
  const iterations = Number(iterationsText);
  if (algorithm !== 'pbkdf2_sha256' || !Number.isInteger(iterations) || iterations < 100000 || !saltText || !hashText) return false;
  const expected = fromBase64(hashText);
  const actual = await derivePassword(password, fromBase64(saltText), iterations);
  return constantTimeEqual(actual, expected);
}

export async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return toBase64(new Uint8Array(digest));
}

export function createSessionToken() {
  return toBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function sessionExpiration(now = new Date()) {
  return new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
}

export function readCookie(request, name) {
  const cookies = request.headers.get('Cookie') || '';
  const prefix = `${name}=`;
  const pair = cookies.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return pair ? decodeURIComponent(pair.slice(prefix.length)) : null;
}

export function sessionCookie(token, secure = true) {
  return `lh_session=${encodeURIComponent(token)}; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 60 * 60}`;
}

export function expiredSessionCookie(secure = true) {
  return `lh_session=; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Strict; Path=/; Max-Age=0`;
}
