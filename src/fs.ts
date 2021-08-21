import {IReadStream, IReadStreamOptions, pathToSteps, TCallback, TFlags, TMode, Volume} from 'memfs/lib/volume';
import {Link, Node} from 'memfs/lib/node';
import {URL} from 'url';
import {PathLike} from 'fs';
import {PassThrough, Readable} from 'stream';
import {HttpDirInfo, HttpFsError, HttpFsURLAction, HttpNDirInfo, HttpVolumeApi, IHttpDirent} from './proto';
import {GenericUrlAction} from './action.generic';

function mask(urlAction: HttpFsURLAction, perm: number) {
  if (!(urlAction.read || urlAction.createReadStream)) {
    perm &= ~0o444;
  }
  if (!urlAction.write) {
    perm &= ~0o222;
  }
  return perm;
}

const key = (type: string, id: string | number) => `httpfs.${type}.${id}`;

class HttpFsNode extends Node {
  private _key: string;
  protected rawPerm: number;
  protected urlAction: HttpFsURLAction;
  protected isReadOnly: string;
  protected size: number;
  context: any;
  loaded: boolean;

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

  setLoaded(loaded: boolean): void {
    this.loaded = loaded;
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
  vol: HttpVolume;
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
  }

  // noinspection DuplicatedCode
  walk(steps: string[], stop?: number, i?: number): HttpLinkNode | null {
    if (!this.loaded) {
      throw new HttpFsError('not loaded link node under synchronous environment');
    }
    if (stop === undefined) {
      stop = steps.length;
    }
    if (i === undefined) {
      i = 0;
    }
    if (i >= steps.length || i >= stop)
      return this;
    let step = steps[i];
    let link = this.getChild(step) as HttpLinkNode | null;
    if (!link)
      return link;
    return link.walk(steps, stop, i + 1);
  }

  // noinspection DuplicatedCode
  async walkAsync(steps: string[], stop?: number, i?: number): Promise<HttpLinkNode | null> {
    if (!this.loaded) {
      return this.loadRemote().then(() => this.walkAsync(steps, stop, i));
    }
    if (stop === undefined) {
      stop = steps.length;
    }
    if (i === undefined) {
      i = 0;
    }
    if (i >= steps.length || i >= stop)
      return this;
    let step = steps[i];
    let link = this.getChild(step) as HttpLinkNode | null;
    if (!link)
      return link;
    return link.walkAsync(steps, stop, i + 1);
  }

  get Key(): string {
    if (!this._key) this._key = key('link', this.getPath());
    return this._key;
  }

