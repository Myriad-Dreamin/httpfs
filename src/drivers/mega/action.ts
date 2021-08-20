import {URL} from 'url';
import {IHttpDirent} from '../../proto';
import {HttpFsMegaUtils, MegaAsyncError} from './client';
import {Readable} from 'stream';

const mega = require('megajs');

export interface FileLike<T> {
  stat?: () => Promise<T>;

  open(): Promise<Readable>;
}

export declare type DirectoryLike<T = Record<any, any>> = Record<string, FileLike<T>>;

export interface IUrlFileX {
  name: string;
}

export class MegaUrlAction {
  fileHandle: any;

  constructor(protected url: URL, protected childPath?: string) {
    this.fileHandle = mega.file(this.url.toString());
  }

  loadRemote(): Promise<IHttpDirent> {
    return new Promise((resolve, reject) => {
      this.fileHandle.loadAttributes((err, fullFile) => {
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

        if (fullFile.directory) {
          const dirLike: DirectoryLike<IUrlFileX> = {};
          this.dfsAllNodes(fullFile, '/', dirLike);
          reject(new Error('todo'));
          return;
        }
        resolve({
          type: 'file',
          loaded: true,
          name: fullFile.name,
          size: fullFile.size,
          action: new MegaUrlAction(this.url, ''),
        });
      });
    });
  }

  private dfsAllNodes(fileNode: any, dirCur: string, dirlike: DirectoryLike) {
    if (fileNode.directory) {
      if (!fileNode.children) return;
      for (const subNode of fileNode.children) {
        this.dfsAllNodes(subNode, dirCur + <string>subNode.name + '/', dirlike);
      }
    } else {
      dirlike[dirCur.substr(0, dirCur.length - 1)] =
        {
          stat() {
            return Promise.resolve({name: <string>fileNode.name});
          },
          open() {
            return Promise.resolve(HttpFsMegaUtils.gotMegaDownload(fileNode, {
              maxConnections: 1,
              forceHttps: true,
            }));
          }
        };
    }
  }

  // convert(url: string): Promise<Url2FileConvertResult> {
  //   const file = mega.file(url);
  //   return new Promise((resolve, reject) => {
  //     file.loadAttributes((err, fullFile) => {
  //       if (err) {
  //         if (revERRORS[err.message]) {
  //           const ne = MegaAsyncError.errBody(err.message, -revERRORS[err.message], undefined);
  //           ne.rawCause = err;
  //           reject(ne);
  //           return;
  //         }
  //         reject(err);
  //         return;
  //       }
  //       if (!fullFile) reject(MegaAsyncError.errBody('invalid file', -9, undefined));
  //
  //       if (fullFile.directory) {
  //         const dirLike: DirectoryLike<IUrlFileX> = {};
  //         this.dfsAllNodes(fullFile, '/', dirLike);
  //         resolve([true, dirLike]);
  //       } else {
  //         resolve([
  //           false,
  //           {
  //             stat() {
  //               return Promise.resolve({name: <string>fullFile.name});
  //             },
  //             open() {
  //               return Promise.resolve(fullFile.download());
  //             }
  //           }
  //         ]);
  //       }
  //     });
  //   });
  // }
  //
  // private dfsAllNodes(fileNode: any, dirCur: string, dirlike: DirectoryLike) {
  //   if (fileNode.directory) {
  //     if (!fileNode.children) return;
  //     for (const subNode of fileNode.children) {
  //       this.dfsAllNodes(subNode, dirCur + <string>subNode.name + '/', dirlike);
  //     }
  //   } else {
  //     dirlike[dirCur.substr(0, dirCur.length - 1)] =
  //       {
  //         stat() {
  //           return Promise.resolve({name: <string>fileNode.name});
  //         },
  //         open() {
  //           return Promise.resolve(gotMegaDownload(fileNode, {
  //             maxConnections: 1,
  //             forceHttps: true,
  //           }));
  //         }
  //       };
  //   }
  // }
}
