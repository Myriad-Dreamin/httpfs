import {
  HttpDirInfo,
  HttpFileInfo,
  HttpFsError,
  HttpNDirInfo,
  IHttpDirent,
  UrlLoadRemoteAction,
  UrlReadStreamAction
} from './proto';
import {URL} from 'url';
import got, * as GotLib from 'got';
import {Readable} from 'stream';

const hrefExtractReg = /href="((?:\\"|[^"])*)"/g;

class GotUrlAction implements UrlReadStreamAction {
  constructor(protected url: URL) {
  }

  createReadStream(): Readable {
    return got.stream(this.url, {
      isStream: true,
      // autoClose: true,
    });
  }
}

type PartialFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

function fileResponseToDirent(res: GotLib.Response): PartialFields<IHttpDirent, 'action'> {

  const lastModified = res.headers['last-modified'];
  let mTime: number | undefined;
  if (lastModified) {
    mTime = Date.parse(lastModified);
  }

  const contentLength = res.headers['content-length'];
  let sz: number | undefined;
  if (contentLength) {
    sz = Number.parseInt(contentLength);
  }

  const contentType = res.headers['content-type'];
  if (!contentType) {
    return {
      type: 'file',
      mTime,
      loaded: true,
      size: sz,
    };
  }
  if (contentType.startsWith('text')) {
    return {
      type: 'file',
      mTime,
      loaded: true,
      size: sz,
    };
  }

  throw new HttpFsError('not implemented');
}

async function handlePythonServerMethod(res: GotLib.Response<string>): Promise<IHttpDirent> {
  const b = res.body;
  const validate = b.includes('Directory listing for');
  if (!validate) {
    const dirent = fileResponseToDirent(res);
    dirent.action = new SimpleHttpUrlAction(this.url);
    return dirent as IHttpDirent;
  }

  let execArr: RegExpExecArray;
  const dirs: IHttpDirent[] = [];
  while ((execArr = hrefExtractReg.exec(b))) {
    const lnk = execArr[1];
    dirs.push({
      type: lnk.endsWith('/') ? 'dir' : 'file',
      name: lnk.endsWith('/') ? lnk.slice(0, lnk.length - 1) : lnk,
      loaded: false,
      action: new SimpleHttpUrlAction(new URL(lnk, this.url)),
    });
  }
  return {
    type: 'dir',
    loaded: true,
    name: '/',
    children: dirs,
    action: this instanceof SimpleHttpUrlAction ? this : new SimpleHttpUrlAction(this.url),
  };
}

export class SimpleHttpUrlAction extends GotUrlAction implements UrlReadStreamAction, UrlLoadRemoteAction {
  constructor(url: URL) {
    super(url);
  }

  handlePythonServer = handlePythonServerMethod;


  async loadRemote(): Promise<IHttpDirent> {
    return this.handlePythonServer(await got.get(this.url));
  }

}

export class GenericUrlAction extends GotUrlAction implements UrlLoadRemoteAction {
  constructor(url: URL, private childPath?: string) {
    super(url);
  }

  handlePythonServerInternal = handlePythonServerMethod;

  async handlePythonServer(res: GotLib.Response): Promise<IHttpDirent | undefined> {

    const contentType = res.headers['content-type'];

    // unlikely an index html, 10485760 / 1000 \approx 10000 file in this directory
    if (contentType.length >= 10485760) {
      const dirent = fileResponseToDirent(res);
      dirent.action = new SimpleHttpUrlAction(this.url);
      return dirent as IHttpDirent;
    }

    return this.handlePythonServerInternal(await got.get(this.url));
  }

  handleServer(server: string, res: GotLib.Response): Promise<IHttpDirent | undefined> {
    if (server.startsWith('SimpleHTTP')) {
      return this.handlePythonServer(res);
    }
    return undefined;
  }

  async loadRemote(): Promise<IHttpDirent> {
    const res = await got.head(this.url, {
      headers: {
        // 'Accept-Encoding': 'gzip, deflate',
      }
    });
    const server = res.headers['server'] as unknown as string;
    if (server) {
      const dirent = await this.handleServer(server, res);
      if (dirent) {
        return dirent;
      }
    }

    const dirent = fileResponseToDirent(res);
    dirent.action = this;
    return dirent as IHttpDirent;
  }

  // read(buf: Buffer | Uint8Array, off?: number, len?: number, pos?: number): number {
  //   return 0;
  // }

  // convert(url: string): Promise<[false, FileLike<Partial<IUrlFileX>>]> {
  //   return Promise.resolve([false, {
  //     stat() {
  //       return Promise.resolve({name: uuidGen()});
  //     },
  //     open() {
  //       return Promise.resolve(got.stream(url, {
  //         agent: {
  //           http: new HttpsProxyAgent('http://127.0.0.1:10809'),
  //           https: new HttpsProxyAgent('http://127.0.0.1:10809'),
  //         }
  //       }));
  //     }
  //   }]);
  // }

}
