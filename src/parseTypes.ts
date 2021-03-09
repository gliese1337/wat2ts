import { decode } from "@webassemblyjs/wasm-parser";

export function readModule(data: Uint8Array) {
  const { body } = decode(data);
  const types: { [key: string]: [number, number] } = {};
  const funcs: [number, number][] = [];
  const globals: { [key: string]: boolean } = {};

  const func_imports: { module: string; name: string; signature: [number, number] }[] = [];
  const global_imports: { module: string; name: string; }[] = [];
  const memory_imports: { module: string; name: string; }[] = [];
  const table_imports: { module: string; name: string; }[] = [];

  const func_exports: { name: string; index: number }[] = [];
  const global_exports: { name: string; id: string }[] = [];
  const memory_exports: string[] = [];
  const table_exports: string[] = [];

  for (const { fields } of body) {
    for (const field of fields) {
      switch(field.type) {
        case "TypeInstuction": {
          const { params, results } = field.functype;
          types[field.id.value] = [params.length, results.length];
          break;
        }
        case "Global":
          globals[field.name.value] = field.globalType.mutability === 'var';
          break;
        case "Func": {
          const sig = field.signature;
          if (sig.type === 'Signature') {
            const { params, results } = sig;
            funcs.push([params.length, results.length]);
          } else {
            funcs.push(types[sig.value]);
          }
          break;
        }

        case "ModuleImport": {
          const { module, name, descr } = field;
          switch (descr.type) {
            case 'Table':
              table_imports.push({ module, name });
              break;
            case 'GlobalType':
              global_imports.push({ module, name });
              break;
            case 'Memory':
              memory_imports.push({ module, name });
              break;
            case 'FuncImportDescr': {
              const { signature } = descr;
              if (signature.type === 'Signature') {
                const { params, results } = signature;
                func_imports.push({
                  module, name,
                  signature: [params.length, results.length],
                });
              } else {
                func_imports.push({
                  module, name,
                  signature: types[signature.value],
                });
              }
              break;
            }
          }
          break;
        }

        case "ModuleExport": {
          const { name, descr } = field;
          switch(descr.exportType) {
            case "Func":
              func_exports.push({ name, index: descr.id.value });
              break;
            case "Global":
              global_exports.push({ name, id: descr.id.value });
            case "Mem":
            case "Memory":
              memory_exports.push(name);
              break;
            case "Table":
              table_exports.push(name);
              break;
          }
        }
      }
    }
  }

  return {
    imports: {
      funcs: func_imports,
      globals: global_imports,
      memory: memory_imports,
      table: table_imports,
    },
    exports: {
      funcs: func_exports.map(({ name, index }) => ({
        name, signature: funcs[index],
      })),
      globals: global_exports.map(({ name, id }) => ({
        name, mutability: globals[id],
      })),
      memory: memory_exports,
      table: table_exports,
    },
  };
}