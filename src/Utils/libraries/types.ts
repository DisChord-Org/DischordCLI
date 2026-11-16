/**
 * Defines the security level and automation constraints for a package.
 * Used by the CLI to determine the level of user intervention required during installation.
 * @enum {number}
 */
export enum TrustLevel {
    /** 
     * Untrusted or external community packages. 
     */
    Unknown = 0,
    /** 
     * Trusted community packages.
     * Recognized by the ecosystem; may require confirmation for sensitive actions.
     */
    Trust = 1,
    /** 
     * Verified DisChord packages.
     * Guaranteed by the official core team; supports fully automated management.
     */
    Official = 2
}

/**
 * Represents a specific release of a package.
 * @interface PackageVersion
 */
export interface PackageVersion {
    /** The version tag of the release (ej. 'v1.0.3'). */
    tag: string;
    /** The ASCII-armored detached signature of the release archive, when it is signed. */
    signature?: string;
    /** Whether the release has been audited and signed with the official DisChord key. */
    isAudited: boolean;
    /** URL the release archive can be downloaded from. */
    downloadUrl: string;
    /** Publication time of the release, as a Unix timestamp. */
    createdAt: number;
    /** Hex-encoded SHA-256 of the release archive, recorded by the registry when it stored it. */
    sha256?: string;
}

/**
 * Common properties for any package repository in the DisChord registry.
 * @interface BaseRepository
 */
interface BaseRepository {
    /** The unique name of the package. */
    name: string;
    /** A short description of what the package does. */
    description: string;
    /** URL of the GitHub repository the package is published from. */
    githubUrl: string;
    /** Every published release of the package, indexed by version tag. */
    versions: Record<string, PackageVersion>;
}

/**
 * Schema for official packages, maintained and guaranteed by the DisChord core team.
 * @extends BaseRepository
 */
interface OfficialRepository extends BaseRepository {
    trustLevel: TrustLevel.Official;
}

/**
 * Schema for community packages that have been vetted and trusted.
 * @extends BaseRepository
 */
interface TrustRepository extends BaseRepository {
    trustLevel: TrustLevel.Trust;
}

/**
 * Schema for unverified or external packages.
 * @extends BaseRepository
 */
interface UnknownRepository extends BaseRepository {
    trustLevel: TrustLevel.Unknown;
    /** The only version tags of this repository that may be installed. */
    allowedVersions: string[];
}

/**
 * Discriminated union of all possible repository types based on their trust level.
 * @type {OfficialRepository | TrustRepository | UnknownRepository} RepositoryData
 */
export type RepositoryData = OfficialRepository | TrustRepository | UnknownRepository;

/**
 * Structured response for a single package query.
 * Flattens repository data for easier consumption by the CLI.
 * @interface PackageResponse
 */
export interface PackageResponse {
    /** The unique name of the package. */
    name: RepositoryData['name'];
    /** A short description of what the package does. */
    description: RepositoryData['description'];
    /** The trust level assigned to the package's repository. */
    trustLevel: RepositoryData['trustLevel'];
    /** URL of the GitHub repository the package is published from. */
    repository: RepositoryData['githubUrl'];
    /** The version tag this response describes. */
    version: PackageVersion['tag'];
    /** Whether that version is audited and signed with the official DisChord key. */
    isAudited: PackageVersion['isAudited'];
    /** Every published release of the package, indexed by version tag. */
    versions: RepositoryData['versions'];
}

/**
 * Map of package responses, indexed by package name.
 * Used for listing multiple packages in the registry.
 * @type {Record<PackageResponse['name'], PackageResponse>} PackagesRecordResponse
 */
export type PackagesRecordResponse = Record<PackageResponse['name'], PackageResponse>;