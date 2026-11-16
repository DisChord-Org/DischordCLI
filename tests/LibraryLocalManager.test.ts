import { afterEach, beforeEach, expect, test } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';

import LibraryLocalManager, { InstallInProgressError } from '../src/Utils/libraries/LibraryLocalManager';
import { InvalidPackageReferenceError } from '../src/Utils/libraries/validation';
import { type PackageResponse, TrustLevel } from '../src/Utils/libraries/types';

const originalPath = LibraryLocalManager.LibrariesPath;
let tmp: string;

/**
 * Builds the registry metadata of a fake package version.
 * @param {string} name - The package name.
 * @param {string} version - The version tag.
 * @returns {PackageResponse} The metadata.
 */
function metadata (name: string, version: string): PackageResponse {
    return { name, version, description: `${name} ${version}`, trustLevel: TrustLevel.Trust, repository: '', isAudited: false, versions: {} };
}

/**
 * Installs a fake package version through the same steps the installer uses.
 * @param {string} name - The package name.
 * @param {string} version - The version tag.
 * @returns {void}
 */
function install (name: string, version: string): void {
    const dir = LibraryLocalManager.beginInstall(name, version);
    fs.writeFileSync(path.join(dir, 'index.js'), '');
    LibraryLocalManager.completeInstall(name, version, metadata(name, version));
}

/**
 * Reads the package-level 'data.json' of a fake package.
 * @param {string} name - The package name.
 * @returns {PackageResponse} The parsed metadata.
 */
function readData (name: string): PackageResponse {
    return JSON.parse(fs.readFileSync(path.join(tmp, name, 'data.json'), 'utf8'));
}

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

test('getPackages returns an empty record when the storage does not exist', () => {
    LibraryLocalManager.LibrariesPath = path.join(tmp, 'missing');

    expect(LibraryLocalManager.getPackages()).toEqual({});
});

test('a version is not installed until its installation completes', () => {
    const dir = LibraryLocalManager.beginInstall('ent', 'v1.0.0');

    expect(fs.existsSync(dir)).toBe(true);
    expect(LibraryLocalManager.existsRepo('ent', 'v1.0.0')).toBe(false);
    expect(LibraryLocalManager.isInstallActive('ent', 'v1.0.0')).toBe(true);
    expect(LibraryLocalManager.getLocalVersionFolders('ent')).toEqual([]);

    LibraryLocalManager.completeInstall('ent', 'v1.0.0', metadata('ent', 'v1.0.0'));

    expect(LibraryLocalManager.existsRepo('ent', 'v1.0.0')).toBe(true);
    expect(LibraryLocalManager.isInstallActive('ent', 'v1.0.0')).toBe(false);
    expect(LibraryLocalManager.getLocalVersionFolders('ent')).toEqual(['v1.0.0']);
    expect(readData('ent').version).toBe('v1.0.0');
});

test('abortInstall leaves nothing behind', () => {
    LibraryLocalManager.beginInstall('ent', 'v1.0.0');
    LibraryLocalManager.abortInstall('ent', 'v1.0.0');

    expect(LibraryLocalManager.existsRepo('ent')).toBe(false);
    expect(LibraryLocalManager.isInstallActive('ent', 'v1.0.0')).toBe(false);
});

test('beginInstall takes over the leftovers of a dead installer', () => {
    const versionDir = path.join(tmp, 'ent', 'v1.0.0');
    fs.mkdirSync(versionDir, { recursive: true });
    fs.writeFileSync(path.join(versionDir, '.installing'), 'not-a-pid');
    fs.writeFileSync(path.join(versionDir, 'half-written.js'), '');

    LibraryLocalManager.beginInstall('ent', 'v1.0.0');

    expect(fs.existsSync(path.join(versionDir, 'half-written.js'))).toBe(false);
    LibraryLocalManager.abortInstall('ent', 'v1.0.0');
});

test('beginInstall refuses a version another live process is installing', () => {
    const versionDir = path.join(tmp, 'ent', 'v1.0.0');
    fs.mkdirSync(versionDir, { recursive: true });
    fs.writeFileSync(path.join(versionDir, '.installing'), String(process.ppid));

    expect(() => LibraryLocalManager.beginInstall('ent', 'v1.0.0')).toThrow(InstallInProgressError);
    expect(fs.existsSync(versionDir)).toBe(true);
});

test('beginInstall refuses an already installed version', () => {
    install('ent', 'v1.0.0');

    expect(() => LibraryLocalManager.beginInstall('ent', 'v1.0.0')).toThrow();
    expect(LibraryLocalManager.existsRepo('ent', 'v1.0.0')).toBe(true);
});

test('data.json always describes the newest installed version', () => {
    install('ent', 'v2.0.0');
    install('ent', 'v1.0.0');

    expect(readData('ent').version).toBe('v2.0.0');

    LibraryLocalManager.removePackage('ent', 'v2.0.0');

    expect(readData('ent').version).toBe('v1.0.0');
    expect(readData('ent').description).toBe('ent v1.0.0');
});

test('removePackage removes the package folder with its last version, ignoring .DS_Store', () => {
    install('ent', 'v1.0.0');
    fs.writeFileSync(path.join(tmp, 'ent', '.DS_Store'), 'junk');

    LibraryLocalManager.removePackage('ent', 'v1.0.0');

    expect(fs.existsSync(path.join(tmp, 'ent'))).toBe(false);
});

test('getLocalVersionFolders ignores folders that are not version tags', () => {
    install('ent', 'v1.0.0');
    fs.mkdirSync(path.join(tmp, 'ent', '_temp'));
    fs.mkdirSync(path.join(tmp, 'ent', '.staging-v2.0.0-1'));

    expect(LibraryLocalManager.getLocalVersionFolders('ent')).toEqual(['v1.0.0']);
});

test('names and versions cannot escape the libraries folder', () => {
    fs.mkdirSync(path.join(tmp, 'victim'));

    expect(() => LibraryLocalManager.removePackage('..', 'victim')).toThrow(InvalidPackageReferenceError);
    expect(() => LibraryLocalManager.removePackage('victim', '..')).toThrow(InvalidPackageReferenceError);
    expect(() => LibraryLocalManager.getVersionDir('../x', 'v1.0.0')).toThrow(InvalidPackageReferenceError);
    expect(LibraryLocalManager.existsRepo('..')).toBe(false);
    expect(LibraryLocalManager.existsRepo('victim', '..')).toBe(false);
    expect(LibraryLocalManager.getLocalVersionFolders('..')).toEqual([]);
    expect(fs.existsSync(path.join(tmp, 'victim'))).toBe(true);
});
