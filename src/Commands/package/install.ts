import path from 'path';
import fs from 'fs';
import readline from 'node:readline/promises';
import admZip from 'adm-zip';
import Bun from 'bun';

import Requester from '../../Utils/requester';
import ProjectManifest from '../../Utils/ProjectManifest';
import LibraryAPIManager from '../../Utils/libraries/LibraryAPIManager';
import LibraryLocalManager from '../../Utils/libraries/LibraryLocalManager';
import { type PackageResponse, type TrustLevel } from '../../Utils/libraries/types';
import { assertManifestDescribes, parseManifest } from '../../Utils/libraries/PackageManifest';
import RegistryState from '../../Utils/libraries/RegistryState';
import { decideInstall } from '../../Utils/libraries/TrustPolicy';
import { LATEST_VERSION, isPathInside, isValidPackageName, isValidVersionTag, splitPackageSpec } from '../../Utils/libraries/validation';
import { runCompiler } from '../compile';
import { syncLockedDependencies } from './sync';

import { red, green, gray, yellow, bold } from '../../Utils/drawer';
import { createBox, createDownloadProgressBar } from '../../Utils/utils';
import { emitJson, createThrottledProgressEmitter } from '../../Utils/ndjson';
import { errorMessage, fail, markFailed } from '../../Utils/output';

/** Entries found at the root of an archive that are packaging noise rather than package content. */
const ARCHIVE_NOISE: readonly string[] = ['__MACOSX', '.DS_Store'];

/** Names a package is not allowed to ship at its root, because the CLI owns them. */
const RESERVED_ROOT_ENTRIES: readonly string[] = ['.installing', '.dischord-package.json'];

/** Answers accepted as a 'yes' by the unsigned-package confirmation prompt. */
const AFFIRMATIVE_ANSWERS: readonly string[] = ['y', 'yes', 's', 'si', 'sí'];

/**
 * Why a package needs the user's consent: its archive is not signed, or it is signed but its
 * repository is of Unknown trust level. Doubles as the NDJSON phase reported for it.
 */
type ConsentReason = 'unsigned' | 'untrusted';

/** The texts shown when asking for consent, per reason. */
const CONSENT_WARNINGS: Record<ConsentReason, { summary: string, detail?: string, abort: string }> = {
    unsigned: {
        summary: 'El paquete no está firmado.',
        abort: 'el paquete no está firmado.'
    },
    untrusted: {
        summary: 'El paquete es de un origen no verificado por DisChord (nivel Unknown).',
        detail: 'Su firma solo garantiza que no se ha alterado desde que el registro lo almacenó.',
        abort: 'el paquete es de un origen no verificado (nivel Unknown).'
    }
};

/** The verified facts the install decision is based on. */
export interface PackageFacts {
    /** The trust level of the package's repository. */
    trustLevel: TrustLevel;
    /** Whether the registry states the archive is signed (its signature is verified separately). */
    isSigned: boolean;
}

/** Options accepted by the {@link pkgInstall} command. */
export interface InstallOptions {
    /** Whether to emit NDJSON progress events instead of human-readable output. */
    json?: boolean;
    /** Whether unsigned packages may be installed without asking for confirmation. */
    allowUnsigned?: boolean;
}

/** Normalized {@link InstallOptions}, shared by every step of an installation. */
export interface InstallContext {
    /** Whether to emit NDJSON progress events instead of human-readable output. */
    json: boolean;
    /** Whether unsigned packages may be installed without asking for confirmation. */
    allowUnsigned: boolean;
}

/** The distinct stages a single package installation can go through when reported over NDJSON. */
type InstallPhase =
    | 'checking'
    | 'not_found'
    | 'already_installed'
    | 'downloading'
    | 'downloading_signature'
    | 'verifying'
    | 'invalid_signature'
    | 'unsigned'
    | 'untrusted'
    | 'extracting'
    | 'installing_deps'
    | 'compiling'
    | 'done'
    | 'error';

