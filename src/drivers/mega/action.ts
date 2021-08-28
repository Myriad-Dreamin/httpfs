import {URL} from 'url';
import {
  HttpDirInfo,
  HttpFileInfo,
  HttpFsError,
  IHttpDirent,
  UrlLoadRemoteAction,
  UrlReadStreamAction
} from '../../proto';
import {HttpFsMegaUtils, MegaApiContext, MegaApiContextKey, MegaAsyncError, MegaFileObject} from './client';
import {Readable} from 'stream';

const mega = require('megajs');

export class MegaUrlAction implements UrlLoadRemoteAction, UrlReadStreamAction {
  apiContext: MegaApiContext;

  constructor(
    protected url: URL, protected childPath?: string, protected fileHandler: MegaFileObject = undefined) {
    if (!fileHandler) {
      if (this.childPath && this.childPath !== '/') {
        throw new HttpFsError('non-root node needs a fileHandler');
      }
      const fileHandler = mega.file(this.url.toString());
      fileHandler[MegaApiContextKey] = this.apiContext = fileHandler.api;
      fileHandler.isDirectory = fileHandler.directory;
      this.fileHandler = fileHandler;
    } else {
      if (fileHandler[MegaApiContextKey]) {
        this.apiContext = fileHandler[MegaApiContextKey];
      } else {
        this.apiContext = {
          keepalive: false,
          counterId: Number.parseInt(Math.random().toString().substr(2, 10)),
          gateway: `https://g.api.mega.co.nz/`,
        };
      }
    }
  }

  createReadStream(): Readable {
    return HttpFsMegaUtils.gotMegaDownload(this.apiContext, this.fileHandler, {
      maxConnections: 1,
      forceHttps: true,
    });
  }

  async loadRemote(): Promise<IHttpDirent> {
    if (this.childPath && this.childPath !== '/') {
      throw new HttpFsError('loading mega dir/file is not root');
    }

    try {
      // return new Promise(resolve => {
      //   (this.fileHandler as any).loadAttributes((err) => {
      //     console.log(err);
      //     resolve(HttpFsMegaUtils.loadAttributes(this.apiContext, this.fileHandler) as any);
      //   });
      // });
      this.fileHandler = await HttpFsMegaUtils.loadAttributes(this.apiContext, this.fileHandler);
    } catch (err) {
      if (HttpFsMegaUtils.RevErrors[err.message]) {
        const ne = MegaAsyncError.errBody(err.message, -HttpFsMegaUtils.RevErrors[err.message], undefined);
        ne.rawCause = err;
        throw ne;
      } else {
        throw err;
      }
    }
    if (!this.fileHandler) {
      throw MegaAsyncError.errBody('invalid file', -9, undefined);
    }
    return this.toHttpFsDirent(this.fileHandler, '/');
  }

  protected toHttpFsDirent(fileNode: MegaFileObject, dirCur: string): IHttpDirent {
    if (!fileNode.isDirectory) {
      return this.toHttpFsFile(fileNode, dirCur);
    }
    const dirContainer: HttpDirInfo = this.toHttpFsDir(fileNode, dirCur);

    if (!fileNode.children) return;
    for (const subNode of fileNode.children) {
      dirContainer.children.push(this.toHttpFsDirent(subNode, dirCur + subNode.name + '/'));
    }
    return dirContainer;
  }

  protected toHttpFsDir(fileHandler: MegaFileObject, cp?: string): HttpDirInfo {
    return {
      type: 'dir',
      loaded: true,
      name: fileHandler.name,
      size: 0,
      mTime: fileHandler.timestamp,
      cTime: fileHandler.timestamp,
      action: new MegaUrlAction(this.url, cp, fileHandler),
      children: [],
    };
  }

  protected toHttpFsFile(fileHandler: MegaFileObject, cp?: string): HttpFileInfo {
    return {
      type: 'file',
      loaded: true,
      name: fileHandler.name,
      size: fileHandler.size,
      mTime: fileHandler.timestamp,
      cTime: fileHandler.timestamp,
      action: new MegaUrlAction(this.url, cp, fileHandler),
    };
  }
}
