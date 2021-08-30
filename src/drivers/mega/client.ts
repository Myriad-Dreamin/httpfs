import {URL} from 'url';
import * as stream from 'stream';
import {Readable} from 'stream';
import HttpsProxyAgent from 'https-proxy-agent/dist/agent';
import got, * as GotLib from 'got';
import {RequestError} from 'got';
import {HttpFsError} from '../../proto';
import * as crypto from 'crypto';

const mega = require('megajs');

const Errors: Record<number, string> = {
  1: 'EINTERNAL (-1): An internal error has occurred. Please submit a bug report, detailing the exact circumstances in which this error occurred.',
  2: 'EARGS (-2): You have passed invalid arguments to this command.',
  3: 'EAGAIN (-3): A temporary congestion or server malfunction prevented your request from being processed. No data was altered. Retried Many times.',
  4: 'ERATELIMIT (-4): You have exceeded your command weight per time quota. Please wait a few seconds, then try again (this should never happen in sane real-life applications).',
  5: 'EFAILED (-5): The upload failed. Please restart it from scratch.',
  6: 'ETOOMANY (-6): Too many concurrent IP addresses are accessing this upload target URL.',
  7: 'ERANGE (-7): The upload file packet is out of range or not starting and ending on a chunk boundary.',
  8: 'EEXPIRED (-8): The upload target URL you are trying to access has expired. Please request a fresh one.',
  9: 'ENOENT (-9): Object (typically, node or user) not found. Wrong password?',
  10: 'ECIRCULAR (-10): Circular linkage attempted',
  11: 'EACCESS (-11): Access violation (e.g., trying to write to a read-only share)',
  12: 'EEXIST (-12): Trying to create an object that already exists',
  13: 'EINCOMPLETE (-13): Trying to access an incomplete resource',
  14: 'EKEY (-14): A decryption operation failed (never returned by the API)',
  15: 'ESID (-15): Invalid or expired user session, please relogin',
  16: 'EBLOCKED (-16): User blocked',
  17: 'EOVERQUOTA (-17): Request over quota',
  18: 'ETEMPUNAVAIL (-18): Resource temporarily not available, please try again later'
}; // The original MEGA package used https://g.api.mega.co.nz/
const revErrors: Record<string, number> = {};
for (const k of Object.keys(Errors)) {
  revErrors[Errors[k]] = Number.parseInt(k);
}

export enum MegaAsyncErrno {
  EUnknown = 0,
  EInternal = -1,
  EArgs = -2,
  EAgain = -3,
  ERateLimit = -4,
  EFailed = -5,
  ETooMany = -6,
  ENoEnt = -9,
  EBlocked = -16,
  EWrongUrl = -101,
  EWrongKey = -102,
}

export class MegaAsyncError extends HttpFsError {
  rawCause?: Error;
  socketCode: string;
  httpCode: number;
  cause: MegaAsyncErrno;
  megaTimeLeft?: number;

  constructor(message: string, cause?: Error, response?: GotLib.Response) {
    super(message);
    this.rawCause = cause;
    this.cause = MegaAsyncErrno.EUnknown;
    this.setup(response);
  }

  static errBody(message: string, body: number, resp: GotLib.Response): MegaAsyncError {
    const err = new MegaAsyncError(message, undefined, resp);
    if (!err.cause) {
      err.cause = body;
    }
    return err;
  }

  protected setup(response?: GotLib.Response): void {
    if (this.rawCause instanceof RequestError) {
      this.socketCode = this.rawCause.code;
      response = this.rawCause.response || response;
      if (response) {
        this.setupResponse(response);
      }
    } else if (response) {
      this.setupResponse(response);
    }
  }

  protected setupResponse(response: GotLib.Response): void {
    this.httpCode = response.statusCode;
    this.megaTimeLeft = undefined;
    const rateLimitNotify: string = response.headers['x-mega-time-left'] as string;
    if (rateLimitNotify) {
      const x = Number.parseInt(rateLimitNotify);
      this.cause = MegaAsyncErrno.ERateLimit;
      if (!Number.isNaN(x)) {
        this.megaTimeLeft = x;
      }
    }
  }

}

interface MegaFileInfoResponse {
  g: string;
  s: number;
  ip: string[];
  fa: string;
  tl: number;
  msd: number;
  at: string;
}

export const MegaApiContextKey = Symbol('context');
const LABEL_NAMES = ['', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'grey'] as const;
type megaLabelNames = typeof LABEL_NAMES;

