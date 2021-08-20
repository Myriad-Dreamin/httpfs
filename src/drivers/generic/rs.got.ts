import {UrlReadStreamAction} from '../../proto';
import {URL} from 'url';
import {Readable} from 'stream';
import got from 'got';

export class GotUrlAction implements UrlReadStreamAction {
    constructor(protected url: URL) {
    }

    createReadStream(): Readable {
        return got.stream(this.url, {
            isStream: true,
        });
    }
}
