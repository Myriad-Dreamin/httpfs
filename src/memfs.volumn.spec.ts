import {createAndLoadHttpVolume, createHttpVolume} from './fs';
import * as fs from 'fs';
import * as path from 'path';
import {homedir} from 'os';
import Dirent from 'memfs/lib/Dirent';
import {HttpFsError} from './proto';
import {Readable} from 'stream';

const stream = require('stream');
const {promisify} = require('util');

export const pipelineAsync = promisify(stream.pipeline);


export function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

export async function streamToString(stream: Readable): Promise<string> {
  return streamToBuffer(stream).then((blob) => blob.toString('utf8'));
}

jest.setTimeout(500000);
describe('httpfs', function () {

  it('create', () => {
    const volume = createHttpVolume('http://www.baidu.com/');
    expect(volume).toBeDefined();
  });

  it('createReadStream', async () => {
    const volume = await createHttpVolume('http://www.baidu.com/');
    expect(volume).toBeDefined();

    const r = volume.createReadStream('/');
    await pipelineAsync(r, fs.createWriteStream(path.join(homedir(), 'Downloads', 'baidu.html')));
  });

  it('createReadStreamLoadRemote', async () => {
    const volume = createHttpVolume('http://www.baidu.com/');
    expect(volume).toBeDefined();

    await volume.loadRemote();

    const r = volume.createReadStream('/');
    await pipelineAsync(r, fs.createWriteStream(path.join(homedir(), 'Downloads', 'baidu.html')));
  });

  it('stat', async () => {
    const volume = await createAndLoadHttpVolume('http://www.baidu.com/');
    expect(volume).toBeDefined();

    const statRes = volume.statSync('/');
    expect(statRes.isFile()).toBeTruthy();
    expect(statRes.atimeMs).not.toEqual(statRes.mtimeMs);
  });

  it('statDir', async () => {
    const volume = await createAndLoadHttpVolume('http://0.0.0.0:8000/');
    expect(volume).toBeDefined();

    const statRes = volume.statSync('/');
    expect(statRes.isDirectory()).toBeTruthy();
  });

  it('readDir', async () => {
    const volume = await createAndLoadHttpVolume('http://0.0.0.0:8000/');
    expect(volume).toBeDefined();

    const statRes = volume.readdirSync('/').sort();
    expect(statRes).toEqual(['Dir1', 'File1.md', 'Html.html']);
    const statResLong = volume.readdirSync('/', { withFileTypes: true }).sort() as Dirent[];
    expect(statResLong.map(d => d.name)).toEqual(['Dir1', 'File1.md', 'Html.html']);
    expect(statResLong.map(d => d.isDirectory())).toEqual([true, false, false]);
    expect(() => {
      volume.readdirSync('/Dir1');
    }).toThrow(HttpFsError);
  });

  it('readDirSub', async () => {
    const volume = await createAndLoadHttpVolume('http://0.0.0.0:8000/');
    expect(volume).toBeDefined();

    const statResAsync = (await volume.promises.readdir('/Dir1')).sort();
    expect(statResAsync).toEqual(['Dir2', 'File2.md']);
  });

  it('readDirSubDirectly', async () => {
    const volume = await createHttpVolume('http://0.0.0.0:8000/');
    expect(volume).toBeDefined();

    {
      const statResAsync = (await volume.promises.readdir('/Dir1/Dir2')).sort();
      expect(statResAsync).toEqual(['File3.md', 'File4.md']);
    }
    {
      const statResAsync = (await volume.promises.readdir('/Dir1')).sort();
      expect(statResAsync).toEqual(['Dir2', 'File2.md']);
    }
  });

  it('readFile1', async () => {
    const volume = await createHttpVolume('http://0.0.0.0:8000/');
    expect(volume).toBeDefined();

    const r = volume.createReadStream('/Dir1/File2.md');
    const res = await streamToString(r);
    expect(res).toEqual("File2Content\n");
  });

  it('readFile2', async () => {
    const volume = await createHttpVolume('http://0.0.0.0:8000/');
    expect(volume).toBeDefined();

    const r = volume.createReadStream('/File1.md');
    const res = await streamToString(r);
    expect(res).toEqual("File1Content\n");
  });

  it('readFile3', async () => {
    const volume = await createHttpVolume('http://0.0.0.0:8000/');
    expect(volume).toBeDefined();

    const r = volume.createReadStream('/Dir1/Dir2/File3.md');
    const res = await streamToString(r);
    expect(res).toEqual("File3Content\n");
  });

  it ('readFile4', async () => {
    const volume = await createHttpVolume('http://0.0.0.0:8000/');
    expect(volume).toBeDefined();

    const r = volume.createReadStream('/Dir1/Dir2/File4.md');
    const res = await streamToString(r);
    expect(res).toEqual("File4Content\n");
  })

  it('readFileSum', async () => {
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
  });

  //

  // it('stat mega file', async () => {
  //   const volume = await createAndLoadHttpVolume('https://mega.nz/file/6NUlDYpB#eAPUsx_wsDJ5tU8SYP94dkXHw1mGrDj5TBe0BfeL3bU');
  //   expect(volume).toBeDefined();
  //
  //   const statRes = volume.statSync('/');
  //   expect(statRes.isFile()).toBeTruthy();
  //   const statByNameRes = volume.statSync('/(C84) [幽玄エレコード] 羡望ファーストノート.rar');
  //   expect(statRes).toEqual(statByNameRes);
  // });
});