export interface MegaFileObject {
  [MegaApiContextKey]: MegaApiContext;

  type: number;
  isDirectory: boolean;
  favorited: boolean;
  loadedFile: string;
  owner: string;
  downloadId: string | string[];
  nodeId: string;
  key: Buffer;
  size?: number;
  name?: string;
  label?: megaLabelNames[number];
  timestamp?: number;
  attributes: Record<string, any>;
  children: MegaFileObject[];
  parent: MegaFileObject;
}

export interface MegaApiContext {
  keepalive: boolean;
  sid?: string;
  counterId: number;
  gateway: string;
}


class AES {
  key: Buffer;

  constructor(key: Buffer) {
    if (key.length !== 16) throw Error('Wrong key length. Key must be 128bit.');
    // this.key = Buffer.alloc(key.length);
    // key.copy(this.key);
    this.key = key;
  }

  encryptCBC(buffer: Buffer) {
    const iv = Buffer.alloc(16, 0);
    const cipher = crypto.createCipheriv('aes-128-cbc', this.key, iv).setAutoPadding(false);
    const result = Buffer.concat([cipher.update(buffer), cipher.final()]);
    result.copy(buffer);
    return result;
  }

  decryptCBC(buffer: Buffer) {
    const iv = Buffer.alloc(16, 0);
    const decipher = crypto.createDecipheriv('aes-128-cbc', this.key, iv).setAutoPadding(false);
    const result = Buffer.concat([decipher.update(buffer), decipher.final()]);
    result.copy(buffer);
    return result;
  }

  stringhash(buffer: Buffer) {
    const h32 = [0, 0, 0, 0];

    for (let i = 0; i < buffer.length; i += 4) {
      if (buffer.length - i < 4) {
        const len = buffer.length - i;
        h32[i / 4 & 3] ^= buffer.readIntBE(i, len) << (4 - len) * 8;
      } else {
        h32[i / 4 & 3] ^= buffer.readInt32BE(i);
      }
    }

    let hash = Buffer.allocUnsafe(16);

    for (let i = 0; i < 4; i++) {
      // > v10.0 notAssert: , true
      hash.writeInt32BE(h32[i], i * 4);
    }

    const cipher = crypto.createCipheriv('aes-128-ecb', this.key, Buffer.alloc(0));

    for (let i = 16384; i--;) hash = cipher.update(hash);

    const result = Buffer.allocUnsafe(8);
    hash.copy(result, 0, 0, 4);
    hash.copy(result, 4, 8, 12);
    return result;
  }

  encryptECB(buffer: Buffer) {
    const cipher = crypto.createCipheriv('aes-128-ecb', this.key, Buffer.alloc(0)).setAutoPadding(false);
    const result = cipher.update(buffer);
    result.copy(buffer);
    return result;
  }

  decryptECB(buffer: Buffer) {
    const decipher = crypto.createDecipheriv('aes-128-ecb', this.key, Buffer.alloc(0)).setAutoPadding(false);
    const result = decipher.update(buffer);
    result.copy(buffer);
    return result;
  }

}

interface HttpFileResp {
  sn: string;
  noc: number;
  p: string;
  t: number;
  k: string;
  h: string;
  s: number;
  ts: number;
  u: string;
  key: string;
  directory: boolean;
  loadedFile: string;
  downloadId: string[];
  a?: any;
}

const proxyAgents = {
  http: new HttpsProxyAgent('http://localhost:10809'),
  https: new HttpsProxyAgent('http://localhost:10809'),
};

export class HttpFsMegaUtils {
  static Errors = Errors;
  static RevErrors = revErrors;

  static async gotMegaReq<T extends any[]>(apiContext: MegaApiContext, qs: [string, string][], body: Record<string, any>): Promise<GotLib.Response<T>> {

    const url = new URL(`https://g.api.mega.co.nz/cs`);
    url.searchParams.append('id', (apiContext.counterId++).toString());

    if (apiContext.sid) {
      url.searchParams.append('sid', apiContext.sid);
    }

    for (const q of qs) {
      url.searchParams.append(q[0], q[1]);
    }
    let res: GotLib.Response<T>;
    try {
      res = await got.post<T>({
        url,
        json: body,
        responseType: 'json',
        agent: proxyAgents,
      });
    } catch (err) {
      if (err instanceof GotLib.RequestError) {
        throw new MegaAsyncError('Connection error: ' + err.message, err);
      } else {
        throw err;
      }
    }
    if (!Array.isArray(res.body)) {
      throw new MegaAsyncError('internal error: not array???');
    }

    const respBody = res.body[0];
    if (typeof respBody === 'number') {
      throw MegaAsyncError.errBody(`Response Error (${respBody}): ${Errors[-respBody]}`, respBody, res);
    }

    return res;
  }

