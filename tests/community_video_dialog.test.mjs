import assert from "node:assert/strict";
import test from "node:test";
import { createCommunityVideoSubmission } from "../src/features/video/communityVideoSubmission.mjs";
import { createCommunityVideoService } from "../src/features/video/communityVideoService.mjs";
import { createYouTubeVideoMetadata } from "../src/features/video/youtubeVideoMetadata.mjs";

function mountSubmission(utils) {
  const slots = [];
  let index;
  let effects;
  const scope = new AbortController();
  const react = {
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
      return [slots[slot], value => { slots[slot] = value; }];
    },
    useRef(initial) {
      const slot = index++;
      return slots[slot] ??= { current: initial };
    },
    useCallback(callback, dependencies) {
      const slot = index++;
      const previous = slots[slot];
      if (!previous || dependencies.some((item, i) => !Object.is(item, previous.dependencies[i]))) {
        slots[slot] = { callback, dependencies };
      }
      return slots[slot].callback;
    },
    useEffect(effect, dependencies) {
      const slot = index++;
      const previous = slots[slot];
      if (!previous || dependencies.some((item, i) => !Object.is(item, previous.dependencies[i]))) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[slot] = { cleanup: effect(), dependencies };
        });
      }
    },
  };
  const useForm = createCommunityVideoSubmission({ react, utils, i18n: { t: key => key },
    toast: { error: assert.fail, success: assert.fail } });
  return {
    render() {
      index = 0;
      effects = [];
      const view = useForm({ trackUri: "spotify:track:testing", isLocalVideoMode: true, defaultStartTime: 0,
        signal: scope.signal, isCurrent: () => !scope.signal.aborted,
        selectVideo: () => assert.fail("a closed form cannot apply a video"),
      });
      for (const effect of effects) effect();
      return view;
    },
  };
}

const firstId = "FirstVideo1";
const secondId = "OtherVideo2";

test("a slow title cannot replace the new video's title or preview", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const requests = new Map();
  const env = mountSubmission({
    getYouTubeVideoTitle(id, { signal } = {}) {
      const response = Promise.withResolvers();
      requests.set(id, { ...response, signal });
      return response.promise;
    },
  });
  await env.render().openSubmitForm();
  env.render().form.setSubmitUrl(firstId);
  env.render();
  t.mock.timers.tick(500);
  env.render().form.setSubmitUrl(secondId);
  assert.equal(env.render().form.formPreviewVideoId, null);
  t.mock.timers.tick(500);
  requests.get(secondId).resolve("Current title");
  await requests.get(secondId).promise;
  requests.get(firstId).resolve("Previous title");
  await requests.get(firstId).promise;
  const form = env.render().form;
  assert.equal(form.submitVideoTitle, "Current title");
  assert.equal(form.formPreviewVideoId, secondId);
  assert.equal(requests.get(firstId).signal.aborted, true);
});

test("validation that finishes after its draft is cancelled cannot apply a video", async () => {
  const validation = Promise.withResolvers();
  const env = mountSubmission({ validateYouTubeVideo: () => validation.promise });
  await env.render().openSubmitForm();
  env.render().form.setSubmitUrl(firstId);
  const pending = env.render().form.handleSubmit();
  env.render().resetSubmitForm();
  validation.resolve({ valid: true, title: "Expired draft title" });
  await pending;
  assert.equal(env.render().showSubmitForm, false);
  assert.equal(env.render().form.isSubmitting, false);
});

test("closing a title lookup skips the fallback request", async () => {
  const aborter = new AbortController();
  const response = Promise.withResolvers();
  const calls = [];
  const service = createYouTubeVideoMetadata({
    request(url, options) {
      calls.push({ url, options });
      return calls.length === 1 ? response.promise : Promise.resolve(Response.json({ title: "Unexpected fallback" }));
    },
  });
  const pending = service.getYouTubeVideoTitle(firstId, { signal: aborter.signal });
  aborter.abort();
  response.reject(aborter.signal.reason);
  assert.equal(await pending, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.signal.aborted, true);
});

test("closing the draft during account verification prevents an unsent submission", async () => {
  const aborter = new AbortController();
  const authorization = Promise.withResolvers();
  const started = Promise.withResolvers();
  const posts = [];
  const service = createCommunityVideoService({
    extractTrackId: () => "test-track", readSpotifyData: () => null,
    readSyncData: () => ({ resolveTrackIsrc: async () => "USTST2600001" }),
    requireDiscordAuth() { started.resolve(); return authorization.promise; },
    request: async url => { posts.push(url); return Response.json({ success: true }); },
    getApiHeaders: headers => headers, translate: key => key, logDebug() {},
  });
  const pending = service.submitCommunityVideo("spotify:track:testing", firstId, "Title", 0, [], { signal: aborter.signal });
  await started.promise;
  aborter.abort();
  authorization.resolve();
  await assert.rejects(pending, { name: "AbortError" });
  assert.deepEqual(posts, []);
});
