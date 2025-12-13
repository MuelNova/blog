#!/usr/bin/env node
// Translation coverage check: ensures every locale has the same keys per message module.

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const cache = new Map();

function loadTsModule(relPath) {
  const absPath = path.resolve(root, relPath);
  if (cache.has(absPath)) return cache.get(absPath);
  const source = fs.readFileSync(absPath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
    fileName: absPath,
  });

  const module = { exports: {} };
  const localRequire = (id) => {
    if (id.startsWith('./') || id.startsWith('../')) {
      const resolved = path.resolve(path.dirname(absPath), id);
      const rel = path.relative(root, resolved);
      return loadTsModule(rel);
    }
    return require(id);
  };

  // eslint-disable-next-line no-new-func
  const fn = new Function('module', 'exports', 'require', outputText);
  fn(module, module.exports, localRequire);
  cache.set(absPath, module.exports);
  return module.exports;
}

function getLocales() {
  const { languages, defaultLang } = loadTsModule('src/i18n/locales.ts');
  return { languages: Object.keys(languages), defaultLang };
}

function collectModule(name) {
  const mod = loadTsModule(`src/i18n/messages/${name}.ts`);
  const dict = mod[name];
  if (!dict) throw new Error(`Module ${name} missing export ${name}`);
  return dict;
}

function checkCoverage() {
  const { languages, defaultLang } = getLocales();
  const { messageModules } = loadTsModule('src/i18n/messages/index.ts');
  const modules = messageModules;
  let hasMissing = false;

  modules.forEach((name) => {
    const dict = collectModule(name);
    const baseLang = dict[defaultLang] ? defaultLang : Object.keys(dict)[0];
    const baseKeys = new Set(Object.keys(dict[baseLang] || {}));

    languages.forEach((lang) => {
      const keys = new Set(Object.keys(dict[lang] || {}));
      const missing = [...baseKeys].filter((k) => !keys.has(k));
      const extra = [...keys].filter((k) => !baseKeys.has(k));
      if (missing.length || extra.length) {
        hasMissing = true;
        console.log(`\n[${name}] ${lang}`);
        if (missing.length) console.log('  missing:', missing.join(', '));
        if (extra.length) console.log('  extra  :', extra.join(', '));
      }
    });
  });

  if (hasMissing) {
    console.error('\nTranslation keys mismatch detected.');
    process.exit(1);
  } else {
    console.log('All translation modules have consistent keys across locales.');
  }
}

checkCoverage();
