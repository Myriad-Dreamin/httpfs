import {createHttpVolume} from '../../fs';
import {GenericUrlAction} from '../../action.generic';
import {MegaUrlAction} from './action';
import {HttpTestSuite} from '../../suite.spec';

jest.setTimeout(5000000);
describe('httpfs', function () {
  GenericUrlAction.registerByDomain('mega.nz', MegaUrlAction);

  const createMegaHttpFsVolume = async (preload?: boolean) => await createHttpVolume('https://mega.nz/folder/mphTHa7Y#tDZzOlzLE7nNIMNT5K1Hag', {preload});

  it('statDir', HttpTestSuite.get(HttpTestSuite.statDir, createMegaHttpFsVolume.bind(undefined, true)));
  it('readDir', HttpTestSuite.get(HttpTestSuite.readDir, createMegaHttpFsVolume.bind(undefined, true)));
  it('readDirSub', HttpTestSuite.get(HttpTestSuite.readDirSub, createMegaHttpFsVolume));
  it('readDirSubDirectly', HttpTestSuite.get(HttpTestSuite.readDirSubDirectly, createMegaHttpFsVolume));
  it('readFile1', HttpTestSuite.get(HttpTestSuite.readFile1, createMegaHttpFsVolume));
  it('readFile2', HttpTestSuite.get(HttpTestSuite.readFile2, createMegaHttpFsVolume));
  it('readFile3', HttpTestSuite.get(HttpTestSuite.readFile3, createMegaHttpFsVolume));
  it('readFile4', HttpTestSuite.get(HttpTestSuite.readFile4, createMegaHttpFsVolume));
  it('readFileSum', HttpTestSuite.get(HttpTestSuite.readFileSum, createMegaHttpFsVolume));
});