/** Shape of a single NDJSON progress event emitted by the installer. */
interface JsonEvent {
    /** The package the event refers to. */
    package: string;
    /** The version being installed, once known. */
    version?: string;
    /** The stage the installation is in. */
    phase: InstallPhase;
    /** Download progress, from 0 to 100. Only present while downloading. */
    percent?: number;
    /** Bytes downloaded so far. Only present while downloading. */
    current_bytes?: number;
    /** Total bytes to download, when announced by the server. */
    total_bytes?: number;
    /** Human-readable detail, present on warnings and errors. */
    message?: string;
}

/** Filesystem locations used while installing one package version. */
interface InstallPaths {
    /** Final directory of the version, inside the global storage. */
    versionDir: string;
    /** Scratch directory holding the download and the extracted archive; removed when done. */
    stagingDir: string;
    /** Path the package archive is downloaded to. */
    zipPath: string;
    /** Path the detached signature is downloaded to. */
    sigPath: string;
}

/**
 * Orchestrates the full installation process of one or more DisChord libraries.
 *
 * The process includes:
 * 1. Validation of the package name and version, and resolution of 'latest' to a concrete version.
 * 2. Remote registry lookup.
 * 3. Verification of the registry's signed manifest and of the archive's PGP signature
 *    (see {@link resolvePackageFacts}).
 * 4. The trust policy (see {@link decideInstall}): unsigned Official packages are refused, and
 *    unsigned or Unknown ones need explicit consent - an interactive confirmation, or the
 *    '--allow-unsigned' flag (the only way in --json mode, see {@link confirmConsent}).
 * 5. Extraction and cleanup of temporary files.
 * 6. Dependency installation using pnpm, with lifecycle scripts disabled.
 * 7. Persistence of package metadata in 'data.json'.
 *
 * A failing package never prevents the remaining ones from being attempted.
 *
 * @async
 * @param {string[]} packages - Array of packages in 'name@version' format.
 * @param {InstallOptions} [options] - Installation options. 'json' switches to NDJSON output
 * for external integrations (ej. DisChord Code Studio).
 * @returns {Promise<boolean>} True if every package ended up installed, false if any failed.
 */
export default async function pkgInstall (packages: string[], options: InstallOptions = {}): Promise<boolean> {
    const context: InstallContext = { json: !!options.json, allowUnsigned: !!options.allowUnsigned };
    let allInstalled = true;

    for (const pkgInput of packages) {
        if (!(await installFromSpec(pkgInput, context))) allInstalled = false;
    }

    if (!allInstalled) markFailed();

    return allInstalled;
}

/**
 * Validates a 'name@version' reference, resolves 'latest' and installs the resulting version.
 * Every failure is reported here, so the caller only needs the outcome.
 * @async
 * @param {string} pkgInput - The raw package reference, ej. 'ent@v1.0.3' or 'ent'.
 * @param {InstallContext} context - The installation settings.
 * @returns {Promise<boolean>} True if the package ended up installed.
 */
async function installFromSpec (pkgInput: string, context: InstallContext): Promise<boolean> {
    const { name, version: requestedVersion } = splitPackageSpec(pkgInput);

    if (!isValidPackageName(name)) {
        reportError(context, name, undefined, `El nombre de paquete "${name}" no es válido. Solo se admiten letras, números, '.', '-' y '_'.`);
        return false;
    }

    if (requestedVersion !== LATEST_VERSION && !isValidVersionTag(requestedVersion)) {
        reportError(context, name, requestedVersion, `El formato de versión "${requestedVersion}" es inválido. Use vX.X.X`);
        return false;
    }

    try {
        const version = requestedVersion === LATEST_VERSION ? await LibraryAPIManager.getLatestVersion(name) : requestedVersion;

        if (!version) {
            reportNotFound(context, name);
            return false;
        }

        return await installSinglePackage(name, version, context);
    } catch (error) {
        reportError(context, name, requestedVersion === LATEST_VERSION ? undefined : requestedVersion, errorMessage(error));
        return false;
    }
}

