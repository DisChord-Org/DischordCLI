import semver from 'semver';
import { red } from "../../Utils/drawer";

export default function pkgInstall (name: string, version: string = 'latest'): void {
    const vRegex = /^v\d+\.\d+\.\d+$/;

    if (!vRegex.test(version)) {
        console.log(red(`El formato de versión "${version}" es inválido.`));
        console.log(red(`Usa el formato vX.X.X (ejemplo: v1.0.2)\n`));
        return;
    }

    if (!semver.valid(version)) {
        console.log(red(`"${version}" no es una versión SemVer válida.`));
        return;
    }

    console.log(`Instalando paquete: ${name}`);
    console.log(`Versión validada: ${version}`);
}