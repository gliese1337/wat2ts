# wat2ts
Convert WebAssembly into importable TypeScript

```ts
import { compile } from 'wat2ts';
const wat_src = fs.readFileSync('example.wat');
const ts_src = compile(wat_src);
fs.writeFileSync('example.ts', ts_src);
```

The `compile` function parses the WebAssembly text format input, produces a binary module, encodes the binary as text, and then produces TypeScript source which embeds the encoded module, decodes it, and exports a type declaration for the module's exports objects and a function which can be used to instantiate the module and return its exports.

The interface of the generated modules is as follows:

```ts
export type ModuleExports = { /* whatever the exported fields are */ };
export default async function(): Promise<ModuleExports>;
```

The package also exports `compile_wat` (an alias for the basic `compile` function) and `compile_wasm(bin: Uint8Array): string`, which performs the same function with a binary-formatted WASM files rather than text-formatted WAT files.

This package also installs a command line tool `wat2ts` which takes list of names of files or directories, compiles any `.wat` or '.wasm' files that it finds, and saves corresponding `.ts` files with the same names.

Currently, all exported functions are typed as returning numbers, whether they actually do or not, and argument names are not preserved. Additionally, this only works for modules which do not require any imports.

# TODO

* Improve function types.
* Permit imports
* Switch from hex encoding to Base64 to reduce generated module size.
    - Or, choose an encoding based on the combined size of the decoding code and the encoded module string.