/**
 * Downloads, verifies and installs a single resolved package version.
 *
 * The version directory is claimed with an '.installing' marker for the whole process (see
 * {@link LibraryLocalManager.beginInstall}), so an installation that fails, is cancelled or is
 * killed halfway is never reported as present afterwards, and two processes cannot install the
 * same version at once.
 * @async
 * @param {string} name - The package name.
 * @param {string} version - A concrete, already-resolved version tag (not 'latest').
 * @param {InstallContext} context - The installation settings.
 * @throws {Error} If any step of the installation fails.
 * @returns {Promise<boolean>} True if the package is installed (now or already), false if it
 * was not found or the installation was aborted (invalid signature or declined confirmation).
 */
async function installSinglePackage (name: string, version: string, context: InstallContext): Promise<boolean> {
    const { json } = context;

    if (json) emitJson<JsonEvent>({ package: name, version, phase: 'checking' });
    else console.log(gray(`Buscando ${bold(`${name}@${version}`)} en el registro...`));

    const pkg = await LibraryAPIManager.getPackage(name, version);

    if (!pkg) {
        reportNotFound(context, name, version);
        return false;
    }

    if (!isValidVersionTag(pkg.version)) throw new Error(`El registro devolvió una versión no válida para ${name}.`);

    if (LibraryLocalManager.existsRepo(name, pkg.version)) {
        if (json) emitJson<JsonEvent>({ package: name, version: pkg.version, phase: 'already_installed' });
        else console.log(`\n${bold(green('+ ') + name)} ${gray(pkg.version)}\n`);
        return true;
    }

    const versionDir = LibraryLocalManager.beginInstall(name, pkg.version);
    const stagingDir = path.join(LibraryLocalManager.getPackageDir(name), `.staging-${pkg.version}-${process.pid}`);
    const zipPath = path.join(stagingDir, `${name}-${pkg.version}.zip`);
    const paths: InstallPaths = { versionDir, stagingDir, zipPath, sigPath: `${zipPath}.asc` };

    let installed = false;

    try {
        installed = await installPackageFiles(name, version, pkg, paths, context);
    } finally {
        fs.rmSync(stagingDir, { recursive: true, force: true });

        if (installed) LibraryLocalManager.completeInstall(name, pkg.version, pkg);
        else LibraryLocalManager.abortInstall(name, pkg.version);
    }

    if (!installed) return false;

    if (json) {
        emitJson<JsonEvent>({ package: name, version: pkg.version, phase: 'done' });
    } else {
        console.log(`Paquete ${bold(`${name}@${pkg.version}`)} instalado con éxito.`);
        console.log(`\n${bold(green('+ ') + name)} ${gray(pkg.version)}\n`);
    }

    return true;
}

/**
 * Downloads, verifies, extracts and builds an already-resolved package into its version directory.
 * @async
 * @param {string} name - The package name.
 * @param {string} version - The version tag used to request the download endpoints.
 * @param {PackageResponse} pkg - The registry data of the package being installed.
 * @param {InstallPaths} paths - The locations to work with.
 * @param {InstallContext} context - The installation settings.
 * @throws {Error} If a download, the extraction, the dependency installation or a build step fails.
 * @returns {Promise<boolean>} True if the package was fully installed, false if it was aborted
 * (invalid signature or missing consent for an unsigned package).
 */
