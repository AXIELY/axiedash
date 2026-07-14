const { webcrypto } = require('node:crypto');

async function generateVapidKeys() {
  const keyPair = await webcrypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true,
    ['sign', 'verify']
  );

  const publicJwk = await webcrypto.subtle.exportKey(
    'jwk',
    keyPair.publicKey
  );

  const privateJwk = await webcrypto.subtle.exportKey(
    'jwk',
    keyPair.privateKey
  );

  if (!publicJwk.x || !publicJwk.y || !privateJwk.d) {
    throw new Error('تعذر استخراج مكونات مفاتيح VAPID');
  }

  const decodeBase64Url = (value) =>
    Buffer.from(value, 'base64url');

  // VAPID public key:
  // 0x04 + X coordinate + Y coordinate
  const rawPublicKey = Buffer.concat([
    Buffer.from([0x04]),
    decodeBase64Url(publicJwk.x),
    decodeBase64Url(publicJwk.y),
  ]);

  const rawPrivateKey = decodeBase64Url(privateJwk.d);

  if (rawPublicKey.length !== 65) {
    throw new Error(
      `طول المفتاح العام غير صحيح: ${rawPublicKey.length}`
    );
  }

  if (rawPrivateKey.length !== 32) {
    throw new Error(
      `طول المفتاح الخاص غير صحيح: ${rawPrivateKey.length}`
    );
  }

  console.log('');
  console.log(
    'VAPID_PUBLIC_KEY=' +
      rawPublicKey.toString('base64url')
  );

  console.log('');
  console.log(
    'VAPID_PRIVATE_KEY=' +
      rawPrivateKey.toString('base64url')
  );

  console.log('');
}

generateVapidKeys().catch((error) => {
  console.error('VAPID_GENERATION_FAILED');
  console.error(error);
  process.exitCode = 1;
});