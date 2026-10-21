import { afterEach, beforeEach, expect, test } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import LibraryLocalManager from '../src/Utils/libraries/LibraryLocalManager';

const originalPath = LibraryLocalManager.LibrariesPath;
let tmp: string;

beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chord-libs-'));
    LibraryLocalManager.LibrariesPath = tmp;
});

afterEach(() => {
    LibraryLocalManager.LibrariesPath = originalPath;
    fs.rmSync(tmp, { recursive: true, force: true });
});

test('getPackages skips .DS_Store, stray files and unreadable entries', () => {
    fs.mkdirSync(path.join(tmp, 'good'));
    fs.writeFileSync(path.join(tmp, 'good', 'data.json'), JSON.stringify({ name: 'good', version: '1.0.0' }));

    fs.writeFileSync(path.join(tmp, '.DS_Store'), 'junk');
    fs.writeFileSync(path.join(tmp, 'stray.txt'), 'junk');
    fs.mkdirSync(path.join(tmp, 'no-data'));
    fs.mkdirSync(path.join(tmp, 'broken'));
    fs.writeFileSync(path.join(tmp, 'broken', 'data.json'), '{not json');

    const packages = LibraryLocalManager.getPackages();

    expect(Object.keys(packages)).toEqual(['good']);
});