  async loadRemote(remote?: IHttpDirent): Promise<IHttpDirent> {
    if (this.loaded && this.node.loaded) {
      return undefined;
    }
    remote = remote || await this.node.loadRemote();
    if (remote.mTime) {
      this.node.ctime = this.node.mtime = new Date(remote.mTime);
    }
    if (remote.cTime) {
      this.node.ctime = new Date(remote.cTime);
      this.node.mtime = this.node.mtime || this.node.ctime;
    }
    this.node.setSize(remote.size || 0);
    this.node.setLoaded(this.loaded = remote.loaded);
    this.node.setAction(this.vol.adaptAction(remote.action));

    switch (remote?.type) {
      case 'dir':
        this.node.setIsDirectory();
        if (remote.loaded) {
          for (const ch of Object.keys(this.children)) {
            this.deleteChild(this.children[ch]);
          }
          const promises = [];
          for (const ch of remote.children) {
            const d = this.vol.createNode(ch.type === 'dir', 0o644) as HttpFsNode;
            const l = this.vol.createLink() as HttpLinkNode;
            l.setNode(d);
            this.setChild(ch.name, l);
            l.steps = this.steps.concat([ch.name]);
            if (ch.loaded) {
              promises.push(l.loadRemote(ch));
            } else {
              d.setAction(this.vol.adaptAction(ch.action));
            }
          }
          if (promises.length) {
            await Promise.all(promises);
          }
        }
        break;
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

function isDir(d: IHttpDirent): d is (HttpDirInfo | HttpNDirInfo) {
  return d.type === 'dir';
}

function adaptLoadRemoteAction(volume: HttpVolume, action: HttpFsURLAction, optionRootName?: string): HttpFsURLAction {
  const l = action.loadRemote;
  action.loadRemote = async function (): Promise<IHttpDirent> {
    const dirent = await l.call(this);
    if (isDir(dirent)) {

      // adapt it if necessary
      dirent.action = dirent.action.loadRemote === action.loadRemote ?
        dirent.action : adaptLoadRemoteAction(volume, action, optionRootName);
      return dirent;
    }
    if (!dirent.name) {
      dirent.name = optionRootName || 'nameless-file';
    }
    return {
      type: 'dir',
      name: '',
      loaded: true,
      action,
      children: [dirent],
    }
  }
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
  protected options?: Omit<HttpVolumeOption, 'preload'>;

  constructor(url: string, options?: Omit<HttpVolumeOption, 'preload'>) {
    super({
      Node: HttpFsNode,
      Link: HttpLinkNode,
    });
    this.url = url;
    this.options = {...options};
    this.root.setAction(this.createRootAction(new URL(this.url)));

    const a = super['wrapAsync'];
    (super['wrapAsync'] as unknown as any) = (method: (...args: any[]) => any, args: any[], callback: (...args: any[]) => any) => {
      switch (method) {
        case this['openBase']:
        case this['readFileBase']:
        case this['writeFileBase']:
        case this['appendFileBase']:
        case this['accessBase']:
        case this['truncateBase']:
        case this['statBase']:
        case this['lstatBase']:
        case this['readdirBase']:
          const steps = pathToSteps(args[0]);
          for (let i = 0; i < steps.length; i++) {
          }
          return this.root.walkAsync(steps).then(() => {
            return new Promise((resolve, reject) => {
              return a.call(this, method, args, (err, ...args) => {
                if (err) {
                  // todo: handle
                  callback(err, ...args);
                  reject(err);
                } else {
                  callback(err, ...args);
                  resolve(args);
                }
              });
            }).catch(callback);
          }).catch(callback);
      }
      return a.call(this, method, args, callback);
    }

    // type fsAsyncAction = 'open' | 'readFile' | 'writeFile' | 'appendFile' | 'access' | 'truncate' | 'stat' | 'lstat' | 'readdir';
  }

  getLink(steps: string[]): Link | null {
    return super.getLink(steps);
  }

  adaptAction(action: HttpFsURLAction): HttpFsURLAction {
    return action;
  }

  createRootAction(url: URL): HttpFsURLAction {
    const g = new GenericUrlAction(url);
    if (this.options.rootFileAlias) {
      return adaptLoadRemoteAction(this, g,
        typeof this.options.rootFileAlias === 'string' ? this.options.rootFileAlias : undefined);
    }
    return g;
  }

  createNode(isDirectory?: boolean, perm?: number): HttpFsNode {
    return super.createNode(isDirectory, perm) as HttpFsNode;
  }

  getResolvedLink(filenameOrSteps: string | string[]): Link | null {
    if (typeof filenameOrSteps === 'string') {
      throw new HttpFsError('not implemented');
    }

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
    await this.root.loadRemote();
  }
}

interface baseHttpVolumeOption {
  preload?: boolean;
  rootFileAlias?: boolean | string;
}

interface PreloadHttpVolumeOption extends baseHttpVolumeOption {
  preload: true;
}

interface NPreloadHttpVolumeOption extends baseHttpVolumeOption {
  preload: false;
}

export type HttpVolumeOption = baseHttpVolumeOption | PreloadHttpVolumeOption | NPreloadHttpVolumeOption;

export function createHttpVolume(url: string, options?: baseHttpVolumeOption): HttpVolumeApi;
export function createHttpVolume(url: string, options: PreloadHttpVolumeOption): Promise<HttpVolumeApi>;
export function createHttpVolume(url: string, options: NPreloadHttpVolumeOption): HttpVolumeApi;
export function createHttpVolume(url: string, options?: HttpVolumeOption): HttpVolumeApi | Promise<HttpVolumeApi> {
  const volume = new HttpVolume(url, options);
  if (options?.preload) {
    return volume.loadRemote().then(() => volume);
  }
  return volume;
}
