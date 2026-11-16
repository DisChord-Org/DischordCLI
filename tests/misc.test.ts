import { afterEach, beforeEach, expect, test } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { matchesQuery } from '../src/Commands/package/search';
import { ChordSourceError, resolveChordSource } from '../src/Commands/compile';
import { compareVersionTags } from '../src/Utils/libraries/formatPackage';
import { type PackageResponse, TrustLevel } from '../src/Utils/libraries/types';
import { createThrottledProgressEmitter } from '../src/Utils/ndjson';
import { pathContains } from '../src/Utils/pathSetup';
import { updateAvailable } from '../src/Utils/utils';

const library: PackageResponse = {
    name: 'ent',
    version: 'v1.0.3',
    description: 'Entity helpers for bots',
    trustLevel: TrustLevel.Official,
    repository: 'https://github.com/DisChord-Org/ent',
    isAudited: true,
    versions: {}
};

let tmp: string;

beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chord-misc-')));
});

afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
});

test('updateAvailable compares semantic versions', () => {
    expect(updateAvailable('1.7.6', '1.7.7')).toBe('update-available');
    expect(updateAvailable('1.7.7', '1.7.7')).toBe('up-to-date');
    expect(updateAvailable('1.8.0', '1.7.7')).toBe('up-to-date');
    expect(updateAvailable('1.7.7\n', '1.7.7')).toBe('up-to-date');
    expect(updateAvailable('', '1.7.7')).toBe('update-available');
    expect(updateAvailable('garbage', '1.7.7')).toBe('update-available');
});

test('compareVersionTags sorts versions and never throws on junk', () => {
    expect(['v1.10.0', 'v1.2.0', 'junk', 'v1.9.0'].sort(compareVersionTags)).toEqual(['junk', 'v1.2.0', 'v1.9.0', 'v1.10.0']);
});

test('matchesQuery searches name, description, repository, trust level and version', () => {
    expect(matchesQuery(library, 'EN')).toBe(true);
    expect(matchesQuery(library, 'helpers')).toBe(true);
    expect(matchesQuery(library, 'dischord-org')).toBe(true);
    expect(matchesQuery(library, 'offi')).toBe(true);
    expect(matchesQuery(library, '1.0.3')).toBe(true);
    expect(matchesQuery(library, 'v1.0.4')).toBe(false);
    expect(matchesQuery(library, 'nothing')).toBe(false);
});

test('matchesQuery tolerates packages with missing fields', () => {
    const sparse = { name: 'good', version: '1.0.0' } as PackageResponse;

    expect(matchesQuery(sparse, 'goo')).toBe(true);
    expect(matchesQuery(sparse, 'zzz')).toBe(false);
});

test('pathContains compares whole entries, ignoring trailing separators', () => {
    expect(pathContains(['/usr/bin', '/home/u/.local/bin/'].join(path.delimiter), '/home/u/.local/bin')).toBe(true);
    expect(pathContains(['/usr/bin', '/home/u/.local/bin-old'].join(path.delimiter), '/home/u/.local/bin')).toBe(false);
    expect(pathContains(undefined, '/home/u/.local/bin')).toBe(false);
    expect(pathContains('C:\\a;"C:\\b\\"', 'C:\\b', ';')).toBe(true);
});

test('the throttled progress emitter only emits when the whole percentage changes', () => {
    const emitted: number[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);

    process.stdout.write = ((chunk: string) => {
        emitted.push(JSON.parse(chunk).percent);
        return true;
    }) as typeof process.stdout.write;

    try {
        const emit = createThrottledProgressEmitter(percent => ({ percent: Math.floor(percent) }));

        for (const transferred of [0, 1, 4, 10, 14, 19, 20, 200]) emit({ total: 200, transferred });
        emit({ total: 0, transferred: 50 });
    } finally {
        process.stdout.write = originalWrite;
    }

    expect(emitted).toEqual([0, 2, 5, 7, 9, 10, 100, 0]);
});

test('resolveChordSource accepts a file in src, the src folder or the project root', () => {
    const src = path.join(tmp, 'src');
    const file = path.join(src, 'index.chord');

    fs.mkdirSync(src);
    fs.writeFileSync(file, '');

    for (const arg of [file, src, tmp]) {
        expect(resolveChordSource(arg)).toEqual({ filePath: file, sourceDir: src, projectRoot: tmp });
    }
});

test('resolveChordSource rejects missing paths, other extensions and files outside src', () => {
    fs.mkdirSync(path.join(tmp, 'src'));
    fs.mkdirSync(path.join(tmp, 'other'));
    fs.writeFileSync(path.join(tmp, 'src', 'index.js'), '');
    fs.writeFileSync(path.join(tmp, 'other', 'index.chord'), '');

    expect(() => resolveChordSource(path.join(tmp, 'missing.chord'))).toThrow(ChordSourceError);
    expect(() => resolveChordSource(path.join(tmp, 'src', 'index.js'))).toThrow(ChordSourceError);
    expect(() => resolveChordSource(path.join(tmp, 'other', 'index.chord'))).toThrow(ChordSourceError);
    expect(() => resolveChordSource(tmp)).toThrow(ChordSourceError);
});
