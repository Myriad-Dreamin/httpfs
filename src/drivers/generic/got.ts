import {HttpVolumeApiContext} from '../../proto';
import HttpsProxyAgent from 'https-proxy-agent/dist/agent';
import * as GotLib from 'got';

export class GotAction {
  static getAgentOption(ctx: HttpVolumeApiContext): GotLib.Options['agent'] {
    if (ctx?.proxy) {
      return {
        http: new HttpsProxyAgent(ctx.proxy),
        https: new HttpsProxyAgent(ctx.proxy),
      }
    }
    return undefined;
  }
}
