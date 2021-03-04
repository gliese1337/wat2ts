import fs from 'fs';
import { join } from 'path';
import { compile, compile_wasm } from ".";

const extrgx = /\.wa(t|sm)$/;

async function compileFile(path: string) {
  const src = await new Promise<Buffer>(res => fs.readFile(path, (_, src) => res(src)));
  const name = path.replace(extrgx, '.ts');
  const ts_src = await (path.endsWith('.wat') ? compile : compile_wasm)(src);
  return new Promise(res => {
    fs.writeFile(name, ts_src, res);
  });
}

async function compileDir(dir: string) {
  for (const file of fs.readdirSync(dir)) {
    const fullPath = join(dir, file);
    if (fs.statSync(fullPath).isDirectory()){
      await compileDir(fullPath);
    } else if (extrgx.test(file)) {
      await compileFile(fullPath);
    }
  }
}

function wat2ts(path: string) {
  if (fs.statSync(path).isDirectory()){
    return compileDir(path);
  }
  if (extrgx.test(path)) {
    return compileFile(path);
  }
  return Promise.resolve();
}

async function main() {
  const l = process.argv.length;
  for (let i = 2; i < l; i++) {
    await wat2ts(process.argv[i]);
  }
}

main();