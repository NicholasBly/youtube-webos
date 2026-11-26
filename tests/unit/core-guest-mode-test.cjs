/**
 * core/guest-mode.js as a unit in a vm sandbox: the two identity entries,
 * corrupt JSON, the cache.
 *
 * Run: node tests/unit/core-guest-mode-test.cjs
 */
const { createReport } = require('../harness/report.cjs');
const { loadSources } = require('../harness/sandbox.cjs');
const { CORE, storageStub } = require('../harness/stubs.cjs');

const report = createReport();
const t = report.check;

(async () => {
  // ---- core/guest-mode.js --------------------------------------------------------------
  {
    const IDENTITY = 'yt.leanback.default::last-identity-used';
    const AUTONAV = 'yt.leanback.default::AUTONAV_FOR_LIVING_ROOM';
    const guest = JSON.stringify({ data: { identityType: 'UNAUTHENTICATED_IDENTITY_TYPE_GUEST' } });
    const signedIn = JSON.stringify({ data: { identityType: 'SIGNED_IN' } });
    const loadGuest = (entries) => {
      const storage = storageStub(entries);
      const { sandbox } = loadSources([CORE('guest-mode.js')], {
        window: { localStorage: storage }
      });
      return { sb: sandbox, storage };
    };

    t(
      'a guest last identity means guest mode',
      loadGuest({ [IDENTITY]: guest }).sb.isGuestMode() === true
    );
    t(
      'a signed-in last identity means not guest, even when AUTONAV says guest',
      loadGuest({ [IDENTITY]: signedIn, [AUTONAV]: '{"data":{"guest":true}}' }).sb.isGuestMode() ===
        false
    );
    t(
      'no last identity: AUTONAV with guest true means guest mode',
      loadGuest({ [AUTONAV]: '{"data":{"guest":true}}' }).sb.isGuestMode() === true
    );
    t(
      'AUTONAV with guest false, or a guest value that is not the boolean true, is not guest',
      loadGuest({ [AUTONAV]: '{"data":{"guest":false}}' }).sb.isGuestMode() === false &&
        loadGuest({ [AUTONAV]: '{"data":{"guest":"true"}}' }).sb.isGuestMode() === false
    );
    t('nothing stored is not guest', loadGuest({}).sb.isGuestMode() === false);
    t(
      'a last identity without the data shape is not guest',
      loadGuest({ [IDENTITY]: '{"foo":1}' }).sb.isGuestMode() === false
    );
    let r = loadGuest({ [IDENTITY]: '{not json' });
    let threw = null;
    let value;
    try {
      value = r.sb.isGuestMode();
    } catch (e) {
      threw = e;
    }
    t(
      'corrupt JSON in the identity entry reads as not guest without throwing',
      threw === null && value === false,
      threw && threw.message
    );
    t(
      'corrupt identity JSON does not fall through to AUTONAV',
      loadGuest({
        [IDENTITY]: '{not json',
        [AUTONAV]: '{"data":{"guest":true}}'
      }).sb.isGuestMode() === false
    );
    t(
      'corrupt AUTONAV JSON reads as not guest',
      loadGuest({ [AUTONAV]: '[' }).sb.isGuestMode() === false
    );

    r = loadGuest({ [IDENTITY]: guest });
    let reads = 0;
    const realGet = r.storage.getItem;
    r.storage.getItem = (k) => (reads++, realGet(k));
    t('setup: the first read hits storage', r.sb.isGuestMode() === true && reads === 1);
    r.storage.store.set(IDENTITY, signedIn);
    t(
      'the answer is cached: a changed entry is not read again',
      r.sb.isGuestMode() === true && reads === 1,
      String(reads)
    );
    r.sb.invalidateGuestModeCache();
    t(
      'after invalidateGuestModeCache() storage is read again and the new identity counts',
      r.sb.isGuestMode() === false && reads === 2,
      String(reads)
    );
    r.storage.store.delete(IDENTITY);
    r.sb.invalidateGuestModeCache();
    t(
      'false is cached too: with no identity both entries are read once, and the next call reads nothing',
      r.sb.isGuestMode() === false && reads === 4 && r.sb.isGuestMode() === false && reads === 4,
      String(reads)
    );
  }

  report.finish();
})();