async function installPackageFiles (name: string, version: string, pkg: PackageResponse, paths: InstallPaths, context: InstallContext): Promise<boolean> {
    const { json } = context;

    const archiveSha256 = await downloadArchive(name, version, pkg, paths, context);
    const facts = await resolvePackageFacts(name, version, pkg, archiveSha256);

    // what gets stored locally is what was verified, not what the unsigned answer claimed.
    pkg.trustLevel = facts.trustLevel;
    pkg.isAudited = facts.isSigned;

    if (facts.isSigned && !(await verifyArchiveSignature(name, version, pkg, paths, context))) return false;

    switch (decideInstall(facts.trustLevel, facts.isSigned)) {
        case 'reject':
            reportRejectedOfficial(name, pkg, context);
            return false;
        case 'consent':
            if (!(await confirmConsent(name, pkg, facts.isSigned ? 'untrusted' : 'unsigned', context))) return false;
            break;
        case 'install':
            break;
    }

    if (json) emitJson<JsonEvent>({ package: name, version: pkg.version, phase: 'extracting' });
    else console.log(gray('Descomprimiendo paquete...'));

    extractArchive(paths);

    ProjectManifest.setModuleType(paths.versionDir);

    if (json) emitJson<JsonEvent>({ package: name, version: pkg.version, phase: 'installing_deps' });
    else console.log(gray('Instalando paquetes dependencias...'));

    /**
     * Lifecycle scripts are disabled: the package comes from a third party, and installing it
     * must not be enough to run its code on this machine.
     */
    ProjectManifest.install(paths.versionDir, [], { ignoreScripts: true });

    /**
     * Restore this package's own nested dependencies, if it declares any via its own
     * 'dischord.lock.conf' (ej. a library that itself depends on another library through
     * 'chord pkg use' during its own development). That lock file ships with the package,
     * but the './lib' symlinks it points to don't (they aren't portable between machines),
     * so without this the package's compiled output would fail to resolve those imports
     * at runtime (ERR_MODULE_NOT_FOUND) until someone manually ran 'chord pkg sync' inside
     * its installed directory.
     */
    if (!(await syncLockedDependencies(paths.versionDir, context))) {
        throw new Error(`No se pudieron restaurar las dependencias de ${name}@${pkg.version}.`);
    }

    await buildSources(name, pkg, paths.versionDir, context);

    return true;
}

/**
 * Downloads the package archive into the staging directory, reporting its progress.
 * @async
 * @param {string} name - The package name.
 * @param {string} version - The version tag used to request the download endpoint.
 * @param {PackageResponse} pkg - The registry data of the package being installed.
 * @param {InstallPaths} paths - The locations to work with.
 * @param {InstallContext} context - The installation settings.
 * @throws {Error} If the download fails.
 * @returns {Promise<string>} The hex-encoded SHA-256 of the downloaded archive.
 */
async function downloadArchive (name: string, version: string, pkg: PackageResponse, paths: InstallPaths, context: InstallContext): Promise<string> {
    const downloadUrl = LibraryAPIManager.getDownloadUrl(name, version);

    if (context.json) {
        emitJson<JsonEvent>({ package: name, version: pkg.version, phase: 'downloading', percent: 0, current_bytes: 0 });

        const { sha256 } = await Requester.downloadFile(downloadUrl, paths.zipPath, createThrottledProgressEmitter<JsonEvent>((percent, progress) => ({
            package: name,
            version: pkg.version,
            phase: 'downloading',
            percent,
            current_bytes: progress.transferred,
            total_bytes: progress.total
        })));

        return sha256;
    }

    const { bar, handleProgress } = createDownloadProgressBar(`${name}@${pkg.version}`);

    try {
        return (await Requester.downloadFile(downloadUrl, paths.zipPath, handleProgress)).sha256;
    } finally {
        bar.stop();
    }
}

/**
 * Downloads the detached signature of a signed package and verifies the archive against it.
 * @async
 * @param {string} name - The package name.
 * @param {string} version - The version tag used to request the signature endpoint.
 * @param {PackageResponse} pkg - The registry data of the package being installed.
 * @param {InstallPaths} paths - The locations to work with.
 * @param {InstallContext} context - The installation settings.
 * @throws {Error} If the signature cannot be downloaded.
 * @returns {Promise<boolean>} True if the signature is valid. False (already reported) otherwise.
 */
async function verifyArchiveSignature (name: string, version: string, pkg: PackageResponse, paths: InstallPaths, context: InstallContext): Promise<boolean> {
    const { json } = context;

    if (json) emitJson<JsonEvent>({ package: name, version: pkg.version, phase: 'downloading_signature' });
    else console.log(gray('Obteniendo firma...'));

    await Requester.downloadFile(LibraryAPIManager.getSignatureUrl(name, version), paths.sigPath);

    if (json) emitJson<JsonEvent>({ package: name, version: pkg.version, phase: 'verifying' });
    else console.log(gray('Verificando integridad del paquete...'));

    const signature = fs.readFileSync(paths.sigPath, 'utf8');

    if (await LibraryAPIManager.verifySignature(paths.zipPath, signature)) {
        if (!json) console.log(gray('Firma verificada correctamente.'));
        return true;
    }

    if (json) {
        emitJson<JsonEvent>({ package: name, version: pkg.version, phase: 'invalid_signature', message: 'La firma no es válida. El archivo podría haber sido manipulado (posible MitM). Instalación abortada.' });
    } else {
        console.error(createBox(red('Firma no válida')));
        console.error(red('El archivo podría haber sido manipulado.'));
        console.error(bold(red('Posible Man In The Middle (MitM).')));
        console.error(red('Abortando instalación.'));
    }

    return false;
}

