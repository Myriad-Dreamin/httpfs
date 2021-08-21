import {HttpVolumeApi} from './proto';
import Dirent from 'memfs/lib/Dirent';
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

export class HttpTestSuite {
  static get(testFunc: (volumeFac: () => Promise<HttpVolumeApi>) => Promise<void>, volumeFac: () => Promise<HttpVolumeApi>): () => Promise<void> {
    return async () => {
      await testFunc(volumeFac);
    }
  }

  static async statDir(volumeFac: () => Promise<HttpVolumeApi>): Promise<void> {
    const volume = await volumeFac();
    expect(volume).toBeDefined();

    const statRes = volume.statSync('/');
    expect(statRes.isDirectory()).toBeTruthy();
  }

  static async readDir(volumeFac: () => Promise<HttpVolumeApi>): Promise<void> {
    const volume = await volumeFac();
    expect(volume).toBeDefined();

    const statRes = volume.readdirSync('/').sort();
    expect(statRes).toEqual(['Dir1', 'File1.md', 'Html.html']);
    const statResLong = volume.readdirSync('/', {withFileTypes: true}).sort() as Dirent[];
    expect(statResLong.map(d => d.name)).toEqual(['Dir1', 'File1.md', 'Html.html']);
    expect(statResLong.map(d => d.isDirectory())).toEqual([true, false, false]);
  }

  static async readDirSub(volumeFac: () => Promise<HttpVolumeApi>): Promise<void> {
    const volume = await volumeFac();
    expect(volume).toBeDefined();

    const statResAsync = (await volume.promises.readdir('/Dir1')).sort();
    expect(statResAsync).toEqual(['Dir2', 'File2.md']);
  }

  static async readDirSubDirectly(volumeFac: () => Promise<HttpVolumeApi>): Promise<void> {
    const volume = await volumeFac();
    expect(volume).toBeDefined();

    {
      const statResAsync = (await volume.promises.readdir('/Dir1/Dir2')).sort();
      expect(statResAsync).toEqual(['File3.md', 'File4.md']);
    }
    {
      const statResAsync = (await volume.promises.readdir('/Dir1')).sort();
      expect(statResAsync).toEqual(['Dir2', 'File2.md']);
    }
  }

  static async readFile1(volumeFac: () => Promise<HttpVolumeApi>): Promise<void> {
    const volume = await volumeFac();
    expect(volume).toBeDefined();

    const r = volume.createReadStream('/File1.md');
    const res = await streamToString(r);
    expect(res).toEqual('File1Content\n');
  }

  static async readFile2(volumeFac: () => Promise<HttpVolumeApi>): Promise<void> {
    const volume = await volumeFac();
    expect(volume).toBeDefined();

    const r = volume.createReadStream('/Dir1/File2.md');
    const res = await streamToString(r);
    expect(res).toEqual('File2Content\n');
  }

  static async readFile3(volumeFac: () => Promise<HttpVolumeApi>): Promise<void> {
    const volume = await volumeFac();
    expect(volume).toBeDefined();

    const r = volume.createReadStream('/Dir1/Dir2/File3.md');
    const res = await streamToString(r);
    expect(res).toEqual('File3Content\n');
  }

  static async readFile4(volumeFac: () => Promise<HttpVolumeApi>): Promise<void> {
    const volume = await volumeFac();
    expect(volume).toBeDefined();

    const r = volume.createReadStream('/Dir1/Dir2/File4.md');
    const res = await streamToString(r);
    expect(res).toEqual('File4Content\n');
  }

  static async readFileSum(volumeFac: () => Promise<HttpVolumeApi>): Promise<void> {
    const volume = await volumeFac();
    expect(volume).toBeDefined();

    {
      const r = volume.createReadStream('/Dir1/File2.md');
      const res = await streamToString(r);
      expect(res).toEqual('File2Content\n');
    }
    {
      const r = volume.createReadStream('/File1.md');
      const res = await streamToString(r);
      expect(res).toEqual('File1Content\n');
    }
    {
      const r = volume.createReadStream('/Dir1/Dir2/File3.md');
      const res = await streamToString(r);
      expect(res).toEqual('File3Content\n');
    }
    {
      const r = volume.createReadStream('/Dir1/Dir2/File4.md');
      const res = await streamToString(r);
      expect(res).toEqual('File4Content\n');
    }
  }
}
