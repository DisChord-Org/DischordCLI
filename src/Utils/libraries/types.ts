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
    tag: string;
    signature?: string;
    isAudited: boolean;
    downloadUrl: string;
    createdAt: number;
}

/**
 * Common properties for any package repository in the DisChord registry.
 * @interface BaseRepository
 */
interface BaseRepository {
    name: string;
    description: string;
    githubUrl: string;
    versions: Record<string, PackageVersion>;
}

/**
 * Schema for community packages that have been vetted and trusted.
 * @extends BaseRepository
 */
interface OfficialRepository extends BaseRepository {
    trustLevel: TrustLevel.Official;
}

/**
 * Schema for unverified or external packages.
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
    allowedVersions: string[];
}

/**
 * Discriminated union of all possible repository types based on their trust level.
 * @@type {OfficialRepository | TrustRepository | UnknownRepository} RepositoryData
 */
export type RepositoryData = OfficialRepository | TrustRepository | UnknownRepository;

/**
 * Structured response for a single package query.
 * Flattens repository data for easier consumption by the CLI.
 * @interface PackageResponse
 */
export interface PackageResponse {
    name: RepositoryData['name'];
    description: RepositoryData['description'];
    trustLevel: RepositoryData['trustLevel'];
    repository: RepositoryData['githubUrl'];
    version: PackageVersion['tag'];
    isAudited: PackageVersion['isAudited'];
    versions: RepositoryData['versions'];
}

/**
 * Map of package responses, indexed by package name.
 * Used for listing multiple packages in the registry.
 * @type {Record<PackageResponse['name'], PackageResponse>} PackagesRecordResponse
 */
export type PackagesRecordResponse = Record<PackageResponse['name'], PackageResponse>;