/**
 * Establishes the facts the install decision is based on: the package's trust level and
 * whether its archive is signed.
 *
 * They come from the registry's signed manifest when there is one: its signature is verified
 * against the official DisChord key, and it must describe exactly this name, version and
 * downloaded archive. Only a registry that has never delivered a manifest to this
 * installation is allowed to go without (see {@link RegistryState}); its unsigned answer is
 * then used as-is, after comparing the archive with the hash it recorded, if any.
 * @async
 * @param {string} name - The package name.
 * @param {string} version - The version tag used to request the manifest endpoint.
 * @param {PackageResponse} pkg - The (unsigned) registry data of the package being installed.
 * @param {string} archiveSha256 - Lowercase hex-encoded SHA-256 of the downloaded archive.
 * @throws {Error} If the manifest is missing when it is required, its signature is not valid,
 * or it does not describe this package; or if the archive does not match the recorded hash.
 * @returns {Promise<PackageFacts>} The facts to decide with.
 */
export async function resolvePackageFacts (name: string, version: string, pkg: PackageResponse, archiveSha256: string): Promise<PackageFacts> {
    const signed = await LibraryAPIManager.getSignedManifest(name, version);

    if (!signed) {
        if (RegistryState.requiresSignedManifests()) {
            throw new Error(`El registro no ha entregado el manifiesto firmado de ${name}@${pkg.version}, aunque ya los publicaba. La respuesta podría haber sido manipulada. Instalación abortada.`);
        }

        const registeredSha256 = pkg.versions?.[pkg.version]?.sha256;

        if (typeof registeredSha256 === 'string' && registeredSha256.toLowerCase() !== archiveSha256) {
            throw new Error(`El paquete descargado no coincide con el hash registrado (esperado ${registeredSha256}, obtenido ${archiveSha256}).`);
        }

        return { trustLevel: pkg.trustLevel, isSigned: !!pkg.isAudited };
    }

    if (!(await LibraryAPIManager.verifyDetachedSignature(Buffer.from(signed.manifest, 'utf8'), signed.signature))) {
        throw new Error(`La firma del manifiesto de ${name}@${pkg.version} no es válida. La respuesta del registro podría haber sido manipulada. Instalación abortada.`);
    }

    const manifest = parseManifest(signed.manifest);
    assertManifestDescribes(manifest, name, pkg.version, archiveSha256);

    RegistryState.rememberSignedManifests();

    return { trustLevel: manifest.trustLevel, isSigned: manifest.isAudited };
}

/**
 * Reports that an Official package was refused because it is not signed. Official packages are
 * always signed by the registry, so this is never something the user can accept.
 * @param {string} name - The package name.
 * @param {PackageResponse} pkg - The registry data of the package being installed.
 * @param {InstallContext} context - The installation settings.
 * @returns {void}
 */
function reportRejectedOfficial (name: string, pkg: PackageResponse, context: InstallContext): void {
    const message = 'Instalación abortada: es un paquete oficial y no está firmado. Los paquetes oficiales siempre van firmados, así que la respuesta del registro podría haber sido manipulada.';

    /**
     * Only an 'error' event, without the 'unsigned' one that precedes a request for consent:
     * integrations read 'unsigned'/'untrusted' followed by a failure as "ask the user and
     * retry with --allow-unsigned", which could never succeed here.
     */
    if (context.json) {
        emitJson<JsonEvent>({ package: name, version: pkg.version, phase: 'error', message });
        return;
    }

    console.error(createBox(red('Paquete oficial sin firmar')));
    console.error(red(message));
}

