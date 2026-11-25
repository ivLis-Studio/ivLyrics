import assert from "node:assert/strict";
import test from "node:test";
import { createPageTraditionalConversion } from "../src/lyrics/pageTraditionalConversion.mjs";

for (const clearedUri of [undefined, "spotify:track:fixture"]) {
  test(`a conversion cleared for ${clearedUri ?? "page teardown"} cannot replace newer cache entries or release their request`, async () => {
    const track = { uri: "spotify:track:fixture" };
    const lyrics = [{ text: "original" }];
    const cache = new Map();
    const requests = [];
    const finishes = [];
    let started = 0;

    class Translator {
      async awaitFinished() {}
      romajifyText() {
        return new Promise(resolve => requests.push(resolve));
      }
    }

    const conversion = createPageTraditionalConversion({
      cache,
      getRendererCacheVersion: () => "v1",
      getTranslator: () => Translator,
      processTranslatedLyrics: result => result,
      startLoading: () => ++started,
      finishLoading: (token, options) => finishes.push({ token, ...options }),
      translate: key => key,
      notifyError: message => assert.fail(message),
      notifySuccess() {},
    });

    const first = conversion.request(track, lyrics, "ja", "romaji");
    await Promise.resolve();
    conversion.clear(clearedUri);
    const replacement = conversion.request(track, lyrics, "ja", "romaji");
    await Promise.resolve();
    assert.equal(requests.length, 2);

    requests[0]("stale");
    assert.deepEqual(await first, ["stale"]);
    assert.equal(cache.size, 0);
    const joined = conversion.request(track, lyrics, "ja", "romaji");
    await Promise.resolve();
    assert.equal(requests.length, 2);

    requests[1]("fresh");
    assert.deepEqual(await replacement, ["fresh"]);
    assert.deepEqual(await joined, ["fresh"]);
    assert.deepEqual(cache.get("spotify:track:fixture:trad:ja:romaji:v1"), ["fresh"]);
    assert.deepEqual(finishes, [
      { token: 1, completed: true },
      { token: 2, completed: true },
    ]);
  });
}
