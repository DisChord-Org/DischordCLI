import { afterEach, beforeEach, expect, test } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';

import LibraryAPIManager from '../src/Utils/libraries/LibraryAPIManager';
import { ManifestError, assertManifestDescribes, parseManifest } from '../src/Utils/libraries/PackageManifest';
import RegistryState from '../src/Utils/libraries/RegistryState';
import { decideInstall } from '../src/Utils/libraries/TrustPolicy';
import { TrustLevel } from '../src/Utils/libraries/types';

const SHA = 'a'.repeat(64);
const MANIFEST = { schema: 1, name: 'ent', version: 'v1.0.0', sha256: SHA, trustLevel: TrustLevel.Official, isAudited: true };

const originalStatePath = RegistryState.StatePath;
let tmp: string;

beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chord-trust-'));
    RegistryState.StatePath = path.join(tmp, 'nested', 'registry-state.json');
});

afterEach(() => {
    RegistryState.StatePath = originalStatePath;
    fs.rmSync(tmp, { recursive: true, force: true });
});

test('decideInstall follows the trust policy table', () => {
    expect(decideInstall(TrustLevel.Official, true)).toBe('install');
    expect(decideInstall(TrustLevel.Official, false)).toBe('reject');
    expect(decideInstall(TrustLevel.Trust, true)).toBe('install');
    expect(decideInstall(TrustLevel.Trust, false)).toBe('consent');
    expect(decideInstall(TrustLevel.Unknown, true)).toBe('consent');
    expect(decideInstall(TrustLevel.Unknown, false)).toBe('consent');
});

test('decideInstall treats a level it does not know as Unknown', () => {
    expect(decideInstall(99 as TrustLevel, true)).toBe('consent');
    expect(decideInstall(undefined as unknown as TrustLevel, true)).toBe('consent');
});

test('parseManifest accepts a well-formed manifest and normalizes the hash', () => {
    expect(parseManifest(JSON.stringify({ ...MANIFEST, sha256: SHA.toUpperCase() }))).toEqual(MANIFEST);
});

test('parseManifest rejects malformed manifests and unknown schemas', () => {
    const invalid = [
        'not json',
        'null',
        '[]',
        JSON.stringify({ ...MANIFEST, schema: 2 }),
        JSON.stringify({ ...MANIFEST, name: 42 }),
        JSON.stringify({ ...MANIFEST, sha256: 'short' }),
        JSON.stringify({ ...MANIFEST, trustLevel: 7 }),
        JSON.stringify({ ...MANIFEST, trustLevel: 'Official' }),
        JSON.stringify({ ...MANIFEST, isAudited: 'yes' })
    ];

    for (const text of invalid) expect(() => parseManifest(text)).toThrow(ManifestError);
});

test('assertManifestDescribes ties the manifest to the name, version and archive', () => {
    expect(() => assertManifestDescribes(MANIFEST, 'ent', 'v1.0.0', SHA)).not.toThrow();
    expect(() => assertManifestDescribes(MANIFEST, 'other', 'v1.0.0', SHA)).toThrow(ManifestError);
    expect(() => assertManifestDescribes(MANIFEST, 'ent', 'v2.0.0', SHA)).toThrow(ManifestError);
    expect(() => assertManifestDescribes(MANIFEST, 'ent', 'v1.0.0', 'b'.repeat(64))).toThrow(ManifestError);
});

test('RegistryState remembers that the registry signs manifests', () => {
    expect(RegistryState.requiresSignedManifests()).toBe(false);

    RegistryState.rememberSignedManifests();
    RegistryState.rememberSignedManifests();

    expect(RegistryState.requiresSignedManifests()).toBe(true);
    expect(JSON.parse(fs.readFileSync(RegistryState.StatePath, 'utf8'))).toEqual({ signedManifests: true });
});

test('RegistryState tolerates a corrupt state file', () => {
    fs.mkdirSync(path.dirname(RegistryState.StatePath), { recursive: true });
    fs.writeFileSync(RegistryState.StatePath, '{ not json');

    expect(RegistryState.requiresSignedManifests()).toBe(false);
});

test('verifyDetachedSignature rejects content that the official key did not sign', async () => {
    const content = Buffer.from(JSON.stringify(MANIFEST));

    expect(await LibraryAPIManager.verifyDetachedSignature(content, 'not a signature')).toBe(false);
    expect(await LibraryAPIManager.verifyDetachedSignature(content, '')).toBe(false);
});
