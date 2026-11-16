import type { SONode } from './commander';

/**
 * Knowledge about where the official DisChord binaries are published.
 *
 * The DisChord API only redirects a download request to a GitHub release asset. This module
 * is the CLI's own, independent description of where that asset must live, so the redirect
 * can be checked instead of trusted: whatever the API answers, the CLI only ever downloads
 * a binary from the official repository's release for the exact version it asked for.
 */

/** Components distributed as a standalone binary. */
export type BinaryComponent = 'cli' | 'compiler';

/** CPU architectures binaries are published for, named as in the release assets. */
export type AssetArch = 'x86_64' | 'aarch64';

/** Host serving the release pages the downloads are redirected to. */
const RELEASE_HOST = 'github.com';
/** GitHub organization that owns every official DisChord repository. */
const RELEASE_OWNER = 'DisChord-Org';

/** Repository each component is released from. */
const COMPONENT_REPOS: Record<BinaryComponent, string> = {
    cli: 'DischordCLI',
    compiler: 'DisChord'
};

/** Base name of each component's binary inside its release. */
const COMPONENT_BINARIES: Record<BinaryComponent, string> = {
    cli: 'chord',
    compiler: 'dischord-compiler'
};

/** Target triple suffix and file extension of the assets built for each operating system. */
const PLATFORM_TARGETS: Record<SONode, { triple: string, extension: string }> = {
    windows: { triple: 'pc-windows-msvc', extension: '.exe' },
    macos: { triple: 'apple-darwin', extension: '' },
    linux: { triple: 'unknown-linux-gnu', extension: '' }
};

/** Node.js architecture identifiers mapped to the names used by the release assets. */
const NODE_ARCHS: Partial<Record<NodeJS.Architecture, AssetArch>> = {
    x64: 'x86_64',
    arm64: 'aarch64'
};

/**
 * Error thrown when a download would not come from the official release it is expected from.
 * @class UntrustedDownloadError
 * @extends Error
 */
export class UntrustedDownloadError extends Error {
    /**
     * @param {string} message - Human-readable explanation of what was rejected.
     */
    constructor (message: string) {
        super(message);
        this.name = 'UntrustedDownloadError';
    }
}

/**
 * Translates a Node.js architecture identifier into the one used by the release assets.
 * @param {NodeJS.Architecture} [arch] - The architecture to translate. Defaults to the current one.
 * @throws {Error} If no binaries are published for that architecture.
 * @returns {AssetArch} The architecture name used in asset file names.
 */
export function getAssetArch (arch: NodeJS.Architecture = process.arch): AssetArch {
    const assetArch = NODE_ARCHS[arch];
    if (!assetArch) throw new Error(`No hay binarios de DisChord para la arquitectura "${arch}".`);

    return assetArch;
}

/**
 * Builds the file name of the release asset holding a component's binary.
 * @param {BinaryComponent} component - The component.
 * @param {SONode} platform - The operating system the binary is for.
 * @param {AssetArch} arch - The CPU architecture the binary is for.
 * @returns {string} The asset file name, ej. 'chord-x86_64-pc-windows-msvc.exe'.
 */
export function getComponentAssetName (component: BinaryComponent, platform: SONode, arch: AssetArch): string {
    const { triple, extension } = PLATFORM_TARGETS[platform];

    return `${COMPONENT_BINARIES[component]}-${arch}-${triple}${extension}`;
}

/**
 * Checks that a URL is exactly the official release asset expected for a component: served
 * over HTTPS by GitHub, from the component's own repository, for the requested version tag
 * and with the file name built for this platform and architecture.
 * @param {string} location - The URL the API redirected the download to.
 * @param {BinaryComponent} component - The component being downloaded.
 * @param {string} version - The requested version, without the 'v' prefix.
 * @param {string} assetName - The expected asset file name (see {@link getComponentAssetName}).
 * @throws {UntrustedDownloadError} If the URL points anywhere else. When only the file name
 * differs, the message explains that no binary is published for this platform.
 * @returns {string} The validated URL, normalized.
 */
export function assertOfficialReleaseUrl (location: string, component: BinaryComponent, version: string, assetName: string): string {
    let url: URL;

    try {
        url = new URL(location);
    } catch {
        throw new UntrustedDownloadError(`El servidor devolvió una dirección de descarga no válida para ${component}.`);
    }

    let segments: string[];

    try {
        segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    } catch {
        segments = [];
    }

    const expectedPrefix = [RELEASE_OWNER, COMPONENT_REPOS[component], 'releases', 'download', `v${version}`];
    const prefixMatches = segments.length === expectedPrefix.length + 1 && expectedPrefix.every((segment, index) => segments[index] === segment);

    if (url.protocol !== 'https:' || url.host !== RELEASE_HOST || url.username || url.password || !prefixMatches) {
        throw new UntrustedDownloadError(`El servidor redirigió la descarga de ${component} a una dirección que no es su release oficial (${url.origin}${url.pathname}). Descarga abortada.`);
    }

    const fileName = segments[segments.length - 1];

    if (fileName !== assetName) {
        throw new UntrustedDownloadError(`No hay un binario de ${component} publicado para este sistema: se esperaba ${assetName} y el servidor ofrece ${fileName}.`);
    }

    return url.href;
}
