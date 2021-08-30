import {HttpVolumeApiContext, UrlReadStreamAction} from '../../proto';
import {URL} from 'url';
import {Readable} from 'stream';
import got from 'got';
import {GotAction} from './got';

export class GotUrlAction implements UrlReadStreamAction {
  constructor(protected url: URL) {
  }

  createReadStream(ctx: HttpVolumeApiContext): Readable {
    return got.stream(this.url, {
      isStream: true,
      agent: GotAction.getAgentOption(ctx),
    });
  }
}
