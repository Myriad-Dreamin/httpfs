# httpfs

## Install

```bash
npm install @myriaddreamin/httpfs
# by yarn
yarn add @myriaddreamin/httpfs
```

## Supported Http Drive

+ `Mega Async`
+ `Google Drive`
+ `Onedrive`
+ `Python SimpleHTTP Server`
+ creating any http stream is available by `createHttpVolume('http://url').createReadStream('/')`
  or `createHttpVolume('https://url').createReadStream('/')`
+ stating any http file is available by `createHttpVolume('http://url').[lstat, stat]('/')`
  or `createHttpVolume('https://url').[lstat, stat]('/')`

## Supported Api

+ `httpfs.open`
+ `httpfs.openSync`
+ `httpfs.close`
+ `httpfs.closeSync`
+ `httpfs.read`
+ `httpfs.readSync`
+ `httpfs.readFile`
+ `httpfs.readFileSync`
+ `httpfs.createReadStream`
+ `httpfs.write`
+ `httpfs.writeSync`
+ `httpfs.writeFile`
+ `httpfs.writeFileSync`
+ `httpfs.createWriteStream`
+ `httpfs.appendFile`
+ `httpfs.appendFileSync`
+ `httpfs.access`
+ `httpfs.accessSync`
+ `httpfs.open`
+ `httpfs.ftruncate`
+ `httpfs.ftruncateSync`
+ `httpfs.truncate`
+ `httpfs.truncateSync`
+ `httpfs.stat`
+ `httpfs.statSync`
+ `httpfs.fstat`
+ `httpfs.fstatSync`
+ `httpfs.lstat`
+ `httpfs.lstatSync`
+ `httpfs.readdirSync`
+ `httpfs.promises.readdir`
+ `httpfs.promises.open`
+ `httpfs.promises.readFile`
+ `httpfs.promises.writeFile`
+ `httpfs.promises.appendFile`
+ `httpfs.promises.access`
+ `httpfs.promises.truncate`
+ `httpfs.promises.stat`
+ `httpfs.promises.lstat`
+ `httpfs.promises.readdir`

## Example

### Create a Volume

```typescript
import {createAndLoadHttpVolume, createHttpVolume} from '@myriaddreamin/httpfs';

async function example1(): Promise<void> {
  // root not loaded
  const volume = createHttpVolume('http://www.baidu.com/');
  expect(volume).toBeDefined();
}

async function example1Async(): Promise<void> {
  // root loaded
  const volume = await createAndLoadHttpVolume('http://www.baidu.com/');
  expect(volume).toBeDefined();
}
```

### createReadStream

createReadStream for base url `volume.createReadStream('/') === ReadStream('http://www.baidu.com/')`

```typescript
async function example2(): Promise<void> {
  // root not loaded
  const volume = createHttpVolume('http://www.baidu.com/');
  expect(volume).toBeDefined();

  // read root stream
  const r = volume.createReadStream('/');
  await pipelineAsync(r, fs.createWriteStream(path.join(homedir(), 'Downloads', 'baidu.html')));
}
```

createReadStream for files in
subdirectory `volume.createReadStream(filePath) === ReadStream(path.join('http://0.0.0.0:8000/', filePath))`

```typescript
async function example3(): Promise<void> {
  // some http file server
  const volume = await createHttpVolume('http://0.0.0.0:8000/');
  expect(volume).toBeDefined();

  {
    const r = volume.createReadStream('/Dir1/File2.md');
    const res = await streamToString(r);
    expect(res).toEqual("File2Content\n");
  }
  {
    const r = volume.createReadStream('/File1.md');
    const res = await streamToString(r);
    expect(res).toEqual("File1Content\n");
  }
  {
    const r = volume.createReadStream('/Dir1/Dir2/File3.md');
    const res = await streamToString(r);
    expect(res).toEqual("File3Content\n");
  }
  {
    const r = volume.createReadStream('/Dir1/Dir2/File4.md');
    const res = await streamToString(r);
    expect(res).toEqual("File4Content\n");
  }
}
```

### Notice

`loadRemote` method is needed before calling the synchronous apis (with method name ending with `Sync`).

for example `httpfs.readFile` and `httpfs.promises.readFile` are asynchronous api, but `httpfs.readFileSync` is not.

### More API

all the apis are compatible with `import * as fs from 'fs'` or `const fs = require('fs')`
