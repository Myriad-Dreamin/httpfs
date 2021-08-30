import {Readable} from 'stream';
import {Volume} from 'memfs/lib/volume';
import {URL} from 'url';

export interface UrlReadAction {
  read(buf: Buffer | Uint8Array, off?: number, len?: number, pos?: number): number;
}

export interface UrlReadStreamAction {
  createReadStream(ctx: HttpVolumeApiContext): Readable;
}

export interface UrlWriteAction {
  write(buf: Buffer, off?: number, len?: number, pos?: number): number;
}

interface HttpFileInfoBase {
  name?: string;
  cTime?: number;
  mTime?: number;
  size?: number;
  action: HttpFsURLAction;
}

export interface HttpFileInfo extends HttpFileInfoBase {
  type: 'file';
  loaded?: boolean;
}

export interface HttpNDirInfo extends HttpFileInfoBase {
  type: 'dir';
  loaded: false;
}

export interface HttpDirInfo extends HttpFileInfoBase {
  type: 'dir';
  loaded: true;
  name: string;
  children: IHttpDirent[];
}

export type IHttpDirent = HttpFileInfo | HttpNDirInfo | HttpDirInfo;

export interface UrlLoadRemoteAction {
  loadRemote(ctx: HttpVolumeApiContext): Promise<IHttpDirent>;
}

export class HttpFsError extends Error {
}

type fsBasicAction = 'open' | 'openSync' | 'close' | 'closeSync';
type fsReadAction = 'read' | 'readSync' | 'readFile' | 'readFileSync' | 'createReadStream';
type fsBasicWriteAction = 'write' | 'writeSync' | 'writeFile' | 'writeFileSync' | 'createWriteStream';
type fsWriteXAction = 'appendFile' | 'appendFileSync' | 'access' | 'accessSync';
type fsBasicActionASync = 'open';
type fsTruncateAction = 'ftruncate' | 'ftruncateSync' | 'truncate' | 'truncateSync';
type fsWriteAction = fsBasicWriteAction | fsWriteXAction | fsTruncateAction;
type fsStatAction = 'stat' | 'statSync' | 'fstat' | 'fstatSync' | 'lstat' | 'lstatSync';
type fsDirReadAction = 'readdirSync' | 'readdir' | 'existsSync';
// mkdirSync mkdir mkdirpSync mkdirp rmdirSync rmdir
type fsAction = fsBasicAction | fsReadAction | fsWriteAction | fsStatAction | fsDirReadAction;
type fsAsyncAction =
  'open'
  | 'readFile'
  | 'writeFile'
  | 'appendFile'
  | 'access'
  | 'truncate'
  | 'stat'
  | 'lstat'
  | 'readdir';

export interface HttpVolumeApiContext {
  proxy?: string;
}

export type HttpVolumeApi = Pick<Volume, fsAction> & {
  loadRemote(): Promise<void>;
  setContext(c: HttpVolumeApiContext): HttpVolumeApi;
  promises: Pick<Volume['promises'], fsAsyncAction>
};

export interface HttpVolumeApiA extends HttpVolumeApi {
  adaptAction(action: HttpFsURLAction): HttpFsURLAction;

  adaptRootAction(action: HttpFsURLAction): HttpFsURLAction;

  setRootAction(action: HttpFsURLAction): void;

  createRootAction(url: URL): HttpFsURLAction;
}

export type HttpFsURLAction = Partial<UrlReadAction & UrlWriteAction & UrlReadStreamAction> & UrlLoadRemoteAction;
