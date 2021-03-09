import wabt from 'wabt';
import { readModule } from './parseTypes';

const s = 'abcdefghijklmnopqrstuvwxyz';
function toB26(x: number) {
  let r = '';
  while (x > 0) {
    r = s[x % 26 - 1] + r;
    x = (x/26)|0;
  }

  return r;
}


function genTypes(bin: Uint8Array) {
  const { imports, exports } = readModule(bin);
  const ret = { imports: '', exports: '' };

  /* Imports */
  {
    const modules: {
      [key: string]: string[];
    } = {};  

    const { memory, globals, table, funcs } = imports;
    for (const { module, name } of memory) {
      const fields = modules[module] = (modules[module] || []);
      fields.push(`    "${name}": WebAssembly.Memory;`);
    }
    for (const { module, name } of globals) {
      const fields = modules[module] = (modules[module] || []);
      fields.push(`    "${name}": WebAssembly.Global;`);
    }
    for (const { module, name } of table) {
      const fields = modules[module] = (modules[module] || []);
      fields.push(`    "${name}": WebAssembly.Table;`);
    }
    for (const { module, name, signature: [params, results] } of funcs) {
      const fields = modules[module] = (modules[module] || []);
      const args = Array.from(
        { length: params },
        (_, i) => `${toB26(i+1)}: number`,
      ).join(',');
      fields.push(`    "${name}": (${args}) => ${ results === 1 ? 'number' : 'void' };`);
    }

    const mod_fields = Object.entries(modules).map(([k, fields]) =>
      `  "${k}": {\n` + fields.join('\n') + '\n  };'
    );

    if (mod_fields.length)
      ret.imports = 'export type ModuleImports = {\n' + mod_fields.join('\n') + '\n};';
  }

  /* Exports */
  {
    const { memory, globals, table, funcs } = exports;
    const fields: string[] = [];
    for (const name of memory) {
      fields.push(`"${name}": WebAssembly.Memory;`);
    }
    for (const { name } of globals) {
      fields.push(`"${name}": WebAssembly.Global;`);
    }
    for (const name of table) {
      fields.push(`"${name}": WebAssembly.Table;`);
    }
    for (const { name, signature: [params, results] } of funcs) {
      const args = Array.from(
        { length: params },
        (_, i) => `${toB26(i+1)}: number`,
      ).join(',');
      fields.push(`  "${name}": (${args}) => ${ results === 1 ? 'number' : 'void' };`);
    }

    ret.exports = 'export type ModuleExports = {\n' + fields.join('\n') + '\n};';
  }

  return ret;
}

const hex_loader = `
const high_map: {[key: string]: number } = {0:0,1:16,2:32,3:48,4:64,5:80,6:96,7:112,8:128,9:144,a:160,b:176,c:192,d:208,e:224,f:240};
const low_map: {[key: string]: number } = {0:0,1:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,a:10,b:11,c:12,d:13,e:14,f:15};
const l = s.length;
const bytes = new Uint8Array(l / 2);
for (let i = 0, j = 0; j < l; i++, j+=2)
  bytes[i] = high_map[s[j]] | low_map[s[j+1]];

const modp = WebAssembly.compile(bytes);
`;

const b64_loader = `
const t = [
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  0,0,0,0,0,62,0,62,0,63,52,53,54,55,56,57,58,59,60,61,0,0,0,64,0,0,0,0,1,2,3,
  4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,0,0,0,0,63,0,26,
  27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,
];

let p = -1;
const l = s.length;
const a = new ArrayBuffer(l / 4 * 3);
const b = new Uint8Array(a);
let i = 0;
while (++p < l) {
  const e0 = t[s.charCodeAt(p)];
  const e1 = t[s.charCodeAt(++p)];
  b[i++] = (e0 << 2) | (e1 >> 4);
  const e2 = t[s.charCodeAt(++p)];
  if (e2 === 64) break;
  b[i++] = ((e1 & 15) << 4) | (e2 >> 2);
  const e3 = t[s.charCodeAt(++p)];
  if (e3 === 64) break;
  b[i++] = ((e2 & 3) << 6) | e3;
}

const modp = WebAssembly.compile(new Uint8Array(a, 0, i));
`

const importTemplate = `
export default async function(imports: ModuleImports): Promise<ModuleExports> {
  const { exports } = await WebAssembly.instantiate(await modp, imports);
  return exports as unknown as ModuleExports;
}
`;

const noImportTemplate = `
export default async function(): Promise<ModuleExports> {
  const { exports } = await WebAssembly.instantiate(await modp);
  return exports as unknown as ModuleExports;
}
`;

function buildLoader(bin: Uint8Array) {
  const l = bin.length;
  const b64l = Math.ceil(l * 4 / 3) + b64_loader.length;
  const hexl = l * 2 + hex_loader.length;
  if (b64l < hexl) {
    return 'const s = "' + Buffer.from(bin).toString('base64') + '";\n' + b64_loader;
  }
  return 'const s = "' + Buffer.from(bin).toString('hex') + '";\n' + hex_loader;
}

export async function compile_wasm(bin: Uint8Array) {
  const { imports, exports } = genTypes(bin);
  const loader = buildLoader(bin);
  if (imports) {
    return imports + '\n\n' + exports + '\n\n' +
      loader + importTemplate;
  } else {
    return exports + '\n\n' +
      loader + noImportTemplate;
  }
}

export async function compile(src: Uint8Array | string) {
  const WABT = await wabt();
  const mod = WABT.parseWat('', src);
  return compile_wasm(mod.toBinary({}).buffer);
}

export const compile_wat = compile;