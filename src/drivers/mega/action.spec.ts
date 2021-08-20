import {createAndLoadHttpVolume} from '../../fs';
import {GenericUrlAction} from '../../action.generic';
import {MegaUrlAction} from './action';
import {HttpTestSuite} from '../../suite.spec';

jest.setTimeout(5000000);
describe('httpfs', function () {
  GenericUrlAction.registerByDomain('mega.nz', MegaUrlAction);

  it('stat mega file', async () => {
    const volume = await createAndLoadHttpVolume('https://mega.nz/file/6NUlDYpB#eAPUsx_wsDJ5tU8SYP94dkXHw1mGrDj5TBe0BfeL3bU');
    expect(volume).toBeDefined();

    const statRes = volume.statSync('/');
    expect(statRes.isFile()).toBeTruthy();
    const statByNameRes = volume.statSync('/(C84) [幽玄エレコード] 羡望ファーストノート.rar');
    expect(statRes).toEqual(statByNameRes);
  });


  const createMegaHttpFsVolume = async () => await createAndLoadHttpVolume('https://mega.nz/folder/mphTHa7Y#tDZzOlzLE7nNIMNT5K1Hag');

  it('statDir', HttpTestSuite.get(HttpTestSuite.statDir, createMegaHttpFsVolume));
  it('readDir', HttpTestSuite.get(HttpTestSuite.readDir, createMegaHttpFsVolume));
  it('readDirSub', HttpTestSuite.get(HttpTestSuite.readDirSub, createMegaHttpFsVolume));
  it('readDirSubDirectly', HttpTestSuite.get(HttpTestSuite.readDirSubDirectly, createMegaHttpFsVolume));
  it('readFile1', HttpTestSuite.get(HttpTestSuite.readFile1, createMegaHttpFsVolume));
  it('readFile2', HttpTestSuite.get(HttpTestSuite.readFile2, createMegaHttpFsVolume));
  it('readFile3', HttpTestSuite.get(HttpTestSuite.readFile3, createMegaHttpFsVolume));
  it('readFile4', HttpTestSuite.get(HttpTestSuite.readFile4, createMegaHttpFsVolume));
  it('readFileSum', HttpTestSuite.get(HttpTestSuite.readFileSum, createMegaHttpFsVolume));
});
