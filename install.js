#!/usr/bin/env node
/**
 * Instalador de El Freno de Mano.
 *
 * Uso:  node install.js            → pregunta proyecto o global
 *       node install.js --proyecto → instala en ./.claude sin preguntar
 *       node install.js --global   → instala en ~/.claude sin preguntar
 *
 * Qué hace:
 *   1. Copia el hook y el catálogo a .claude/hooks/ (proyecto o global).
 *   2. Registra el hook en settings.json con merge cuidadoso:
 *      NUNCA toca los hooks que ya tengas configurados (Forge, etc).
 *   3. Es idempotente: correrlo dos veces no duplica nada.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const MATCHER = 'Bash|PowerShell|Read|Edit|Write';

function preguntar(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolver) => rl.question(texto, (r) => { rl.close(); resolver(r); }));
}

async function elegirDestino() {
  if (process.argv.includes('--proyecto')) return process.cwd();
  if (process.argv.includes('--global')) return os.homedir();

  console.log('¿Dónde quieres instalar El Freno de Mano?');
  console.log('  1) Solo en este proyecto  (' + process.cwd() + ')');
  console.log('  2) Global — todos tus proyectos  (' + os.homedir() + ')');
  const respuesta = (await preguntar('Elige [1/2]: ')).trim();
  if (respuesta !== '1' && respuesta !== '2') {
    console.log('Respuesta no reconocida. Corre el instalador de nuevo y elige 1 o 2.');
    process.exit(1);
  }
  return respuesta === '2' ? os.homedir() : process.cwd();
}

async function main() {
  console.log('');
  console.log('🖐️  El Freno de Mano — instalador');
  console.log('');

  const base = await elegirDestino();
  const dirHooks = path.join(base, '.claude', 'hooks');
  const rutaSettings = path.join(base, '.claude', 'settings.json');

  // --- 1. Copiar hook y catálogo -------------------------------------------
  fs.mkdirSync(dirHooks, { recursive: true });

  const origen = __dirname;
  const destinoHook = path.join(dirHooks, 'freno-de-mano.js');
  const destinoConfig = path.join(dirHooks, 'freno-de-mano.config.json');

  fs.copyFileSync(path.join(origen, 'hooks', 'freno-de-mano.js'), destinoHook);

  if (fs.existsSync(destinoConfig)) {
    console.log('📄 Ya tenías un freno-de-mano.config.json con tus patrones — lo conservé tal cual.');
  } else {
    fs.copyFileSync(path.join(origen, 'hooks', 'freno-de-mano.config.json'), destinoConfig);
  }

  // --- 2. Merge cuidadoso de settings.json ---------------------------------
  let settings = {};
  if (fs.existsSync(rutaSettings)) {
    const crudo = fs.readFileSync(rutaSettings, 'utf8');
    try {
      settings = JSON.parse(crudo);
    } catch (error) {
      // Un settings.json corrupto NUNCA se sobreescribe: mejor avisar y salir.
      console.error('❌ Tu ' + rutaSettings + ' tiene un error de formato JSON.');
      console.error('   No lo toqué para no empeorar nada. Arréglalo y corre el instalador de nuevo.');
      console.error('   Detalle: ' + error.message);
      process.exit(1);
    }
  }

  if (!settings.hooks) settings.hooks = {};
  if (!Array.isArray(settings.hooks.PreToolUse)) settings.hooks.PreToolUse = [];

  // Ruta absoluta con barras normales: funciona igual en Windows, Mac y Linux,
  // y las comillas protegen rutas con espacios.
  const comando = 'node "' + destinoHook.replace(/\\/g, '/') + '"';

  const esDelFreno = (h) =>
    h && typeof h.command === 'string' && h.command.includes('freno-de-mano.js');

  const entradaExistente = settings.hooks.PreToolUse.find(
    (e) => Array.isArray(e.hooks) && e.hooks.some(esDelFreno)
  );

  if (entradaExistente) {
    entradaExistente.matcher = MATCHER;
    entradaExistente.hooks = entradaExistente.hooks.map((h) =>
      esDelFreno(h) ? { type: 'command', command: comando } : h
    );
    console.log('🔁 El Freno ya estaba registrado — actualicé su entrada sin tocar tus otros hooks.');
  } else {
    settings.hooks.PreToolUse.push({
      matcher: MATCHER,
      hooks: [{ type: 'command', command: comando }]
    });
  }

  fs.writeFileSync(rutaSettings, JSON.stringify(settings, null, 2) + '\n');

  // --- 3. Listo -------------------------------------------------------------
  console.log('');
  console.log('✅ Freno de Mano instalado. A partir de ahora, Claude Code te va a avisar antes de ejecutar algo peligroso.');
  console.log('');
  console.log('   Hook:     ' + destinoHook);
  console.log('   Catálogo: ' + destinoConfig);
  console.log('   Settings: ' + rutaSettings);
  console.log('');
  console.log('ℹ️  Si tienes una sesión de Claude Code abierta, reiníciala para que cargue el hook.');
  console.log('ℹ️  Para agregar tus propios comandos peligrosos, edita el catálogo (freno-de-mano.config.json).');
}

main().catch((error) => {
  console.error('❌ La instalación falló: ' + error.message);
  process.exit(1);
});
