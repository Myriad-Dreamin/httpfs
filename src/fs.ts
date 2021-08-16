import {IReadStream, IReadStreamOptions, TCallback, TFlags, TMode, Volume} from 'memfs/lib/volume';
import {Link, Node} from 'memfs/lib/node';
import {URL} from 'url';
import got from 'got';
import {PathLike} from 'fs';
import {PassThrough, Readable} from 'stream';
import * as path from 'path';
import {
  HttpFsError,
  HttpVolumeApi,
  IHttpDirent,
  UrlLoadRemoteAction,
  UrlReadAction,
  UrlReadStreamAction,
  UrlWriteAction
} from './proto';

function mask(urlAction: HttpFsURLAction, perm: number) {
  if (!urlAction.read) {
    perm &= ~0o444;
  }
  if (!urlAction.write) {
    perm &= ~0o222;
  }
  return perm;
}

const key = (type: string, id: string | number) => `httpfs.${type}.${id}`;

export type HttpFsURLAction = Partial<UrlReadAction & UrlWriteAction & UrlReadStreamAction> & UrlLoadRemoteAction;

class HttpFsNode extends Node {
  private _key: string;
  protected rawPerm: number;
  protected urlAction: HttpFsURLAction;
  protected isReadOnly: string;
  protected size: number;

  constructor(ino: number, perm: number = 0o666) {
    const action = {
      loadRemote(): Promise<IHttpDirent> {
        return Promise.resolve(undefined);
      }
    };
    super(ino, mask(action, perm));
    this.urlAction = action;
    this.rawPerm = perm;
  }

  protected updateAttributes() {
    this.perm = mask(this.urlAction, this.rawPerm);
    this.mode = (this.mode & ~0o777) | this.perm;
  }

  setAction(action: HttpFsURLAction) {
    this.urlAction = action;
    this.updateAttributes();
  }

  get Key(): string {
    if (!this._key) this._key = key('ino', this.ino);
    return this._key;
  }

  setSize(size: number): void {
    this.size = size;
  }

  getSize(): number {
    return this.size;
  }

  read(buf: Buffer | Uint8Array, off?: number, len?: number, pos?: number): number {
    if (!this.urlAction.read) {
      throw new HttpFsError('Permission Denied: Cannot read');
    }

    return this.urlAction.read(buf, off, len, pos);
  }

  write(buf: Buffer, off?: number, len?: number, pos?: number): number {
    if (!this.urlAction.write) {
      throw new HttpFsError('Permission Denied: Cannot write');
    }

    return this.urlAction.write(buf, off, len, pos);
  }

  getStream(): Readable {
    return this.urlAction.createReadStream();
  }

  canRead(): boolean {
    return !!(this.urlAction.read || this.urlAction.createReadStream);
  }

  canWrite(): boolean {
    return !!this.urlAction.write;
  }

  loadRemote(): Promise<IHttpDirent> {
    return this.urlAction.loadRemote();
  }
}

class HttpLinkNode extends Link {
  node: HttpFsNode;
  private _key: string;
  loaded: boolean;

  constructor(vol: Volume, parent: Link, name: string) {
    super(vol, parent, name);
  }

  setNode(node: Node) {
    super.setNode(node);
    this.loaded = false;
  }

  setAction(action: HttpFsURLAction) {
    this.node.setAction(action);
    this.loaded = true;
  }

  get Key(): string {
    if (!this._key) this._key = key('link', this.getPath());
    return this._key;
  }

  async loadRemote(): Promise<IHttpDirent> {
    const remote = await this.node.loadRemote();
    if (remote.mTime) {
      this.node.ctime = this.node.mtime = new Date(remote.mTime);
    }
    this.node.setSize(remote.size || 0);

    switch (remote?.type) {
      case 'dir':
        this.node.setIsDirectory();
        throw new HttpFsError('not implemented');
      case 'file':
        this.node.setIsFile();
        if (remote.name) {
          this.createChild(remote.name, this.node);
        }
        break;
      default:
        this.node.setIsFile();
        break;
    }

    return remote;
  }
}

class HttpReadStream extends PassThrough {
  upstream?: Readable;
  fd?: number;
  flags?: TFlags;
  mode: TMode;
  path: PathLike;
  autoClose: boolean;

