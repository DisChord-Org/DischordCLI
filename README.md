# DisChord CLI

`chord` es la herramienta de línea de comandos del ecosistema DisChord. Crea proyectos, compila y ejecuta ficheros `.chord`, gestiona las librerías instalables y mantiene actualizados la propia CLI y el compilador.

## Comandos

| Comando | Qué hace |
|---|---|
| `chord init <ruta>` | Crea un proyecto nuevo (carpeta nueva o vacía) con `src/index.chord` y Seyfert instalado. |
| `chord compile <ruta>` | Compila un fichero `.chord` situado en una carpeta `src`. Si la ruta es un proyecto, compila su `src/index.chord`. |
| `chord run <ruta>` | Compila y ejecuta el proyecto con Node.js. |
| `chord update <cli\|compiler\|all> [-f]` | Actualiza la CLI, el compilador o ambos. |
| `chord pkg install <nombre[@version]...>` | Instala librerías en el almacén global (`~/.dischord/libraries`). |
| `chord pkg uninstall <nombre> <version>` | Elimina una versión instalada. |
| `chord pkg search [query] [-i]` | Busca en el registro oficial, o entre las instaladas con `-i`. |
| `chord pkg use <nombre> <version>` | Enlaza una versión instalada en `./lib` y la anota en `dischord.lock.conf`. |
| `chord pkg unuse <nombre>` | Quita el enlace y la entrada del lock. |
| `chord pkg sync` | Instala y enlaza todo lo declarado en `dischord.lock.conf`. |

Todos los comandos devuelven un código de salida distinto de 0 cuando fallan y escriben los errores por stderr.

### Salida para integraciones (`--json`)

`update` y todos los subcomandos de `pkg` aceptan `--json`. En ese modo stdout contiene únicamente NDJSON (un objeto JSON por línea, o un único array en `pkg search`) y los avisos para humanos van a stderr.

### Paquetes firmados y sin firmar

La instalación depende del nivel de confianza del paquete y de si está firmado:

| Nivel | Firmado | Sin firmar |
|---|---|---|
| `Official` | Se instala | Se rechaza siempre |
| `Trust` | Se instala | Pide consentimiento |
| `Unknown` | Pide consentimiento | Pide consentimiento |

- El consentimiento se da respondiendo a la confirmación interactiva o pasando `--allow-unsigned` a `pkg install` / `pkg sync`. Con `--json`, o sin terminal interactiva, `--allow-unsigned` es la única forma.
- El nivel y el estado de firma se leen del manifiesto que el registro firma para cada versión (`/packages/<nombre>/<version>/manifest`), que además liga el zip descargado a ese nombre y esa versión. Las firmas se verifican con la clave PGP pública de DisChord incluida en la CLI; si alguna no es válida, la instalación se aborta.
- La primera vez que el registro entrega un manifiesto válido, la CLI lo anota en `~/.dischord/registry-state.json` y a partir de entonces rechaza cualquier paquete que llegue sin él.
- Las dependencias npm de un paquete se instalan con los scripts de ciclo de vida desactivados.

### Actualizaciones verificadas

`chord update` solo instala binarios que provienen del release oficial en GitHub del componente (`DisChord-Org/DischordCLI` o `DisChord-Org/DisChord`) para la versión solicitada, y compara el fichero descargado con el SHA-256 publicado para ese asset. El binario instalado solo se sustituye cuando la descarga está completa y verificada.

Los nombres de los assets (`chord-<arquitectura>-<sistema>`) están definidos en `src/Utils/releaseAssets.ts` y deben coincidir con los del workflow de release y con los que sirve DisChord-Server.

## Desarrollo

Requisitos: [Bun](https://bun.sh) y [pnpm](https://pnpm.io).

```bash
pnpm install
```

```bash
bun run dev -- --help
```

```bash
bun test
```

```bash
pnpm run typecheck
```

```bash
bun run build
```

## Publicación

1. Actualiza `version` en `package.json`.
2. Crea y sube un tag `vX.Y.Z` que coincida con esa versión.

El workflow de release comprueba que el tag coincide con `package.json`, ejecuta el typecheck y los tests, compila los binarios para macOS, Linux y Windows, publica el release con un fichero `SHA256SUMS` y avisa a DisChord-Server.
