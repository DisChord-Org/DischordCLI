import fs from 'fs';
import path from 'path';

import homedir from '../homedir';

/** Shape of the persisted registry state file. */
interface RegistryStateData {
    /** Whether the registry has ever delivered a valid signed manifest to this installation. */
    signedManifests?: boolean;
}

/**
 * Remembers, across runs, what this installation has learned about the registry.
 *
 * Its one job today is to make signed manifests a one-way street: the first time the registry
 * delivers a valid one, the CLI records it and from then on refuses to install any package
 * that comes without it. An attacker who strips the manifest from a response to fall back to
 * the weaker, unsigned checks therefore only succeeds against an installation that has never
 * talked to an up-to-date registry.
 * @class RegistryState
 */
class RegistryState {
    /**
     * The absolute path to the state file.
     * @type {string}
     */
    public static StatePath: string = path.join(homedir.root, 'registry-state.json');

    /**
     * Reads the state file, tolerating a missing or corrupt one.
     * @returns {RegistryStateData} The persisted state. Empty if unavailable.
     * @private
     */
    private static read (): RegistryStateData {
        try {
            const data: unknown = JSON.parse(fs.readFileSync(RegistryState.StatePath, 'utf8'));
            return typeof data === 'object' && data !== null ? data as RegistryStateData : {};
        } catch {
            return {};
        }
    }

    /**
     * Tells whether a package without a signed manifest must be refused.
     * @returns {boolean} True once the registry has delivered a valid signed manifest before.
     */
    public static requiresSignedManifests (): boolean {
        return RegistryState.read().signedManifests === true;
    }

    /**
     * Records that the registry delivers signed manifests. No-op if already recorded.
     * @returns {void}
     */
    public static rememberSignedManifests (): void {
        const state = RegistryState.read();
        if (state.signedManifests === true) return;

        fs.mkdirSync(path.dirname(RegistryState.StatePath), { recursive: true });
        fs.writeFileSync(RegistryState.StatePath, JSON.stringify({ ...state, signedManifests: true }), 'utf8');
    }
}

export default RegistryState;
