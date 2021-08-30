import {URL} from 'url';
import {
  HttpDirInfo,
  HttpFileInfo,
  HttpFsError,
  HttpVolumeApiContext,
  IHttpDirent,
  UrlLoadRemoteAction,
  UrlReadStreamAction
} from '../../proto';
import {HttpFsMegaUtils, MegaApiContext, MegaApiContextKey, MegaAsyncError, MegaFileObject} from './client';
import {Readable} from 'stream';

export class MegaUrlAction implements UrlLoadRemoteAction, UrlReadStreamAction {
  apiContext: MegaApiContext;

  constructor(
    protected url: URL, protected childPath?: string, protected fileHandler: MegaFileObject = undefined) {
    if (!fileHandler) {
      if (this.childPath && this.childPath !== '/') {
        throw new HttpFsError('non-root node needs a fileHandler');
      }
      this.fileHandler = HttpFsMegaUtils.fromURL(this.url.toString());
    }
    if (this.fileHandler[MegaApiContextKey]) {
      this.apiContext = this.fileHandler[MegaApiContextKey];
    } else {
      this.apiContext = this.fileHandler[MegaApiContextKey] = HttpFsMegaUtils.createApiContext();
    }
  }

  createReadStream(ctx: HttpVolumeApiContext): Readable {
    return HttpFsMegaUtils.gotMegaDownload(this.apiContext, this.fileHandler, {
      maxConnections: 1,
      forceHttps: true,
      proxy: ctx.proxy,
    });
  }

  async loadRemote(ctx: HttpVolumeApiContext): Promise<IHttpDirent> {
    if (this.childPath && this.childPath !== '/') {
      throw new HttpFsError('loading mega dir/file is not root');
    }

    try {
      this.fileHandler = await HttpFsMegaUtils.loadAttributes(this.apiContext, this.fileHandler, ctx);
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
