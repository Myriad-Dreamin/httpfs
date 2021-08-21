import {createAndLoadHttpVolume, createHttpVolume} from './fs';
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
    expect(statRes.atimeMs).not.toEqual(statRes.mtimeMs);
  });

  const createSimpleHttpFsVolume = async () => await createAndLoadHttpVolume('http://0.0.0.0:8000/');

  it('statDir', HttpTestSuite.get(HttpTestSuite.statDir, createSimpleHttpFsVolume));
  it('readDir', HttpTestSuite.get(HttpTestSuite.readDir, createSimpleHttpFsVolume));
  it('readDirSub', HttpTestSuite.get(HttpTestSuite.readDirSub, createSimpleHttpFsVolume));
  it('readDirSubDirectly', HttpTestSuite.get(HttpTestSuite.readDirSubDirectly, createSimpleHttpFsVolume));
  it('readFile1', HttpTestSuite.get(HttpTestSuite.readFile1, createSimpleHttpFsVolume));
  it('readFile2', HttpTestSuite.get(HttpTestSuite.readFile2, createSimpleHttpFsVolume));
  it('readFile3', HttpTestSuite.get(HttpTestSuite.readFile3, createSimpleHttpFsVolume));
  it('readFile4', HttpTestSuite.get(HttpTestSuite.readFile4, createSimpleHttpFsVolume));
  it('readFileSum', HttpTestSuite.get(HttpTestSuite.readFileSum, createSimpleHttpFsVolume));
});
