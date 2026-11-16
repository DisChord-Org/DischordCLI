import path from 'path';

/**
 * Validation primitives for anything that identifies a package (its name and its version tag).
 *
 * Package names and versions come from untrusted sources (command-line arguments, the remote
 * registry, and the 'dischord.lock.conf' file shipped inside downloaded packages) and end up
 * being joined into filesystem paths that are later created, linked or recursively deleted.
 * Every one of those entry points must go through this module first, so a value such as '..'
 * can never escape the directory it is supposed to live in.
 */

/** Keyword accepted instead of a concrete version tag to request the newest published version. */
export const LATEST_VERSION = 'latest';

/**
 * A package name: starts and ends with an alphanumeric character and may contain dots, dashes
 * and underscores in between. This rules out path separators, '.' / '..', leading dots and
 * trailing dots (which Windows silently strips from directory names).
 */
const PACKAGE_NAME_REGEX = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/;

/** A strict semantic version tag with an optional leading 'v' (ej. 'v1.2.3', '1.2.3-beta.1'). */
const VERSION_TAG_REGEX = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * Error thrown when a package name, a version tag or a path derived from them is not acceptable.
 * @class InvalidPackageReferenceError
 * @extends Error
 */
export class InvalidPackageReferenceError extends Error {
    /**
     * @param {string} message - Human-readable explanation of what was rejected.
     */
    constructor (message: string) {
        super(message);
        this.name = 'InvalidPackageReferenceError';
    }
}

/** A package reference as written by the user, before any validation. */
export interface PackageSpec {
    /** The package name. */
    name: string;
    /** The requested version tag, or {@link LATEST_VERSION} when none was given. */
    version: string;
}

/**
 * Checks whether a value is an acceptable package name.
 * @param {unknown} name - The value to check.
 * @returns {boolean} True if it is a string matching the package name format.
 */
export function isValidPackageName (name: unknown): name is string {
    return typeof name === 'string' && PACKAGE_NAME_REGEX.test(name);
}

/**
 * Checks whether a value is an acceptable concrete version tag ('latest' is not one).
 * @param {unknown} version - The value to check.
 * @returns {boolean} True if it is a string matching the strict version tag format.
 */
export function isValidVersionTag (version: unknown): version is string {
    return typeof version === 'string' && version.length <= 128 && VERSION_TAG_REGEX.test(version);
}

/**
 * Ensures a value is an acceptable package name.
 * @param {unknown} name - The value to check.
 * @throws {InvalidPackageReferenceError} If the name is not valid.
 * @returns {void}
 */
export function assertValidPackageName (name: unknown): asserts name is string {
    if (!isValidPackageName(name)) {
        throw new InvalidPackageReferenceError(`El nombre de paquete "${String(name)}" no es válido. Solo se admiten letras, números, '.', '-' y '_'.`);
    }
}

/**
 * Ensures a value is an acceptable concrete version tag.
 * @param {unknown} version - The value to check.
 * @throws {InvalidPackageReferenceError} If the version is not valid.
 * @returns {void}
 */
export function assertValidVersionTag (version: unknown): asserts version is string {
    if (!isValidVersionTag(version)) {
        throw new InvalidPackageReferenceError(`El formato de versión "${String(version)}" es inválido. Use vX.X.X`);
    }
}

/**
 * Checks whether a path is located strictly inside a base directory once both are resolved.
 * @param {string} baseDir - The directory that must contain the target.
 * @param {string} targetPath - The path to check.
 * @returns {boolean} True if the target is a descendant of the base directory (not the base itself).
 */
export function isPathInside (baseDir: string, targetPath: string): boolean {
    const relative = path.relative(path.resolve(baseDir), path.resolve(targetPath));

    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Joins path segments onto a base directory, guaranteeing the result stays inside it.
 * @param {string} baseDir - The directory the result must be contained in.
 * @param {...string} segments - The path segments to append.
 * @throws {InvalidPackageReferenceError} If the resulting path escapes the base directory.
 * @returns {string} The resolved absolute path.
 */
export function resolveInside (baseDir: string, ...segments: string[]): string {
    const resolved = path.resolve(baseDir, ...segments);

    if (!isPathInside(baseDir, resolved)) {
        throw new InvalidPackageReferenceError(`La ruta "${segments.join('/')}" queda fuera de ${baseDir}.`);
    }

    return resolved;
}

/**
 * Splits a 'name@version' reference into its parts, without validating them. A reference
 * without '@' requests {@link LATEST_VERSION}.
 * @param {string} input - The raw reference, ej. 'ent@v1.0.3' or 'ent'.
 * @returns {PackageSpec} The name and version exactly as written.
 */
export function splitPackageSpec (input: string): PackageSpec {
    const separator = input.lastIndexOf('@');

    if (separator === -1) return { name: input, version: LATEST_VERSION };

    return { name: input.slice(0, separator), version: input.slice(separator + 1) };
}
