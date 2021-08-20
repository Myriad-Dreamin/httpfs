import {URL} from 'url';
import {
  HttpDirInfo,
  HttpFileInfo,
  HttpFsError,
  IHttpDirent,
  UrlLoadRemoteAction,
  UrlReadStreamAction
} from '../../proto';
import {HttpFsMegaUtils, MegaAsyncError} from './client';
import {Readable} from 'stream';

const mega = require('megajs');

export class MegaUrlAction implements UrlLoadRemoteAction, UrlReadStreamAction {

  constructor(protected url: URL, protected childPath?: string, protected fileHandler: any = undefined) {
    if (!fileHandler) {
      if (this.childPath && this.childPath !== '/') {
        throw new HttpFsError('non-root node needs a fileHandler');
      }
      this.fileHandler = mega.file(this.url.toString());
    }
  }

  createReadStream(): Readable {
    return HttpFsMegaUtils.gotMegaDownload(this.fileHandler, {
      maxConnections: 1,
      forceHttps: true,
    });
  }

  loadRemote(): Promise<IHttpDirent> {
    if (this.childPath && this.childPath !== '/') {
      throw new HttpFsError('loading mega dir/file is not root');
    }

    return new Promise((resolve, reject) => {
      this.fileHandler.loadAttributes((err, fullFile) => {
        if (err) {
          if (HttpFsMegaUtils.RevErrors[err.message]) {
            const ne = MegaAsyncError.errBody(err.message, -HttpFsMegaUtils.RevErrors[err.message], undefined);
            ne.rawCause = err;
            reject(ne);
            return;
          }
          reject(err);
          return;
        }
        if (!fullFile) {
          reject(MegaAsyncError.errBody('invalid file', -9, undefined));
          return;
        }
        resolve(this.toHttpFsDirent(fullFile, '/'));
      });
    });
  }

  protected toHttpFsDirent(fileNode: any, dirCur: string): IHttpDirent {
    if (!fileNode.directory) {
      return this.toHttpFsFile(fileNode, dirCur);
    }
    const dirContainer: HttpDirInfo = this.toHttpFsDir(fileNode, dirCur);

    if (!fileNode.children) return;
    for (const subNode of fileNode.children) {
      dirContainer.children.push(this.toHttpFsDirent(subNode, dirCur + <string>subNode.name + '/'))
    }
    return dirContainer;
  }

  protected toHttpFsDir(fileHandler: any, cp?: string): HttpDirInfo {
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

  protected toHttpFsFile(fileHandler: any, cp?: string): HttpFileInfo {
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