/**
 * Obtains the user's explicit consent to install a package the policy does not accept on its
 * own (see {@link decideInstall}): one that is not signed, or one of Unknown trust level.
 *
 * Consent is given either up front with '--allow-unsigned', or by answering an interactive
 * prompt. Without a terminal to ask on (the --json mode used by integrations, pipes, CI) the
 * flag is the only way: such a package is never installed silently.
 * @async
 * @param {string} name - The package name.
 * @param {PackageResponse} pkg - The registry data of the package being installed.
 * @param {ConsentReason} reason - Why consent is needed.
 * @param {InstallContext} context - The installation settings.
 * @returns {Promise<boolean>} True if the installation may continue.
 */
async function confirmConsent (name: string, pkg: PackageResponse, reason: ConsentReason, context: InstallContext): Promise<boolean> {
    const { json, allowUnsigned } = context;
    const warning = CONSENT_WARNINGS[reason];

    if (json) {
        if (allowUnsigned) {
            emitJson<JsonEvent>({ package: name, version: pkg.version, phase: reason, message: `${warning.summary} Podría contener malware. Continuando bajo tu propio riesgo.` });
            return true;
        }

        emitJson<JsonEvent>({ package: name, version: pkg.version, phase: reason, message: `${warning.summary} Podría contener malware.` });
        emitJson<JsonEvent>({ package: name, version: pkg.version, phase: 'error', message: `Instalación abortada: ${warning.abort} Repite el comando con --allow-unsigned para instalarlo bajo tu propio riesgo.` });
        return false;
    }

    console.error(bold(yellow('\n    Advertencia\n')));
    console.error(yellow(warning.summary));
    if (warning.detail) console.error(yellow(warning.detail));
    console.error(yellow(bold('Podría contener Malware.')));
    console.error(yellow('Úsalo bajo tu propio riesgo.'));

    if (allowUnsigned) {
        console.error(bold(red('\nContinuando instalación (--allow-unsigned)...')));
        return true;
    }

    if (!process.stdin.isTTY) {
        console.error(bold(red('\nInstalación cancelada: ')) + 'no hay una terminal interactiva para confirmar. Usa --allow-unsigned para aceptarlo.');
        return false;
    }

    const prompt = readline.createInterface({ input: process.stdin, output: process.stderr });

    try {
        const answer = await prompt.question(bold(yellow('\n- ¿Deseas continuar con la instalación? [y/N] ')));

        if (!AFFIRMATIVE_ANSWERS.includes(answer.trim().toLowerCase())) {
            console.error(bold(red('\nInstalación cancelada.')));
            return false;
        }
    } finally {
        prompt.close();
    }

    console.error(bold(red('\nContinuando instalación...')));
    return true;
}

/**
 * Extracts the downloaded archive and moves the package content into its version directory.
 *
 * Archives usually wrap the package in a single top-level folder (the layout of GitHub's own
 * zipballs), which is unwrapped; archives with their content directly at the root are also
 * accepted. Every entry is checked to stay inside the extraction directory before anything
 * is written to disk.
 * @param {InstallPaths} paths - The locations to work with.
 * @throws {Error} If the archive is empty or holds an entry pointing outside of it.
 * @returns {void}
 */
function extractArchive (paths: InstallPaths): void {
    const zip = new admZip(paths.zipPath);
    const extractDir = path.join(paths.stagingDir, 'extracted');

    for (const entry of zip.getEntries()) {
        if (!isPathInside(extractDir, path.resolve(extractDir, entry.entryName))) {
            throw new Error(`El paquete contiene una ruta no permitida: ${entry.entryName}`);
        }
    }

    zip.extractAllTo(extractDir, true);

    const rootEntries = fs.readdirSync(extractDir).filter(entry => !ARCHIVE_NOISE.includes(entry));
    if (rootEntries.length === 0) throw new Error('El paquete está vacío.');

    const wrapper = path.join(extractDir, rootEntries[0]);
    const contentDir = rootEntries.length === 1 && fs.statSync(wrapper).isDirectory() ? wrapper : extractDir;

    for (const file of fs.readdirSync(contentDir)) {
        if (ARCHIVE_NOISE.includes(file) || RESERVED_ROOT_ENTRIES.includes(file)) continue;

        fs.renameSync(path.join(contentDir, file), path.join(paths.versionDir, file));
    }
}