  static gotMegaDownload(apiContext: MegaApiContext, file: MegaFileObject, options: {
    start?: number;
    returnCiphertext?: boolean;
    end?: number;
    maxConnections?: number;
    forceHttps?: boolean;
  }): Readable {

    if (!options) options = {};
    const start = options.start || 0;
    const apiStart: number = options.returnCiphertext ? start : start - start % 16;
    let end: number = options.end || null;
    const maxConnections = options.maxConnections || 1;
    const ssl = options.forceHttps ? 2 : 0;
    const req = {
      a: 'g',
      g: 1,
      ssl,
      n: undefined,
      p: undefined,
    };
    const _querystring = [];

    if (file.nodeId) {
      req.n = file.nodeId;
    } else if (Array.isArray(file.downloadId)) {
      _querystring.push(['n', file.downloadId[0]]);
      req.n = file.downloadId[1];
    } else {
      req.p = file.downloadId;
    }

    if (file.isDirectory) throw new HttpFsError('Can\'t download: folder download isn\'t supported'); // If options.returnCiphertext is true then the ciphertext is returned.
    // The result can be decrypted later using mega.decrypt() stream

    if (!file.key && !options.returnCiphertext) throw new HttpFsError('Can\'t download: key isn\'t defined');
    const decryptStream = file.key && !options.returnCiphertext ? mega.decrypt(file.key, {
      start: apiStart,
      disableVerification: apiStart !== 0 || end !== null
    }) : new stream.PassThrough();
    const stream$$1: Readable = apiStart === start ? decryptStream : decryptStream.pipe(new mega.StreamSkip({
      skip: start - apiStart
    }));

    function handleMegaErrors(resp: GotLib.Response) {
      if (resp.statusCode === 200) return;

      stream$$1.emit('error', new MegaAsyncError('Response Error: ' + resp.statusMessage, undefined, resp));
    }

    function handleConnectionErrors(err: Error) {
      stream$$1.emit('error', new MegaAsyncError('Connection error: ' + err.message, err));
    }

    HttpFsMegaUtils.gotMegaReq<[MegaFileInfoResponse]>(apiContext, _querystring, [req])
      .then((response: GotLib.Response<[MegaFileInfoResponse]>) => {
        const body = response.body[0];

        if (typeof body.g !== 'string' || body.g.substr(0, 4) !== 'http') {
          stream$$1.emit('error', Error('MEGA servers returned an invalid body, maybe caused by rate limit'));
          return;
        }

        if (!end) end = body.s - 1;
        if (start > end) {
          stream$$1.emit('error', Error('You can\'t download past the end of the file.'));
          return;
        }

        if (maxConnections === 1) {
          const r = got.stream(`${body.g}/${apiStart}-${end}`, {
            agent: proxyAgents,
          });
          r.on('error', handleConnectionErrors);
          r.on('response', handleMegaErrors);
          r.pipe(decryptStream); // Abort stream if required

          stream$$1.on('close', () => {
            r.destroy();
          });

          r.on('downloadProgress', (progress) => {
            stream$$1.emit('downloadProgress', progress);
          });
        } else {
          console.error('...');
          return;
        }
      })
      .catch((err) => {
        stream$$1.emit('error', err);
      });
    return stream$$1;
  }

