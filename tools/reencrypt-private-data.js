// Re-encrypt functions/_data/private-data.json with a NEW admin key, WITHOUT re-pulling Notion.
// Strategy: decrypt existing ciphertext with the OLD key (same AES-256-GCM scheme as the API),
// re-encrypt with the NEW key, keep the JSON file shape { v, iv, data } identical to sync-notion.js output.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OLD_KEY = process.argv[2]; // e.g. 520hd123
const NEW_KEY = process.argv[3]; // e.g. 520hd123@CXH
if (!OLD_KEY || !NEW_KEY) {
  console.error('usage: node tools/reencrypt-private-data.js <oldKey> <newKey>');
  process.exit(2);
}

const FILE = path.join(__dirname, '..', 'functions', '_data', 'private-data.json');

function keyOf(k) {
  return crypto.createHash('sha256').update(String(k), 'utf8').digest();
}

function decrypt(file, key) {
  const enc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const iv = Buffer.from(enc.iv, 'base64');
  const data = Buffer.from(enc.data, 'base64');
  // WebCrypto decrypt expects ciphertext + 16-byte tag appended at the end
  const tag = data.subarray(data.length - 16);
  const ct = data.subarray(0, data.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', keyOf(key), iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
}

function encrypt(obj, key) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyOf(key), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return { v: 1, iv: iv.toString('base64'), data: Buffer.concat([ct, c.getAuthTag()]).toString('base64') };
}

const plain = decrypt(FILE, OLD_KEY);
console.log('decrypted with old key: games=' + Object.keys(plain.games || {}).length + ' collections=' + Object.keys(plain.collections || {}).length);
// rotate: stamp a note so future audits can see the rotation
plain.rotatedAt = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
const enc = encrypt(plain, NEW_KEY);
fs.writeFileSync(FILE, JSON.stringify(enc), 'utf8');
console.log('re-encrypted with new key, wrote ' + FILE + ' (' + fs.statSync(FILE).size + ' bytes)');
