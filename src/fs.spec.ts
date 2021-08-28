import {createHttpVolume} from './fs';
import * as fs from 'fs';
import * as path from 'path';
import {homedir} from 'os';
import {HttpTestSuite, pipelineAsync} from './suite.spec';

jest.setTimeout(500000);
describe('httpfs', function () {

  it('create', () => {
    const volume = createHttpVolume('http://www.baidu.com/');
    expect(volume).toBeDefined();
  });

  it('createReadStream', async () => {
    const volume = await createHttpVolume('http://www.baidu.com/');
    expect(volume).toBeDefined();

    const r = volume.createReadStream('/');
    await pipelineAsync(r, fs.createWriteStream(path.join(homedir(), 'Downloads', 'baidu.html')));
  });

  it('createReadStreamStrict', async () => {
    const volume = await createHttpVolume('http://www.baidu.com/', {
      rootFileAlias: 'baidu.html',
      preload: true,
    });
    expect(volume).toBeDefined();
    expect(volume.existsSync('/baidu.html')).toBeTruthy();
    expect(volume.statSync('/').isDirectory()).toBeTruthy();

    const r = volume.createReadStream('/baidu.html');
    await pipelineAsync(r, fs.createWriteStream(path.join(homedir(), 'Downloads', 'baidu2.html')));
  });

  it('createReadStreamLoadRemote', async () => {
    const volume = createHttpVolume('http://www.baidu.com/');
    expect(volume).toBeDefined();

    await volume.loadRemote();

    const r = volume.createReadStream('/');
    await pipelineAsync(r, fs.createWriteStream(path.join(homedir(), 'Downloads', 'baidu.html')));
  });

  it('stat', async () => {
    const volume = await createHttpVolume('http://www.baidu.com/', {
      preload: true,
    });
    expect(volume).toBeDefined();

    const statRes = volume.statSync('/');
    expect(statRes.isFile()).toBeTruthy();
    expect(statRes.atimeMs).not.toEqual(statRes.mtimeMs);
  });

  const createSimpleHttpFsVolume = async (preload?: boolean) => await createHttpVolume('http://0.0.0.0:8000/', {preload: preload as true});

  it('statDir', HttpTestSuite.get(HttpTestSuite.statDir, createSimpleHttpFsVolume.bind(undefined, true)));
  it('readDir', HttpTestSuite.get(HttpTestSuite.readDir, createSimpleHttpFsVolume.bind(undefined, true)));
  it('readDirSub', HttpTestSuite.get(HttpTestSuite.readDirSub, createSimpleHttpFsVolume));
  it('readDirSubDirectly', HttpTestSuite.get(HttpTestSuite.readDirSubDirectly, createSimpleHttpFsVolume));
  it('readFile1', HttpTestSuite.get(HttpTestSuite.readFile1, createSimpleHttpFsVolume));
  it('readFile2', HttpTestSuite.get(HttpTestSuite.readFile2, createSimpleHttpFsVolume));
  it('readFile3', HttpTestSuite.get(HttpTestSuite.readFile3, createSimpleHttpFsVolume));
  it('readFile4', HttpTestSuite.get(HttpTestSuite.readFile4, createSimpleHttpFsVolume));
  it('readFileSum', HttpTestSuite.get(HttpTestSuite.readFileSum, createSimpleHttpFsVolume));
});
