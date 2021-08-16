import {createAndLoadHttpVolume, createHttpVolume} from './fs';
import * as fs from 'fs';
import * as path from 'path';
import {homedir} from 'os';

const stream = require('stream');
const {promisify} = require('util');

export const pipelineAsync = promisify(stream.pipeline);


jest.setTimeout(500000);
describe('httpfs', function () {

  it('create', () => {
    const volume = createHttpVolume('http://www.baidu.com/');
    expect(volume).toBeDefined();
  });

  it('createReadStream', async () => {
    const volume = createHttpVolume('http://www.baidu.com/');
    expect(volume).toBeDefined();

    const r = volume.createReadStream('/');
    await pipelineAsync(r, fs.createWriteStream(path.join(homedir(), 'Downloads', 'baidu.html')));
  });

  it('createReadStreamLoadRemote', async () => {
    const volume = createHttpVolume('http://www.baidu.com/');
    expect(volume).toBeDefined();

    await volume.loadRemote();

    const r = volume.createReadStream('/');
    await pipelineAsync(r, fs.createWriteStream(path.join(homedir(), 'Downloads', 'baidu.html')));
  });

  it('stat', async () => {
    const volume = await createAndLoadHttpVolume('http://www.baidu.com/');
    expect(volume).toBeDefined();

    const statRes = volume.statSync('/');
    expect(statRes.isFile()).toBeTruthy();
    // mTimeMs modified (www.baidu.com)
    expect(statRes.atimeMs).not.toEqual(statRes.mtimeMs);
  });

  // it('stat mega file', async () => {
  //   const volume = await createAndLoadHttpVolume('https://mega.nz/file/6NUlDYpB#eAPUsx_wsDJ5tU8SYP94dkXHw1mGrDj5TBe0BfeL3bU');
  //   expect(volume).toBeDefined();
  //
  //   const statRes = volume.statSync('/');
  //   expect(statRes.isFile()).toBeTruthy();
  //   const statByNameRes = volume.statSync('/(C84) [幽玄エレコード] 羡望ファーストノート.rar');
  //   expect(statRes).toEqual(statByNameRes);
  // });
});
