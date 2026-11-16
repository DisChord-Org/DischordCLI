import { expect, test } from 'bun:test';

import { UntrustedDownloadError, assertOfficialReleaseUrl, getAssetArch, getComponentAssetName } from '../src/Utils/releaseAssets';

const CLI_ASSET = 'chord-x86_64-pc-windows-msvc.exe';
const CLI_URL = `https://github.com/DisChord-Org/DischordCLI/releases/download/v1.7.7/${CLI_ASSET}`;

test('getComponentAssetName matches the names published in the releases', () => {
    expect(getComponentAssetName('cli', 'windows', 'x86_64')).toBe('chord-x86_64-pc-windows-msvc.exe');
    expect(getComponentAssetName('cli', 'macos', 'aarch64')).toBe('chord-aarch64-apple-darwin');
    expect(getComponentAssetName('cli', 'linux', 'x86_64')).toBe('chord-x86_64-unknown-linux-gnu');
    expect(getComponentAssetName('compiler', 'linux', 'aarch64')).toBe('dischord-compiler-aarch64-unknown-linux-gnu');
});

test('getAssetArch translates known architectures and rejects the rest', () => {
    expect(getAssetArch('x64')).toBe('x86_64');
    expect(getAssetArch('arm64')).toBe('aarch64');
    expect(() => getAssetArch('ia32')).toThrow();
});

test('assertOfficialReleaseUrl accepts the official release asset', () => {
    expect(assertOfficialReleaseUrl(CLI_URL, 'cli', '1.7.7', CLI_ASSET)).toBe(CLI_URL);
    expect(assertOfficialReleaseUrl(
        'https://github.com/DisChord-Org/DisChord/releases/download/v1.8.1/dischord-compiler-x86_64-unknown-linux-gnu',
        'compiler',
        '1.8.1',
        'dischord-compiler-x86_64-unknown-linux-gnu'
    )).toBe('https://github.com/DisChord-Org/DisChord/releases/download/v1.8.1/dischord-compiler-x86_64-unknown-linux-gnu');
});

test('assertOfficialReleaseUrl rejects any other location', () => {
    const rejected = [
        'not a url',
        CLI_URL.replace('https://', 'http://'),
        CLI_URL.replace('github.com', 'github.com.evil.example'),
        CLI_URL.replace('github.com', 'user@github.com'),
        CLI_URL.replace('DisChord-Org', 'Someone-Else'),
        CLI_URL.replace('DischordCLI', 'DisChord'),
        CLI_URL.replace('v1.7.7', 'v1.0.0'),
        CLI_URL.replace('/releases/download/', '/raw/main/'),
        `${CLI_URL}/extra`,
        CLI_URL.replace(CLI_ASSET, `..%2F..%2F..%2Fevil%2Frepo%2Freleases%2Fdownload%2Fv1.7.7%2F${CLI_ASSET}`)
    ];

    for (const location of rejected) {
        expect(() => assertOfficialReleaseUrl(location, 'cli', '1.7.7', CLI_ASSET)).toThrow(UntrustedDownloadError);
    }
});

test('assertOfficialReleaseUrl rejects an asset built for another platform', () => {
    expect(() => assertOfficialReleaseUrl(CLI_URL, 'cli', '1.7.7', 'chord-aarch64-pc-windows-msvc.exe')).toThrow(UntrustedDownloadError);
});
