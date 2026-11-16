import { afterEach, beforeEach, expect, test } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';

import LockFile from '../src/Utils/libraries/LockFile';

let tmp: string;
let originalError: typeof console.error;

beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chord-lock-'));
    originalError = console.error;
    console.error = () => undefined;
});

afterEach(() => {
    console.error = originalError;
    fs.rmSync(tmp, { recursive: true, force: true });
});

test('read returns an empty map when there is no lock file', () => {
    expect(LockFile.exists(tmp)).toBe(false);
    expect(LockFile.read(tmp)).toEqual({});
});

test('read parses entries, tolerating CRLF, blank lines and a missing semicolon', () => {
    fs.writeFileSync(LockFile.getPath(tmp), 'ent: v1.0.3;\r\n\r\n  sf:v1.0.0  \r\nnot an entry\r\n');

    expect(LockFile.read(tmp)).toEqual({ ent: 'v1.0.3', sf: 'v1.0.0' });
});

test('read drops entries that could escape the libraries folder', () => {
    fs.writeFileSync(LockFile.getPath(tmp), '..: libraries;\n../../x: v1.0.0;\nent: ..;\nok: v2.0.0;\n');

    expect(LockFile.read(tmp)).toEqual({ ok: 'v2.0.0' });
});

test('setEntry writes entries sorted by name and removeEntry deletes them', () => {
    LockFile.setEntry('sf', 'v1.0.0', tmp);
    LockFile.setEntry('ent', 'v1.0.3', tmp);

    expect(fs.readFileSync(LockFile.getPath(tmp), 'utf8')).toBe('ent: v1.0.3;\nsf: v1.0.0;\n');

    expect(LockFile.removeEntry('ent', tmp)).toBe(true);
    expect(LockFile.removeEntry('ent', tmp)).toBe(false);
    expect(LockFile.read(tmp)).toEqual({ sf: 'v1.0.0' });
});
