import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { resolvePackageFacts } from '../src/Commands/package/install';
import LibraryAPIManager from '../src/Utils/libraries/LibraryAPIManager';
import RegistryState from '../src/Utils/libraries/RegistryState';
import { type PackageResponse, TrustLevel } from '../src/Utils/libraries/types';

const SHA = 'a'.repeat(64);
const originalStatePath = RegistryState.StatePath;
let tmp: string;

/**
 * Builds the unsigned registry answer for a fake package, claiming to be a signed Official one.
 * @param {string} [sha256] - The archive hash recorded by the registry, if any.
 * @returns {PackageResponse} The registry answer.
 */
function unsignedAnswer (sha256?: string): PackageResponse {
    return {
        name: 'ent',
        version: 'v1.0.0',
        description: '',
        repository: '',
        trustLevel: TrustLevel.Official,
        isAudited: true,
        versions: { 'v1.0.0': { tag: 'v1.0.0', isAudited: true, downloadUrl: '', createdAt: 0, sha256 } }
    };
}

/**
 * Makes the registry answer with the given signed manifest, and the signature check pass or fail.
 * @param {Record<string, unknown> | undefined} manifest - The manifest to serve, or undefined for none.
 * @param {boolean} [validSignature] - Whether its signature verifies.
 * @returns {void}
 */
function serveManifest (manifest: Record<string, unknown> | undefined, validSignature: boolean = true): void {
    spyOn(LibraryAPIManager, 'getSignedManifest').mockResolvedValue(manifest ? { manifest: JSON.stringify(manifest), signature: 'sig' } : undefined);
    spyOn(LibraryAPIManager, 'verifyDetachedSignature').mockResolvedValue(validSignature);
}

beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chord-facts-'));
    RegistryState.StatePath = path.join(tmp, 'registry-state.json');
});

afterEach(() => {
    mock.restore();
    RegistryState.StatePath = originalStatePath;
    fs.rmSync(tmp, { recursive: true, force: true });
});

test('a verified manifest overrides what the unsigned answer claims', async () => {
    serveManifest({ schema: 1, name: 'ent', version: 'v1.0.0', sha256: SHA, trustLevel: TrustLevel.Unknown, isAudited: false });

    expect(await resolvePackageFacts('ent', 'v1.0.0', unsignedAnswer(), SHA)).toEqual({ trustLevel: TrustLevel.Unknown, isSigned: false });
    expect(RegistryState.requiresSignedManifests()).toBe(true);
});

test('a manifest with an invalid signature aborts and is not remembered', async () => {
    serveManifest({ schema: 1, name: 'ent', version: 'v1.0.0', sha256: SHA, trustLevel: TrustLevel.Official, isAudited: true }, false);

    await expect(resolvePackageFacts('ent', 'v1.0.0', unsignedAnswer(), SHA)).rejects.toThrow('no es válida');
    expect(RegistryState.requiresSignedManifests()).toBe(false);
});

test('a valid manifest of another package, version or archive aborts', async () => {
    const manifest = { schema: 1, name: 'ent', version: 'v1.0.0', sha256: SHA, trustLevel: TrustLevel.Official, isAudited: true };

    serveManifest({ ...manifest, name: 'other' });
    await expect(resolvePackageFacts('ent', 'v1.0.0', unsignedAnswer(), SHA)).rejects.toThrow('corresponde a other@v1.0.0');

    serveManifest({ ...manifest, version: 'v0.9.0' });
    await expect(resolvePackageFacts('ent', 'v1.0.0', unsignedAnswer(), SHA)).rejects.toThrow('corresponde a ent@v0.9.0');

    serveManifest(manifest);
    await expect(resolvePackageFacts('ent', 'v1.0.0', unsignedAnswer(), 'b'.repeat(64))).rejects.toThrow('no coincide con el hash del manifiesto');

    expect(RegistryState.requiresSignedManifests()).toBe(false);
});

test('a registry that never signed manifests falls back to its unsigned answer', async () => {
    serveManifest(undefined);

    expect(await resolvePackageFacts('ent', 'v1.0.0', unsignedAnswer(SHA), SHA)).toEqual({ trustLevel: TrustLevel.Official, isSigned: true });
    await expect(resolvePackageFacts('ent', 'v1.0.0', unsignedAnswer(SHA), 'b'.repeat(64))).rejects.toThrow('no coincide con el hash registrado');
    expect(RegistryState.requiresSignedManifests()).toBe(false);
});

test('once manifests were seen, a missing one aborts', async () => {
    RegistryState.rememberSignedManifests();
    serveManifest(undefined);

    await expect(resolvePackageFacts('ent', 'v1.0.0', unsignedAnswer(SHA), SHA)).rejects.toThrow('no ha entregado el manifiesto firmado');
});