/**
 * Lists the files of an installed package matching a glob pattern, leaving out anything
 * inside a 'node_modules' directory.
 * @param {string} packageDir - The package directory to scan.
 * @param {string} pattern - The glob pattern, relative to the package directory.
 * @returns {string[]} The absolute paths of the matching files.
 */
function findSources (packageDir: string, pattern: string): string[] {
    return Array.from(new Bun.Glob(pattern).scanSync({ cwd: packageDir, onlyFiles: true }))
        .filter(file => !file.split(/[\\/]/).includes('node_modules'))
        .map(file => path.join(packageDir, file));
}

/**
 * Prepares a package's sources for the compiler: transpiles its TypeScript modules to
 * JavaScript next to their sources, and compiles its '.chord' files (those living in a 'src'
 * directory, as the compiler requires) next to theirs.
 * @async
 * @param {string} name - The package name.
 * @param {PackageResponse} pkg - The registry data of the package being installed.
 * @param {string} packageDir - The directory the package was extracted into.
 * @param {InstallContext} context - The installation settings.
 * @throws {Error} If the transpilation or the compilation of any file fails.
 * @returns {Promise<void>}
 */
async function buildSources (name: string, pkg: PackageResponse, packageDir: string, context: InstallContext): Promise<void> {
    const { json } = context;

    const tsFiles = findSources(packageDir, '**/*.ts').filter(file => !file.endsWith('.d.ts'));

    if (tsFiles.length > 0) {
        if (json) emitJson<JsonEvent>({ package: name, version: pkg.version, phase: 'compiling' });
        else console.log(gray('Preparando módulos para el compilador...'));

        /**
         * Every module is its own entry point so it keeps its path next to its source, and code
         * splitting moves whatever several of them import into shared chunks. Without it each
         * output would carry a private copy of its imports, so two modules of the same package
         * would not share state, and 'instanceof' would fail across them.
         */
        await Bun.build({
            entrypoints: tsFiles,
            outdir: packageDir,
            naming: { entry: '[dir]/[name].js', chunk: '[dir]/chunk-[hash].js' },
            target: 'node',
            format: 'esm',
            root: packageDir,
            splitting: true,
            minify: false
        });

        if (!json) console.log(gray('Transpilación completada con éxito.'));
    }

    const chordFiles = findSources(packageDir, '**/*.chord').filter(file => path.basename(path.dirname(file)) === 'src');

    if (chordFiles.length > 0) {
        if (json) emitJson<JsonEvent>({ package: name, version: pkg.version, phase: 'compiling' });
        else console.log(gray('Compilando ficheros .chord...'));

        for (const chordFile of chordFiles) runCompiler(chordFile, path.dirname(chordFile));

        if (!json) console.log(gray('Compilación de .chord completada con éxito.'));
    }
}

/**
 * Reports that a package (or one of its versions) does not exist in the registry.
 * @param {InstallContext} context - The installation settings.
 * @param {string} name - The package name.
 * @param {string} [version] - The version that was looked up, if any.
 * @returns {void}
 */
function reportNotFound (context: InstallContext, name: string, version?: string): void {
    if (context.json) emitJson<JsonEvent>({ package: name, version, phase: 'not_found', message: `No se encontró el paquete ${name}.` });
    else fail(red(`No se encontró el paquete ${bold(name)}.`));
}

/**
 * Reports a failed installation.
 * @param {InstallContext} context - The installation settings.
 * @param {string} name - The package name.
 * @param {string | undefined} version - The version being installed, if known.
 * @param {string} message - What went wrong.
 * @returns {void}
 */
function reportError (context: InstallContext, name: string, version: string | undefined, message: string): void {
    if (context.json) emitJson<JsonEvent>({ package: name, version, phase: 'error', message });
    else fail(red(`Error instalando ${bold(name)}: `) + message);
}