  static async loadAttributes(apiContext: MegaApiContext, file: MegaFileObject): Promise<MegaFileObject> {
    const _querystring = [];
    let req: any;
    if (file.isDirectory) {
      req = {
        a: 'f',
        c: 1,
        ca: 1,
        r: 1,
      };
      _querystring.push(['n', file.downloadId]);
    } else {
      req = {
        a: 'g',
        p: file.downloadId,
      };
    }

    const res = await HttpFsMegaUtils.gotMegaReq<[{
      f: HttpFileResp[];
      at: string;
      s: number;
    }]>(apiContext, _querystring, [req]);
    const body = res.body[0];

    function d64(s: string): Buffer {
      return Buffer.from(s, 'base64');
    }

    function formatKey(key: Buffer | string): Buffer {
      return typeof key === 'string' ? d64(key) : key;
    } // URL Safe Base64 encode/decode

    function checkConstructorArgument(value: any): void {
      // If a string was passed then check if it's not empty and
      // contains only base64 valid characters
      if (typeof value === 'string' && !/^[\w-]+$/.test(value)) {
        throw Error(`Invalid argument: "${value}"`);
      }
    }

    function unmergeKeyMac(key) {
      const newKey = Buffer.alloc(32);
      key.copy(newKey);

      for (let i = 0; i < 16; i++) {
        newKey.writeUInt8(newKey.readUInt8(i) ^ newKey.readUInt8(16 + i), i);
      }

      return newKey;
    }

    function getCipher(key: Buffer) {
      return new AES(unmergeKeyMac(key).slice(0, 16));
    }

    function unpackAttributes(attrs: Buffer) {
      // read until the first null byte
      let end = 0;

      while (end < attrs.length && attrs.readUInt8(end)) end++;

      const head = attrs.slice(0, end).toString();
      if (head.substr(0, 6) !== 'MEGA{"') return;

      try {
        return JSON.parse(head.substr(4));
      } catch (e) {
        throw new Error(`unpack failed: ${(e as unknown as Error)?.message}`);
      }
    }

    function decryptAttributes(fileObj: MegaFileObject, aes: AES, at: string): void {
      if (!fileObj.key) return;
      const attributes = d64(at);
      getCipher(fileObj.key).decryptCBC(attributes);
      const unpackedAttributes = unpackAttributes(attributes);

      if (unpackedAttributes) {
        fileObj.attributes = unpackedAttributes;
        fileObj.name = unpackedAttributes.n;
        fileObj.label = LABEL_NAMES[unpackedAttributes.lbl || 0];
        fileObj.favorited = !!unpackedAttributes.fav;
      }

      return;
    }

    function loadMetadata(ff: MegaFileObject, f: HttpFileResp, aes: AES) {
      checkConstructorArgument(f.downloadId);
      checkConstructorArgument(f.key);
      checkConstructorArgument(f.loadedFile);
      const parts = f.k.split(':');
      ff.isDirectory = !!f.t;
      ff.type = ff.isDirectory ? 1 : 0;// Cr
      ff.key = formatKey(parts[parts.length - 1]);
      ff.size = f.s || 0;
      ff.timestamp = f.ts || 0;
      ff.owner = f.u;
      if (aes) {
        aes.decryptECB(ff.key);
        if (f.a) {
          decryptAttributes(ff, aes, f.a);
        }
      }
    }

    function createFileFromHttpResp(f: HttpFileResp, aes: AES): MegaFileObject {
      const ff: MegaFileObject = {
        [MegaApiContextKey]: apiContext,
      } as MegaFileObject;
      loadMetadata(ff, f, aes);
      return ff;
    }

    if (file.isDirectory) {
      const filesMap: Record<string, MegaFileObject> = {};
      const nodes = body.f;
      const folder = nodes.find(node => node.k && // the root folder is the one which "n" equals the first part of "k"
        node.h === node.k.split(':')[0]);
      const aes = file.key ? new AES(file.key) : null;
      file.nodeId = folder.h;
      file.timestamp = folder.ts;
      filesMap[folder.h] = file;

      for (const child of nodes) {
        if (child === folder) continue;
        const fileObj = createFileFromHttpResp(child, aes);
        // loadMetadata(fileObj, aes, child); // is it the best way to handle child?

        fileObj.downloadId = [file.downloadId as unknown as string, child.h];
        filesMap[child.h] = fileObj;
      }

      for (const child of nodes) {
        const parent = filesMap[child.p];

        if (parent) {
          const fileObj = filesMap[child.h];
          if (!parent.children) parent.children = [];
          parent.children.push(fileObj);
          fileObj.parent = parent;
        }
      }

      loadMetadata(file, folder, aes);

      if (file.key && !file.attributes) {
        throw new Error('Attributes could not be decrypted with provided key.');
      }

      if (file.loadedFile) {
        const loadedNode = filesMap[file.loadedFile];

        if (typeof loadedNode === 'undefined') {
          throw new Error('Node (file or folder) not found in folder');
        } else {
          return loadedNode;
        }
      }
    } else {
      file.size = body.s;
      decryptAttributes(file, undefined, body.at);

      if (file.key && !file.attributes) {
        throw new Error('Attributes could not be decrypted with provided key.');
      }
    }
    return file;
  }
}
