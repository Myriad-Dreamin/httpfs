import {HttpVolumeApiContext} from '../../proto';
import HttpsProxyAgent from 'https-proxy-agent/dist/agent';
import * as GotLib from 'got';

export class GotAction {
  static getAgentOptionByProxy(proxy: string): GotLib.Options['agent'] {
    if (proxy) {
      return {
        http: new HttpsProxyAgent(proxy),
        https: new HttpsProxyAgent(proxy),
      }
    }
    return undefined;
  }

  static getAgentOption(ctx: HttpVolumeApiContext): GotLib.Options['agent'] {
    return ctx ? GotAction.getAgentOptionByProxy(ctx.proxy) : undefined;
  }
}
