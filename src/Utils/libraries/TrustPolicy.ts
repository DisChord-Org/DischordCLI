import { TrustLevel } from './types';

/**
 * What the installer must do with a package:
 * - 'install': proceed without asking.
 * - 'consent': proceed only with the user's explicit consent (prompt or '--allow-unsigned').
 * - 'reject': never install, whatever the user says.
 */
export type InstallDecision = 'install' | 'consent' | 'reject';

/**
 * Decides how a package may be installed from its trust level and whether its archive carries
 * a valid signature. Pure rules, kept free of I/O so they can be unit tested.
 *
 * | Level    | Signed  | Unsigned |
 * |----------|---------|----------|
 * | Official | install | reject   |
 * | Trust    | install | consent  |
 * | Unknown  | consent | consent  |
 *
 * Official packages are always signed by the registry, so an unsigned one means something is
 * wrong and no flag may wave it through. A signature on an Unknown package only proves the
 * archive was not altered since the registry stored it, not that anybody reviewed it, so it
 * still needs consent. A level the CLI does not recognize is treated as Unknown.
 * @param {TrustLevel} trustLevel - The trust level of the package's repository.
 * @param {boolean} isSigned - Whether the archive is signed and its signature was verified.
 * @returns {InstallDecision} What the installer must do.
 */
export function decideInstall (trustLevel: TrustLevel, isSigned: boolean): InstallDecision {
    switch (trustLevel) {
        case TrustLevel.Official:
            return isSigned ? 'install' : 'reject';
        case TrustLevel.Trust:
            return isSigned ? 'install' : 'consent';
        default:
            return 'consent';
    }
}
