#!/usr/bin/env node
/**
 * 🖐️ El Freno de Mano — hook PreToolUse para Claude Code
 *
 * Intercepta comandos peligrosos ANTES de que se ejecuten:
 *   🔴 crítico → bloqueo total (deny)
 *   🟠 alto    → pide confirmación explícita (ask)
 *   🟡 medio   → advertencia visible, deja continuar
 *
 * Los patrones viven en freno-de-mano.config.json (mismo directorio).
 * Agrega los tuyos ahí — no hace falta tocar este archivo.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Salida hacia Claude Code
// ---------------------------------------------------------------------------

function salir(objeto) {
  if (objeto) process.stdout.write(JSON.stringify(objeto));
  process.exit(0);
}

function decision(permiso, razon) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: permiso,
      permissionDecisionReason: razon
    }
  };
}

// ---------------------------------------------------------------------------
// Log de intervenciones (.claude/freno-de-mano.log)
// ---------------------------------------------------------------------------

function registrar(severidad, herramienta, detalle) {
  try {
    const dirProyecto = path.join(process.cwd(), '.claude');
    const dir = fs.existsSync(dirProyecto)
      ? dirProyecto
      : path.join(os.homedir(), '.claude');
    if (!fs.existsSync(dir)) return;
    const linea =
      new Date().toISOString() + '\t' + severidad + '\t' + herramienta + '\t' +
      String(detalle).replace(/\s+/g, ' ').slice(0, 300) + '\n';
    fs.appendFileSync(path.join(dir, 'freno-de-mano.log'), linea);
  } catch (_) {
    // el log nunca debe romper el freno
  }
}

// ---------------------------------------------------------------------------
// Lógica principal
// ---------------------------------------------------------------------------

function compilar(entrada) {
  // Por defecto insensible a mayúsculas (SQL, PowerShell). Un patrón puede
  // pedir sensibilidad exacta con "sensibleMayusculas": true (ej. git branch -D).
  return new RegExp(entrada.patron, entrada.sensibleMayusculas ? '' : 'i');
}

function buscarMatch(lista, texto) {
  for (const entrada of lista || []) {
    try {
      if (compilar(entrada).test(texto)) return entrada;
    } catch (_) {
      // un patrón inválido no debe tumbar el hook completo
    }
  }
  return null;
}

// Evita falsos positivos como "os.environ" o "process.env" (contienen la
// subcadena ".env" pero no son un archivo real). Solo cuenta si la ruta
// aparece como token suelto: no pegada a un carácter de palabra antes o
// después (así cubre también "precedido de / o \").
function escaparRegex(cadena) {
  return String(cadena).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function esRutaSensibleReal(texto, ruta) {
  const patron = new RegExp('(?<!\\w)' + escaparRegex(ruta) + '(?!\\w)', 'i');
  return patron.test(texto);
}

function main() {
  let crudo = '';
  try {
    crudo = fs.readFileSync(0, 'utf8');
  } catch (_) {
    crudo = '';
  }
  const evento = JSON.parse(crudo.trim() || '{}');
  const config = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'freno-de-mano.config.json'), 'utf8')
  );

  const herramienta = evento.tool_name || '';
  const entrada = evento.tool_input || {};

  // --- Comandos de terminal (Bash en Mac/Linux, PowerShell en Windows) -----
  if (herramienta === 'Bash' || herramienta === 'PowerShell') {
    const comando = String(entrada.command || '');
    if (!comando) salir();

    // Orden fijo: crítico → alto → rutas sensibles → medio.
    // Un match crítico nunca se degrada a algo más suave.

    const critico = buscarMatch(config.critico, comando);
    if (critico) {
      registrar('CRITICO', herramienta, comando);
      salir(decision('deny',
        '🖐️ Freno de Mano: ' + critico.razon +
        ' Por eso lo bloqueé. Si de verdad necesitas hacerlo, corre el comando tú mismo por fuera de Claude Code.'
      ));
    }

    const alto = buscarMatch(config.alto, comando);
    if (alto) {
      registrar('ALTO', herramienta, comando);
      salir(decision('ask', '⚠️ ' + alto.razon + ' ¿Seguro que quieres seguir?'));
    }

    // Comandos que tocan archivos con secretos (cat .env, type .mcp.json...)
    for (const ruta of config.rutas_sensibles || []) {
      if (esRutaSensibleReal(comando, ruta)) {
        registrar('ALTO', herramienta, comando);
        salir(decision('ask',
          '⚠️ Este comando toca "' + ruta + '", que suele contener secretos o credenciales. ' +
          'Si el contenido aparece en pantalla, queda guardado en el historial de la conversación. ' +
          '¿Seguro que quieres seguir?'
        ));
      }
    }

    const medio = buscarMatch(config.medio, comando);
    if (medio) {
      registrar('MEDIO', herramienta, comando);
      // Solo advertimos: NO devolvemos "allow" para no saltarnos el sistema
      // normal de permisos de Claude Code — la advertencia se muestra y el
      // flujo de aprobación sigue igual que siempre.
      salir({
        systemMessage: '👀 Ojo con esto: ' + medio.razon +
          ' Te dejo continuar, pero revisa antes de confirmar.'
      });
    }

    salir(); // sin match → sin opinión, cero fricción
  }

  // --- Archivos sensibles (Read / Edit / Write) -----------------------------
  if (herramienta === 'Read' || herramienta === 'Edit' || herramienta === 'Write') {
    const rutaArchivo = String(entrada.file_path || '');
    if (!rutaArchivo) salir();

    for (const ruta of config.rutas_sensibles || []) {
      if (esRutaSensibleReal(rutaArchivo, ruta)) {
        registrar('ALTO', herramienta, rutaArchivo);
        const consecuencia = herramienta === 'Read'
          ? 'Si Claude lo lee, su contenido (incluidas claves y tokens) queda en la conversación.'
          : 'Modificarlo puede borrar claves ya configuradas o romper conexiones activas.';
        salir(decision('ask',
          '⚠️ El archivo "' + path.basename(rutaArchivo) + '" suele contener secretos o credenciales. ' +
          consecuencia + ' ¿Seguro que quieres seguir?'
        ));
      }
    }
    salir();
  }

  salir(); // cualquier otra herramienta pasa sin fricción
}

try {
  main();
} catch (error) {
  // Fail-open: un freno roto no debe dejarte sin poder trabajar.
  // El error queda visible en stderr para poder diagnosticarlo.
  console.error('[freno-de-mano] error interno, dejando pasar: ' + error.message);
  process.exit(0);
}
