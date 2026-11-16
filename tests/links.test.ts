import { afterEach, beforeEach, expect, test } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { createDirectoryLink, entryExists, isLink, linkPointsTo, removeEntry } from '../src/Utils/libraries/links';

let tmp: string;
let target: string;
let link: string;

beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chord-links-')));
    target = path.join(tmp, 'target');
    link = path.join(tmp, 'link');

    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'file.txt'), 'content');
});

afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
});

test('a created link is detected and resolves to its target', () => {
    createDirectoryLink(target, link);

    expect(entryExists(link)).toBe(true);
    expect(isLink(link)).toBe(true);
    expect(isLink(target)).toBe(false);
    expect(linkPointsTo(link, target)).toBe(true);
    expect(linkPointsTo(link, tmp)).toBe(false);
});

test('removeEntry removes a link without touching what it points to', () => {
    createDirectoryLink(target, link);
    removeEntry(link);

    expect(entryExists(link)).toBe(false);
    expect(fs.readFileSync(path.join(target, 'file.txt'), 'utf8')).toBe('content');
});

test('a broken link is still seen and can be removed', () => {
    createDirectoryLink(target, link);
    fs.rmSync(target, { recursive: true, force: true });

    expect(fs.existsSync(link)).toBe(false);
    expect(entryExists(link)).toBe(true);
    expect(linkPointsTo(link, target)).toBe(false);

    removeEntry(link);

    expect(entryExists(link)).toBe(false);
});

test('removeEntry removes real directories recursively and tolerates missing paths', () => {
    removeEntry(target);
    removeEntry(path.join(tmp, 'missing'));

    expect(entryExists(target)).toBe(false);
});
