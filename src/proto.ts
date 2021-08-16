import {Readable} from 'stream';
import {Volume} from 'memfs/lib/volume';

export interface UrlReadAction {
  read(buf: Buffer | Uint8Array, off?: number, len?: number, pos?: number): number;
}

export interface UrlReadStreamAction {
  createReadStream(): Readable;
}

export interface UrlWriteAction {
  write(buf: Buffer, off?: number, len?: number, pos?: number): number;
}

interface HttpFileInfoBase {
  name?: string;
  mTime?: number;
  size?: number;
}

export interface HttpFileInfo extends HttpFileInfoBase {
  type: 'file';
}

export interface HttpDirInfo extends HttpFileInfoBase {
  type: 'dir';
}

export type IHttpDirent = HttpFileInfo | HttpDirInfo;

export interface UrlLoadRemoteAction {
  loadRemote(): Promise<IHttpDirent>;
}

export class HttpFsError extends Error {
}

type fsBasicAction = 'open' | 'openSync' | 'close' | 'closeSync';
type fsReadAction = 'read' | 'readSync' | 'readFile' | 'readFileSync' | 'createReadStream';
type fsBasicWriteAction = 'write' | 'writeSync' | 'writeFile' | 'writeFileSync' | 'createWriteStream';
type fsWriteXAction = 'appendFile' | 'appendFileSync' | 'access' | 'accessSync';
type fsTruncateAction = 'ftruncate' | 'ftruncateSync' | 'truncate' | 'truncateSync';
type fsWriteAction = fsBasicWriteAction | fsWriteXAction | fsTruncateAction;
type fsStatAction = 'stat' | 'statSync' | 'fstat' | 'fstatSync' | 'lstat' | 'lstatSync';
type fsDirReadAction = 'readdirSync' | 'readdir';
// mkdirSync mkdir mkdirpSync mkdirp rmdirSync rmdir
type fsAction = fsBasicAction | fsReadAction | fsWriteAction | fsStatAction | fsDirReadAction;
export type HttpVolumeApi = Pick<Volume, fsAction> & {
  loadRemote(): Promise<void>;
};
