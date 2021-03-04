import 'mocha';
//import { expect } from 'chai';
import { compile } from '../src/compile';

describe("Run Tests", () => {
  it('should parse the module', async() => {
    console.log(await compile('./wasm.wat'));
  });
});