  constructor(private fs: HttpVolume, path: PathLike, private options: IReadStreamOptions) {
    super();
    if (options) {
      this.fd = options.fd;
    }
    this.flags = options?.flags === undefined ? 'r' : options.flags;
    this.mode = options?.mode === undefined ? 0o666 : options.mode;
    this.autoClose = options?.autoClose !== false;
    this.path = path;
  }

  open(): any {
    this.fs.open(this.path, this.flags, this.mode, (er, fd) => {
      if (er) {
        if (this.autoClose) {
          if (this.destroy) this.destroy();
        }
        this.emit('close', er);
        return;
      }

      this.fd = fd;

      if (fd !== undefined) {
        this.emit('open', this.fd);
        this.upstream = (this.fs.fds[this.fd].node as HttpFsNode).getStream();
        this.upstream.pipe(this);
        this.read();
      } else {
        this.emit('close');
      }
    });
  }

  _read(size: number) {
    if (typeof this.fd !== 'number') {
      this.open();
      return this.once('open', function () {
        this._read(size);
      });
    }

    if (this.destroyed) {
      return;
    }

    super._read(size);
  }

  _destroy(error: Error | null, callback: (error: (Error | null)) => void) {
    this.close(err2 => {
      callback(error || err2);
    });
  }

  close(callback: TCallback<void>): any {
    if (callback) this.once('close', callback);

    this.fs.close(this.fd, err => {
      if (err) this.emit('close', err);
      else this.emit('close');
    });

    this.fd = null;
  }
}

class GenericUrlAction implements UrlReadStreamAction, UrlLoadRemoteAction {

  constructor(protected url: URL) {
  }

  async loadRemote(): Promise<IHttpDirent> {
    const res = await got.head(this.url, {
      headers: {
        // 'Accept-Encoding': 'gzip, deflate',
      }
    });
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
        size: sz,
      };
    }
    if (contentType.startsWith('text')) {
      return {
        type: 'file',
        mTime,
        size: sz,
      };
    }

    throw new HttpFsError('not implemented');
  }

  createReadStream(): Readable {
    return got.stream(this.url, {
      isStream: true,
      // autoClose: true,
    });
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

function genericUrlAction(url: URL, childPath: string) {
  if (childPath) {
    url.pathname = path.join(url.pathname, childPath);
  }
  return new GenericUrlAction(url);
}

function adaptAction(action: HttpFsURLAction): HttpFsURLAction {
  return action;
}

export class HttpVolume extends Volume implements HttpVolumeApi {
  root: HttpLinkNode;
  props: {
    Node: new(...args) => HttpFsNode;
    Link: new(...args) => HttpLinkNode;
    File: Volume['props']['File'];
  }
  protected url: string;

  constructor(url: string) {
    super({
      Node: HttpFsNode,
      Link: HttpLinkNode,
    });
    this.url = url;
  }

  getLink(steps: string[]): Link | null {
    return super.getLink(steps);
  }

  createAction(url: URL, childPath?: string): HttpFsURLAction {
    return genericUrlAction(url, childPath);
  }

  createNode(isDirectory?: boolean, perm?: number): HttpFsNode {
    return super.createNode(isDirectory, perm) as HttpFsNode;
  }

  ensureRootAction(): void {
    if (!this.root.loaded) {
      this.root.setAction(adaptAction(this.createAction(new URL(this.url))));
    }
  }

  getResolvedLink(filenameOrSteps: string | string[]): Link | null {
    if (typeof filenameOrSteps === 'string') {
      throw new HttpFsError('not implemented');
    }

    this.ensureRootAction();
    return this.root.walk(filenameOrSteps);
  }

  createReadStream(path: PathLike, options?: IReadStreamOptions | string): IReadStream {
    if (typeof options === 'string') {
      return new HttpReadStream(this, path, {
        mode: options,
      }) as unknown as IReadStream;
    } else {
      return new HttpReadStream(this, path, options) as unknown as IReadStream;
    }
  }

  async loadRemote(): Promise<void> {
    this.ensureRootAction();
    await this.root.loadRemote();
  }
}

export function createHttpVolume(url: string): HttpVolumeApi {
  return new HttpVolume(url);
}

export async function createAndLoadHttpVolume(url: string): Promise<HttpVolumeApi> {
  const volume = createHttpVolume(url);
  await volume.loadRemote();
  return volume;
}
