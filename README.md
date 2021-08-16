# httpfs

[![][npm-badge]][npm-url]

## Install

```bash
npm install [--save] @myriaddreamin/httpfs
# by yarn
yarn add @myriaddreamin/httpfs
```

## Supported Http Drive

+ `Mega Async`
+ `Google Drive`
+ `Onedrive`
+ `Python SimpleHTTP Server`
+ creating any http stream by
  + `createHttpVolume('http://url').createReadStream('/')`
  + or `createHttpVolume('https://url').createReadStream('/')`
+ stating any http response by
  + `createHttpVolume('http://url').[lstat, stat]('/')`
  + or `createHttpVolume('https://url').[lstat, stat]('/')`
+ the link primitives are implemented in local memory (not persistent).


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

async function example_create_volume(): Promise<void> {
  // root not loaded
  const volume = createHttpVolume('http://www.baidu.com/');
  expect(volume).toBeDefined();
}

async function example_create_volume_async(): Promise<void> {
  // root loaded
  const volume = await createAndLoadHttpVolume('http://www.baidu.com/');
  expect(volume).toBeDefined();
}
```

### createReadStream

createReadStream for base url `volume.createReadStream('/') === ReadStream('http://www.baidu.com/')`

```typescript
async function example_read_root_file(): Promise<void> {
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
async function example_read_subfiles(): Promise<void> {
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

### Error Handling

```typescript
async function example_error_handling(): Promise<void> {
  const volume = await createAndLoadHttpVolume('http://0.0.0.0:8000/');
  expect(volume).toBeDefined();

  expect(() => {
    volume.readdirSync('/Dir1');
  }).toThrow(HttpFsError);
}
```

### Notice

`loadRemote` method is needed before calling the synchronous apis (with method name ending with `Sync`).

for example `httpfs.readFile` and `httpfs.promises.readFile` are asynchronous api, but `httpfs.readFileSync` is not.

### More API

all the apis are compatible with `import * as fs from 'fs'` or `const fs = require('fs')`

### Develop a new http drive

#### Register your http drive (by dns domain)

```typescript

async function example_register_drive_by_domain(): Promise<void> {
  class MyUrlAction implements SomeHttpAction {}
  GenericUrlAction.registerByDomain('www.example.com', MyUrlAction);
}
```

#### Register your http drive (override)

```typescript

async function example_register_drive_overrided(): Promise<void> {
  class MyUrlAction implements SomeHttpAction {}
  class MyHttpVolume extends HttpVolume {
    createRootAction(url: URL): HttpFsURLAction {
      return new MyUrlAction(url);
    }
  }
}
```

#### Implement a http drive which has special file serving method

```typescript
class GotUrlAction implements UrlReadStreamAction {
  constructor(protected url: URL) {
  }

  createReadStream(): Readable {
    return got.stream(this.url);
  }
}
```

#### Implement a http drive which has directory structure

```typescript
class SimpleHttpUrlAction extends GotUrlAction implements UrlLoadRemoteAction {
  constructor(url: URL) {
    super(url);
  }

  async loadRemote(): Promise<IHttpDirent> {
    // return File Dirent or Dir Dirent
    return this.handlePythonServer(await got.get(this.url));
  }
}
```

#### Full list of all HttpUrlAction interface

+ `UrlLoadRemoteAction` is mapped to filesystem api `fs.readdir`, `fs.stat*`.
+ `UrlMkdirAction` is mapped to filesystem api `fs.mkdir`, `fs.mkdirp`.
+ `UrlFileModeAction` is mapped to filesystem api `fs.chmod`, `fs.chown`.
+ `UrlReadAction` is mapped to filesystem api `fs.read*`.
+ `UrlWriteAction` is mapped to filesystem api `fs.write*`, `fs.access`, `fs.truncate`, `fs.append*`.
+ `UrlReadStreamAction` is mapped to filesystem api `fs.createReadStream`.
+ `UrlWriteStreamAction` is mapped to filesystem api `fs.createWriteStream`.

[npm-url]: https://www.npmjs.com/package/@myriaddreamin/httpfs
[npm-badge]: https://img.shields.io/npm/v/@myriaddreamin/httpfs.svg
