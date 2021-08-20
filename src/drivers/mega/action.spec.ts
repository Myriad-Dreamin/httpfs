import {createAndLoadHttpVolume} from '../../fs';
import {GenericUrlAction} from '../../action.generic';
import {MegaUrlAction} from './action';

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
});
