# 🖐️ El Freno de Mano

**Un hook de seguridad para Claude Code que frena los comandos peligrosos antes de que se ejecuten — y te explica el riesgo en español sencillo.**

---

## La historia (por qué existe esto)

Un `forge init --force` corrido dentro de un proyecto existente me borró un sistema completo de **12 agentes** que había construido. Un solo comando, segundos, y todo desapareció.

Y no soy el único. Está documentado:

- **PocketOS (abril 2026)**: un agente de IA borró la base de datos de producción **y todos los backups** en una sola llamada a la API de Railway. 9 segundos.
- **Replit / SaaStr (2025)**: un agente borró la base de producción de una startup en medio de un *code freeze* explícito.
- **Caso Grigorev (documentado por Fortune)**: un agente confundido por la configuración de un laptop nuevo borró un entorno de producción completo, con años de contenido.
- **AWS (diciembre 2025)**: una caída de servicio causada en parte por cambios asistidos por IA generativa.
- **Knostic (diciembre 2025)**: Claude Code puede cargar tu `.env` automáticamente — un `echo` inocente puede exponer una API key.

Esto no es paranoia. Es ponerle cinturón de seguridad al copiloto.

## Qué hace

El Freno de Mano se engancha al evento `PreToolUse` de Claude Code: se dispara **antes** de que cualquier comando se ejecute, lo compara contra un catálogo de patrones peligrosos, y decide:

| Nivel | Qué pasa | Ejemplo |
|---|---|---|
| 🔴 **Crítico** | **Bloqueo total.** El comando nunca se ejecuta. | `rm -rf /`, `DROP TABLE`, `git push --force` a main, `forge init --force` |
| 🟠 **Alto** | **Pide confirmación explícita** antes de seguir. | `git reset --hard`, `cat .env`, `npm publish` |
| 🟡 **Medio** | **Advertencia visible**, pero te deja continuar. | `git branch -D`, `git add .`, `Stop-Process -Force` |

Además protege tus **archivos sensibles** (`.env`, `.mcp.json`, `id_rsa`, etc): si Claude intenta leerlos, editarlos o mostrarlos, te pregunta primero.

Viene precargado con **40+ patrones** en 7 categorías: sistema de archivos (Linux/Mac **y** Windows/PowerShell), git, bases de datos (Postgres/Supabase), secretos, infraestructura cloud y más.

Los comandos normales (`ls`, `git status`, `npm run dev`...) pasan sin ninguna fricción.

## Instalación (2 comandos)

Necesitas [Node.js](https://nodejs.org) (que ya tienes si usas Claude Code).

```bash
git clone https://github.com/JuanIA-sketch/freno-de-mano.git
cd freno-de-mano
node install.js
```

El instalador te pregunta si lo quieres **solo en este proyecto** o **global** (todos tus proyectos), copia el hook a `.claude/hooks/`, y registra el hook en `settings.json` **sin tocar los hooks que ya tengas configurados**. Correrlo dos veces no duplica nada.

> 💡 Si tienes una sesión de Claude Code abierta, reiníciala para que cargue el hook.

También puedes instalar sin preguntas: `node install.js --proyecto` o `node install.js --global`.

## Cómo se ve cuando te salva

```
> rm -rf /

🖐️ Freno de Mano: Esto borra todo el directorio actual, tu carpeta de
usuario o el sistema completo, y no hay vuelta atrás. Por eso lo bloqueé.
Si de verdad necesitas hacerlo, corre el comando tú mismo por fuera de
Claude Code.
```

Y cada intervención queda registrada en `.claude/freno-de-mano.log` — al final del mes vas a saber exactamente cuántas veces te salvó.

## Agrega tus propios comandos peligrosos

El catálogo vive en `freno-de-mano.config.json` — **no hace falta tocar el código**. Cada quien agrega los de su stack.

¿Usas Docker? Agrega esto a la lista `"alto"`:

```json
{
  "patron": "docker\\s+system\\s+prune\\s+[^\\n]*(-a|--all)",
  "razon": "Esto borra TODAS las imágenes, contenedores parados y redes que no estén en uso."
}
```

¿Usas AWS S3? Agrega esto a `"critico"`:

```json
{
  "patron": "aws\\s+s3\\s+(rb|rm)\\s+[^\\n]*--(force|recursive)",
  "razon": "Esto borra un bucket o carpetas completas de S3 de forma recursiva."
}
```

Reglas del catálogo:

- `patron` es una expresión regular (los `\` van dobles por ser JSON).
- `razon` es la explicación que verá la persona — escríbela en español sencillo.
- Por defecto los patrones ignoran mayúsculas/minúsculas. Si la mayúscula importa (como `git branch -D` vs `-d`), agrega `"sensibleMayusculas": true`.
- `rutas_sensibles` es una lista simple de textos: si aparecen en una ruta de archivo o en un comando, el Freno pide confirmación.

## Probar que funciona

```bash
node test/test.js
```

Corre 67 casos simulados (no ejecuta ningún comando real — solo le pasa al hook el mismo JSON que le pasaría Claude Code y verifica la decisión).

## Qué NO cubre (v1, honestidad ante todo)

- Acciones que no pasan por la terminal: borrados vía APIs HTTP directas, herramientas MCP (n8n, paneles cloud). El Freno vigila `Bash`, `PowerShell`, `Read`, `Edit` y `Write`.
- Detectar paquetes npm maliciosos: no hay regex que distinga un paquete confiable de uno envenenado. Revisa antes de instalar.
- Es un cinturón de seguridad, no un chofer: sigue haciendo backups y sigue leyendo lo que apruebas.

**Detalle de diseño:** en el nivel 🟡 el Freno solo muestra la advertencia — nunca responde "allow" a Claude Code, para no saltarse tu sistema normal de permisos. Tu configuración de permisos sigue mandando.

## Roadmap

- [ ] `npx freno-de-mano` — instalación de un solo comando vía npm.
- [ ] Comando para ver el resumen del log ("este mes el Freno te salvó 7 veces").
- [ ] Catálogos comunitarios por stack (Docker, AWS, GCP, n8n...).

---

Hecho con una cicatriz real por [Charly](https://github.com/JuanIA-sketch) para la comunidad **Imperio Agéntico** 🏛️ — logro #1 del reto de 30 días.

Licencia MIT — úsalo, modifícalo, compártelo.
