import { expect, test } from 'bun:test';
import path from 'path';

import {
    InvalidPackageReferenceError,
    LATEST_VERSION,
    assertValidPackageName,
    assertValidVersionTag,
    isPathInside,
    isValidPackageName,
    isValidVersionTag,
    resolveInside,
    splitPackageSpec
} from '../src/Utils/libraries/validation';

test('isValidPackageName accepts plain names', () => {
    for (const name of ['ent', 'sf', 'dcbot', 'my-lib', 'my_lib', 'lib.v2', 'A1']) {
        expect(isValidPackageName(name)).toBe(true);
    }
});

test('isValidPackageName rejects traversal, separators and odd shapes', () => {
    for (const name of ['', '.', '..', '../x', 'a/b', 'a\\b', '.hidden', 'trailing.', '-lead', '@scope/name', 'a b', 'a;b', '$(x)', undefined, 42]) {
        expect(isValidPackageName(name)).toBe(false);
    }
});

test('isValidVersionTag accepts strict semantic versions with an optional v', () => {
    for (const version of ['v1.0.0', '1.0.0', 'v10.20.30', '1.0.0-beta.1', 'v1.0.0+build.5']) {
        expect(isValidVersionTag(version)).toBe(true);
    }
});

test('isValidVersionTag rejects anything else', () => {
    for (const version of ['', 'latest', '1.0', 'v1', '..', 'libraries', '1.0.0/..', ' 1.0.0', '=1.0.0', 'v1.0.0;', undefined]) {
        expect(isValidVersionTag(version)).toBe(false);
    }
});

test('assert helpers throw InvalidPackageReferenceError', () => {
    expect(() => assertValidPackageName('..')).toThrow(InvalidPackageReferenceError);
    expect(() => assertValidVersionTag('libraries')).toThrow(InvalidPackageReferenceError);
    expect(() => assertValidPackageName('ent')).not.toThrow();
    expect(() => assertValidVersionTag('v1.0.3')).not.toThrow();
});

test('isPathInside only accepts strict descendants', () => {
    const base = path.resolve('base');

    expect(isPathInside(base, path.join(base, 'a'))).toBe(true);
    expect(isPathInside(base, path.join(base, 'a', 'b'))).toBe(true);
    expect(isPathInside(base, base)).toBe(false);
    expect(isPathInside(base, path.join(base, '..'))).toBe(false);
    expect(isPathInside(base, path.join(base, '..', 'base-sibling'))).toBe(false);
});

test('resolveInside throws when the result escapes the base', () => {
    const base = path.resolve('base');

    expect(resolveInside(base, 'a', 'b')).toBe(path.join(base, 'a', 'b'));
    expect(() => resolveInside(base, '..')).toThrow(InvalidPackageReferenceError);
    expect(() => resolveInside(base, 'a', '..', '..', 'x')).toThrow(InvalidPackageReferenceError);
});

test('splitPackageSpec splits on the last @ and defaults to latest', () => {
    expect(splitPackageSpec('ent')).toEqual({ name: 'ent', version: LATEST_VERSION });
    expect(splitPackageSpec('ent@v1.0.3')).toEqual({ name: 'ent', version: 'v1.0.3' });
    expect(splitPackageSpec('ent@')).toEqual({ name: 'ent', version: '' });
    expect(splitPackageSpec('@scope/name')).toEqual({ name: '', version: 'scope/name' });
    expect(splitPackageSpec('a@b@v1.0.0')).toEqual({ name: 'a@b', version: 'v1.0.0' });
});
