import wabt from 'wabt';

const s = 'abcdefghijklmnopqrstuvwxyz';
function toB26(x: number) {
  let r = '';
  while (x > 0) {
    r = s[x % 26 - 1] + r;
    x = (x/26)|0;
  }

  return r;
}

function genTypes(inst: WebAssembly.Instance) {
  const { exports } = inst;
  const fields: string[] = [];
  for (const [n, v] of Object.entries(exports)) {
    if (v instanceof WebAssembly.Memory) {
      fields.push(`"${n}": WebAssembly.Memory;`);
    } else if (v instanceof WebAssembly.Global) {
      fields.push(`"${n}": WebAssembly.Global;`);
    } else if (v instanceof Function) {
      const args = Array.from(
        { length: v.length },
        (_, i) => `${toB26(i+1)}: number`,
      ).join(',');
      fields.push(`"${n}": (${args}) => number;`);
    }
  }

  return `export type ModuleExports = {
    ${fields.join('\n    ')}
  };`
}

const loader = `
const high_map: {[key: string]: number } = {
  0: 0x00, 1: 0x10, 2: 0x20, 3: 0x30,
  4: 0x40, 5: 0x50, 6: 0x60, 7: 0x70,
  8: 0x80, 9: 0x90, a: 0xa0, b: 0xb0,
  c: 0xc0, d: 0xd0, e: 0xe0, f: 0xf0,
}

const low_map: {[key: string]: number } = {
  0: 0x00, 1: 0x01, 2: 0x02, 3: 0x03,
  4: 0x04, 5: 0x05, 6: 0x06, 7: 0x07,
  8: 0x08, 9: 0x09, a: 0x0a, b: 0x0b,
  c: 0x0c, d: 0x0d, e: 0x0e, f: 0x0f,
}

const bytes = new Uint8Array(hex.length / 2);
for (let i = 0, j = 0; j < hex.length; i++, j+=2) {
  bytes[i] = high_map[hex[j]] | low_map[hex[j+1]];
}

const modp = WebAssembly.compile(bytes);

export default async function(): Promise<ModuleExports> {
  const { exports } = await WebAssembly.instantiate(await modp);
  return exports as unknown as ModuleExports;
}
`;

export async function compile(src: Uint8Array | string) {
  const WABT = await wabt();
  const mod = WABT.parseWat('', src);
  const bin = mod.toBinary({}).buffer;
  const inst = await WebAssembly.instantiate(bin);
  const typeDec = genTypes(inst.instance);
  return typeDec + '\n\n' +
    'const hex = "' + Buffer.from(bin).toString('hex') + '";\n' +
    loader;
}