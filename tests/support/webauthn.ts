import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { isoBase64URL, isoCBOR } from '@simplewebauthn/server/helpers';

type CBORType = Parameters<typeof isoCBOR.encode>[0];

/**
 * Autenticador de software para pruebas (ES256, atestación "none"): hace lo mismo que la huella
 * o el PIN de un celular, con firmas reales que el servidor verifica igual que en producción.
 */
const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest();
const b64 = (data: Uint8Array | string) =>
  isoBase64URL.fromBuffer(
    Uint8Array.from(typeof data === 'string' ? new TextEncoder().encode(data) : data),
  );

interface StoredKey {
  privateKey: KeyObject;
  userHandle: Uint8Array;
  counter: number;
}

export class SoftAuthenticator {
  readonly keys = new Map<string, StoredKey>();

  constructor(
    private readonly origin: string,
    private readonly rpId: string,
  ) {}

  create(
    options: PublicKeyCredentialCreationOptionsJSON,
    overrides: { origin?: string } = {},
  ): RegistrationResponseJSON {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = publicKey.export({ format: 'jwk' });
    const cose = new Map<number, CBORType>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, Uint8Array.from(Buffer.from(jwk.x ?? '', 'base64url'))],
      [-3, Uint8Array.from(Buffer.from(jwk.y ?? '', 'base64url'))],
    ]);
    const credentialId = randomBytes(16);
    const authData = Buffer.concat([
      sha256(this.rpId),
      Buffer.from([0x45]), // UP + UV + datos de credencial
      Buffer.alloc(4), // contador 0
      Buffer.alloc(16), // AAGUID
      Buffer.from([0, credentialId.length]),
      credentialId,
      isoCBOR.encode(cose),
    ]);
    const clientData = JSON.stringify({
      type: 'webauthn.create',
      challenge: options.challenge,
      origin: overrides.origin ?? this.origin,
      crossOrigin: false,
    });
    const attestationObject = isoCBOR.encode(
      new Map<string, CBORType>([
        ['fmt', 'none'],
        ['attStmt', new Map<string, CBORType>()],
        ['authData', Uint8Array.from(authData)],
      ]),
    );
    const id = b64(credentialId);
    this.keys.set(id, {
      privateKey,
      userHandle: isoBase64URL.toBuffer(options.user.id),
      counter: 0,
    });
    return {
      id,
      rawId: id,
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64(clientData),
        attestationObject: b64(attestationObject),
        transports: ['internal'],
      },
    };
  }

  get(
    options: PublicKeyCredentialRequestOptionsJSON,
    overrides: { credentialId?: string; counter?: number; tamper?: boolean } = {},
  ): AuthenticationResponseJSON {
    const id = overrides.credentialId ?? [...this.keys.keys()][0];
    const key = id ? this.keys.get(id) : undefined;
    if (!id || !key) throw new Error('sin llaves en el autenticador de prueba');
    key.counter = overrides.counter ?? key.counter + 1;
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(key.counter);
    const authData = Buffer.concat([sha256(this.rpId), Buffer.from([0x05]), counter]);
    const clientData = JSON.stringify({
      type: 'webauthn.get',
      challenge: options.challenge,
      origin: this.origin,
      crossOrigin: false,
    });
    const signature = sign('sha256', Buffer.concat([authData, sha256(clientData)]), key.privateKey);
    if (overrides.tamper)
      signature.writeUInt8(signature.readUInt8(signature.length - 1) ^ 0xff, signature.length - 1);
    return {
      id,
      rawId: id,
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64(clientData),
        authenticatorData: b64(authData),
        signature: b64(signature),
        userHandle: b64(key.userHandle),
      },
    };
  }
}
