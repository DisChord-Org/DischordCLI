/**
 * Defines the security level and automation constraints for a package.
 */
export enum TrustLevel {
    /** Untrusted or external community packages. */
    Unknown = 0,
    /** Trusted community packages; may require confirmation for sensitive actions. */
    Trust = 1,
    /** Verified DisChord packages; fully automated management. */
    Official = 2
}

export interface PackageVersion {
    tag: string;
    signature?: string;
    isAudited: boolean;
    downloadUrl: string;
    createdAt: number;
}

interface BaseRepository {
    name: string;
    description: string;
    githubUrl: string;
    versions: Record<string, PackageVersion>;
}

interface OfficialRepository extends BaseRepository {
    trustLevel: TrustLevel.Official;
}

interface TrustRepository extends BaseRepository {
    trustLevel: TrustLevel.Trust;
}

interface UnknownRepository extends BaseRepository {
    trustLevel: TrustLevel.Unknown;
    allowedVersions: string[];
}

export type RepositoryData = OfficialRepository | TrustRepository | UnknownRepository;

export interface PackageResponse {
    name: RepositoryData['name'];
    description: RepositoryData['description'];
    trustLevel: RepositoryData['trustLevel'];
    repository: RepositoryData['githubUrl'];
    version: string;
    isAudited: boolean;
}

export type PackagesRecordResponse = Record<PackageResponse['name'], PackageResponse>;