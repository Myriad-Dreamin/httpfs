import {URL} from 'url';
import * as stream from 'stream';
import {Readable} from 'stream';
import HttpsProxyAgent from 'https-proxy-agent/dist/agent';
import got, * as GotLib from 'got';
import {RequestError} from 'got';
import {HttpFsError} from '../../proto';

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
  ERateLimit = -4,
  ENoEnt = -9,
  EBlocked = -16,
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

interface MegaFileResponse {
  g: string;
  s: number;
  ip: string[];
  fa: string;
  tl: number;
  msd: number;
  at: string;
}

export class HttpFsMegaUtils {
  static Errors = Errors;
  static RevErrors = revErrors;

  static gotMegaReq<T>(apiContext: {
    sid?: string;
    counterId: number;
    gateway: string;
  }, qs: [string, string][], body: Record<string, any>): Promise<GotLib.Response<T>> {

    const url = new URL(`https://g.api.mega.co.nz/cs`);
    url.searchParams.append('id', (apiContext.counterId++).toString());

    if (apiContext.sid) {
      url.searchParams.append('sid', apiContext.sid);
    }

    for (const q of qs) {
      url.searchParams.append(q[0], q[1]);
    }

    return got.post<T>({
      url,
      json: body,
      responseType: 'json',
      agent: {
        http: new HttpsProxyAgent('http://127.0.0.1:10809'),
        https: new HttpsProxyAgent('http://127.0.0.1:10809'),
      }
    });
    // if (err) return cb(err);
    // if (!resp) return cb(Error('Empty response')); // Some error codes are returned as num, some as array with number.
    //
    // if (resp.length) resp = resp[0];
    //
    // if (!err && typeof resp === 'number' && resp < 0) {
    //   if (resp === -3) {
    //     if (retryno < MAX_RETRIES) {
    //       return setTimeout(() => {
    //         apiContext.request(json, cb, retryno + 1);
    //       }, Math.pow(2, retryno + 1) * 1e3);
    //     }
    //   }
    //
    //   err = Error(ERRORS[-resp]);
    // } else {
    //   if (apiContext.keepalive && resp && resp.sn) {
    //     apiContext.pull(resp.sn);
    //   }
    // }
    //
    // cb(err, resp);
  }


// async function gotMegaLoadDir(file: any) {
//   // const req = file.directory ? {
//   //   a: 'f',
//   //   c: 1,
//   //   ca: 1,
//   //   r: 1,
//   // } : {
//   //   a: 'g',
//   //   p: file.downloadId
//   // };
//   // const _querystring = [];
//   //
//   // if (this.directory) {
//   //   _querystring.push(['n', file.downloadId]);
//   // }
//   //
//   // const response = await gotMegaReq<[{
//   //   g: string;
//   //   s: number;
//   //   ip: string[];
//   //   fa: string;
//   //   tl: number;
//   //   msd: number;
//   //   at: string;
//   // }]>(file.api, _querystring, [req]);
//   // const body = response[0];
//   //
//   // if (file.directory) {
//   //   const filesMap = Object.create(null);
//   //   const nodes = body.f;
//   //   const folder = nodes.find(node => node.k && // the root folder is the one which "n" equals the first part of "k"
//   //     node.h === node.k.split(':')[0]);
//   //   const aes = file.key ? new AES(file.key) : null;
//   //   file.nodeId = folder.h;
//   //   file.timestamp = folder.ts;
//   //   filesMap[folder.h] = file;
//   //
//   //   var _iterator = _createForOfIteratorHelper(nodes),
//   //     _step;
//   //
//   //   try {
//   //     for (_iterator.s(); !(_step = _iterator.n()).done;) {
//   //       let file = _step.value;
//   //       if (file === folder) continue;
//   //       const fileObj = new File(file, file.storage);
//   //       fileObj.loadMetadata(aes, file); // is it the best way to handle file?
//   //
//   //       fileObj.downloadId = [file.downloadId, file.h];
//   //       filesMap[file.h] = fileObj;
//   //     }
//   //   } catch (err) {
//   //     _iterator.e(err);
//   //   } finally {
//   //     _iterator.f();
//   //   }
//   //
//   //   var _iterator2 = _createForOfIteratorHelper(nodes),
//   //     _step2;
//   //
//   //   try {
//   //     for (_iterator2.s(); !(_step2 = _iterator2.n()).done;) {
//   //       let file = _step2.value;
//   //       const parent = filesMap[file.p];
//   //
//   //       if (parent) {
//   //         const fileObj = filesMap[file.h];
//   //         if (!parent.children) parent.children = [];
//   //         parent.children.push(fileObj);
//   //         fileObj.parent = parent;
//   //       }
//   //     }
//   //   } catch (err) {
//   //     _iterator2.e(err);
//   //   } finally {
//   //     _iterator2.f();
//   //   }
//   //
//   //   file.loadMetadata(aes, folder);
//   //
//   //   if (file.key && !file.attributes) {
//   //     return cb(Error('Attributes could not be decrypted with provided key.'));
//   //   }
//   //
//   //   if (file.loadedFile) {
//   //     const loadedNode = filesMap[file.loadedFile];
//   //
//   //     if (typeof loadedNode === 'undefined') {
//   //       cb(Error('Node (file or folder) not found in folder'));
//   //     } else {
//   //       cb(null, loadedNode);
//   //     }
//   //   } else {
//   //     cb(null, file);
//   //   }
//   // } else {
//   //   file.size = body.s;
//   //   file.decryptAttributes(body.at);
//   //
//   //   if (file.key && !file.attributes) {
//   //     return cb(Error('Attributes could not be decrypted with provided key.'));
//   //   }
//   //
//   //   cb(null, file);
//   // }
//   return this;
// }


  static gotMegaDownload(file: any, options: {
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

    if (file.directory) throw new HttpFsError('Can\'t download: folder download isn\'t supported'); // If options.returnCiphertext is true then the ciphertext is returned.
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

    HttpFsMegaUtils.gotMegaReq<[MegaFileResponse]>(file.api, _querystring, [req])
      .then((response: GotLib.Response<[MegaFileResponse]>) => {
        const body = response.body[0];
        if (typeof body === 'number') {
          stream$$1.emit('error', MegaAsyncError.errBody(`Response Error (${body as number}): ${Errors[-body]}`, body, response));
          return;
        }

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
            agent: {
              http: new HttpsProxyAgent('http://127.0.0.1:10809'),
              https: new HttpsProxyAgent('http://127.0.0.1:10809'),
            }
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
        if (err instanceof GotLib.RequestError) {
          stream$$1.emit('error', new MegaAsyncError('Connection error: ' + err.message, err));
        } else {
          stream$$1.emit('error', err);
        }
      });
    return stream$$1;
  }
}
