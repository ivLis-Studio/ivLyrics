const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "LyricsService.js"),
  "utf8"
);

function extract(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing production start marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing production end marker: ${endMarker}`);
  return source.slice(start, end);
}

class FakeTimers {
  constructor() {
    this.now = 0;
    this.nextId = 1;
    this.tasks = new Map();
  }

  setTimeout(callback, delay = 0) {
    const id = this.nextId++;
    this.tasks.set(id, {
      callback,
      due: this.now + Number(delay),
    });
    return id;
  }

  clearTimeout(id) {
    this.tasks.delete(id);
  }

  runNextWithoutWaiting() {
    const ready = [...this.tasks.entries()]
      .sort((left, right) => left[1].due - right[1].due || left[0] - right[0])[0];
    assert.ok(ready, "expected a pending timer");
    const [id, task] = ready;
    this.tasks.delete(id);
    this.now = task.due;
    return task.callback();
  }

  async advanceBy(milliseconds) {
    const target = this.now + milliseconds;
    while (true) {
      const ready = [...this.tasks.entries()]
        .filter(([, task]) => task.due <= target)
        .sort((left, right) => left[1].due - right[1].due || left[0] - right[0])[0];
      if (!ready) break;
      const [id, task] = ready;
      this.tasks.delete(id);
      this.now = task.due;
      await task.callback();
      await Promise.resolve();
    }
    this.now = target;
  }
}

function createBootstrapHarness({
  item = null,
  overlay = {},
  helper = {},
  getFullLyrics,
} = {}) {
  const timers = new FakeTimers();
  const getFullLyricsCalls = [];
  const context = {
    console: { error() {} },
    Date: { now: () => timers.now },
    helperDebug() {},
    setTimeout: timers.setTimeout.bind(timers),
    clearTimeout: timers.clearTimeout.bind(timers),
    LyricsService: {
      async getFullLyrics(...args) {
        getFullLyricsCalls.push(args);
        return getFullLyrics?.(...args);
      },
    },
    Spicetify: {
      Player: {
        data: { item },
        getDuration: () => 180000,
      },
      Platform: { History: { location: { pathname: "/" } } },
    },
  };
  context.window = context;
  context.OverlaySender = { enabled: true, ...overlay };
  context.lyricsHelperSender = { enabled: false, ...helper };
  vm.createContext(context);
  vm.runInContext(
    `${extract(
      "    let senderBootstrapTimer = null;",
      "    // Rust helper/overlay의 입력 형식"
    )}\n    globalThis.__scheduleSenderBootstrap = scheduleSenderBootstrap;`,
    context,
    { filename: "LyricsService.bootstrap.extracted.js" }
  );
  return { context, timers, getFullLyricsCalls };
}

function createQueueRuntime(timers) {
  const context = {
    bootstrapCalls: 0,
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    helperDebug() {},
    scheduleSenderBootstrap() {
      context.bootstrapCalls += 1;
    },
    setTimeout: timers.setTimeout.bind(timers),
  };
  context.window = context;
  context.dispatchEvent = () => {};
  vm.createContext(context);
  vm.runInContext(
    `${extract(
      "    const LYRICS_SEND_RETRY_DELAYS =",
      "    const lyricsHelperSender = Object.create"
    )}\n    globalThis.__OverlaySender = OverlaySender;`,
    context,
    { filename: "LyricsService.sender.extracted.js" }
  );
  return { OverlaySender: context.__OverlaySender, context };
}

function createQueuePrototype(timers) {
  return createQueueRuntime(timers).OverlaySender;
}

function createQueueSender(OverlaySender, sendToEndpoint) {
  const sender = Object.create(OverlaySender);
  Object.defineProperties(sender, {
    enabled: { value: true, writable: true },
    _pendingLyricsSend: { value: null, writable: true },
    _lyricsSendActive: { value: false, writable: true },
    lastSentUri: { value: null, writable: true },
    lastSentLyrics: { value: null, writable: true },
    lastSentOffset: { value: null, writable: true },
    _lastSentDedupeToken: { value: null, writable: true },
    lastDeliveredUri: { value: null, writable: true },
    _deliveryGeneration: { value: 0, writable: true },
    _deliveryKey: { value: null, writable: true },
    _terminalDeliveryFailure: { value: null, writable: true },
    _isConnected: { value: false, writable: true },
    sendToEndpoint: { value: sendToEndpoint },
    isStaleTrackSend: { value: () => false },
    scheduleConnectionCheck: {
      value() {
        this.connectionChecks += 1;
      },
    },
    connectionChecks: { value: 0, writable: true },
  });
  return sender;
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

test("initial bootstrap waits for delayed Player metadata within its bounded window", async () => {
  const { context, timers, getFullLyricsCalls } = createBootstrapHarness();

  context.__scheduleSenderBootstrap();
  await timers.advanceBy(1200);
  assert.equal(getFullLyricsCalls.length, 0);
  assert.equal(timers.tasks.size, 1);

  context.Spicetify.Player.data.item = {
    uri: "spotify:track:delayed",
    metadata: { title: "Delayed", artist_name: "Artist" },
  };
  await timers.advanceBy(150);

  assert.equal(getFullLyricsCalls.length, 1);
  assert.equal(getFullLyricsCalls[0][0].uri, "spotify:track:delayed");
});

test("bootstrap stops polling when metadata never becomes ready", async () => {
  const { context, timers, getFullLyricsCalls } = createBootstrapHarness();

  context.__scheduleSenderBootstrap();
  await timers.advanceBy(10000);

  assert.equal(getFullLyricsCalls.length, 0);
  assert.equal(timers.tasks.size, 0);
});

test("a later independent bootstrap starts a fresh metadata window", async () => {
  const { context, timers, getFullLyricsCalls } = createBootstrapHarness();

  context.__scheduleSenderBootstrap();
  await timers.advanceBy(10000);
  assert.equal(timers.tasks.size, 0);

  context.__scheduleSenderBootstrap(0);
  await timers.advanceBy(0);
  context.Spicetify.Player.data.item = {
    uri: "spotify:track:later",
    metadata: { title: "Later" },
  };
  await timers.advanceBy(150);

  assert.equal(getFullLyricsCalls.length, 1);
  assert.equal(getFullLyricsCalls[0][0].uri, "spotify:track:later");
});

test("an overlapping bootstrap schedule preserves stale previous-URI waiting", async () => {
  const previousUri = "spotify:track:previous";
  const { context, timers, getFullLyricsCalls } = createBootstrapHarness({
    item: { uri: previousUri, metadata: { title: "Previous" } },
  });

  context.__scheduleSenderBootstrap(150, previousUri);
  context.__scheduleSenderBootstrap(150);
  await timers.advanceBy(150);
  assert.equal(getFullLyricsCalls.length, 0);

  context.Spicetify.Player.data.item = {
    uri: "spotify:track:current",
    metadata: { title: "Current" },
  };
  await timers.advanceBy(150);

  assert.equal(getFullLyricsCalls.length, 1);
  assert.equal(getFullLyricsCalls[0][0].uri, "spotify:track:current");
});

test("repeated overlapping bootstrap schedules keep the original metadata deadline", async () => {
  const { context, timers, getFullLyricsCalls } = createBootstrapHarness();

  context.__scheduleSenderBootstrap(1000);
  for (let index = 0; index < 8; index += 1) {
    await timers.advanceBy(500);
    context.__scheduleSenderBootstrap(1000);
  }
  await timers.advanceBy(1000);

  assert.equal(getFullLyricsCalls.length, 0);
  assert.equal(timers.tasks.size, 0);
});

test("a different explicit previous URI starts a new bootstrap chain", async () => {
  const { context, timers, getFullLyricsCalls } = createBootstrapHarness({
    item: {
      uri: "spotify:track:B",
      metadata: { title: "Track B" },
    },
  });

  context.__scheduleSenderBootstrap(150, "spotify:track:A");
  context.__scheduleSenderBootstrap(150, "spotify:track:B");
  await timers.advanceBy(150);

  assert.equal(getFullLyricsCalls.length, 0);
  assert.equal(timers.tasks.size, 1);

  context.Spicetify.Player.data.item = {
    uri: "spotify:track:C",
    metadata: { title: "Track C" },
  };
  await timers.advanceBy(150);

  assert.equal(getFullLyricsCalls.length, 1);
  assert.equal(getFullLyricsCalls[0][0].uri, "spotify:track:C");
});

test("an old in-flight rerun cannot replace a newer bootstrap chain", async () => {
  let resolveFirstLookup;
  let lookupCount = 0;
  const { context, timers, getFullLyricsCalls } = createBootstrapHarness({
    item: { uri: "spotify:track:current", metadata: { title: "Current" } },
    getFullLyrics() {
      lookupCount += 1;
      if (lookupCount === 1) {
        return new Promise((resolve) => {
          resolveFirstLookup = resolve;
        });
      }
      return undefined;
    },
  });

  context.__scheduleSenderBootstrap(0);
  const firstLookup = timers.runNextWithoutWaiting();
  await flushMicrotasks();

  context.__scheduleSenderBootstrap(0);
  timers.runNextWithoutWaiting();
  await flushMicrotasks();
  context.__scheduleSenderBootstrap(500);

  resolveFirstLookup();
  await firstLookup;
  await timers.advanceBy(499);
  assert.equal(getFullLyricsCalls.length, 1);

  await timers.advanceBy(1);
  assert.equal(getFullLyricsCalls.length, 2);
  assert.equal(timers.tasks.size, 0);
});

test("valid metadata keeps the ivLyrics page grace alive past metadata deadline", async () => {
  const { context, timers, getFullLyricsCalls } = createBootstrapHarness({
    item: { uri: "spotify:track:page", metadata: { title: "Page Track" } },
  });
  context.Spicetify.Platform.History.location.pathname = "/ivLyrics";

  context.__scheduleSenderBootstrap(0);
  await timers.advanceBy(8000);

  assert.equal(getFullLyricsCalls.length, 1);
  assert.equal(getFullLyricsCalls[0][0].uri, "spotify:track:page");
});

test("failed delivery does not satisfy bootstrap freshness", async () => {
  const uri = "spotify:track:not-delivered";
  const { context, timers, getFullLyricsCalls } = createBootstrapHarness({
    item: { uri, metadata: { title: "Retry Me" } },
    overlay: {
      _lastTrackInfo: { uri },
      lastDeliveredUri: null,
    },
  });

  context.__scheduleSenderBootstrap(0);
  await timers.advanceBy(0);

  assert.equal(getFullLyricsCalls.length, 1);
});

test("failed lyrics send retries and records a later successful delivery", async () => {
  const timers = new FakeTimers();
  const OverlaySender = createQueuePrototype(timers);
  const results = [false, true];
  let sends = 0;
  const sender = createQueueSender(
    OverlaySender,
    async () => {
      sends += 1;
      return results.shift();
    }
  );
  sender.lastSentUri = "spotify:track:retry";
  sender.lastSentLyrics = "hash";
  sender.lastSentOffset = 0;

  const queued = sender.queueLyricsSend("/lyrics", "spotify:track:retry", { id: "retry" });
  await flushMicrotasks();
  await timers.advanceBy(250);
  await queued;

  assert.equal(sends, 2);
  assert.equal(sender.connectionChecks, 1);
  assert.equal(sender.lastDeliveredUri, "spotify:track:retry");
  assert.equal(sender.lastSentUri, "spotify:track:retry");
  assert.equal(sender.lastSentLyrics, "hash");
  assert.equal(sender.lastSentOffset, 0);
  assert.notEqual(sender._lastSentDedupeToken, null);
});

test("terminal lyrics-send failure clears its matching dedupe snapshot", async () => {
  const timers = new FakeTimers();
  const OverlaySender = createQueuePrototype(timers);
  let sends = 0;
  const sender = createQueueSender(OverlaySender, async () => {
    sends += 1;
    return false;
  });
  sender.lastSentUri = "spotify:track:terminal";
  sender.lastSentLyrics = "terminal-hash";
  sender.lastSentOffset = 12;

  const queued = sender.queueLyricsSend("/lyrics", "spotify:track:terminal", { id: "terminal" });
  await flushMicrotasks();
  await timers.advanceBy(250);
  await flushMicrotasks();
  await timers.advanceBy(750);
  await queued;

  assert.equal(sends, 3);
  assert.equal(sender.lastSentUri, null);
  assert.equal(sender.lastSentLyrics, null);
  assert.equal(sender.lastSentOffset, null);
  assert.equal(sender._lastSentDedupeToken, null);
});

test("an older failure cannot clear a newer same-URI dedupe snapshot", async () => {
  const timers = new FakeTimers();
  const OverlaySender = createQueuePrototype(timers);
  const uri = "spotify:track:same";
  const sentPayloads = [];
  const sender = createQueueSender(OverlaySender, async (_endpoint, payload) => {
    sentPayloads.push(payload.id);
    return payload.id === "new";
  });
  sender.lastSentUri = uri;
  sender.lastSentLyrics = "old-hash";
  sender.lastSentOffset = 0;

  const oldQueue = sender.queueLyricsSend("/lyrics", uri, { id: "old" });
  await flushMicrotasks();

  sender.lastSentUri = uri;
  sender.lastSentLyrics = "new-hash";
  sender.lastSentOffset = 25;
  await sender.queueLyricsSend("/lyrics", uri, { id: "new" });
  const newerToken = sender._lastSentDedupeToken;
  await timers.advanceBy(250);
  await oldQueue;

  assert.deepEqual(sentPayloads, ["old", "new"]);
  assert.equal(sender.lastSentUri, uri);
  assert.equal(sender.lastSentLyrics, "new-hash");
  assert.equal(sender.lastSentOffset, 25);
  assert.equal(sender._lastSentDedupeToken, newerToken);
});

test("a newer payload supersedes an older failed retry", async () => {
  const timers = new FakeTimers();
  const OverlaySender = createQueuePrototype(timers);
  const sentPayloads = [];
  const sender = createQueueSender(
    OverlaySender,
    async (_endpoint, payload) => {
      sentPayloads.push(payload.id);
      return payload.id === "new";
    }
  );

  const oldQueue = sender.queueLyricsSend("/lyrics", "spotify:track:old", { id: "old" });
  await flushMicrotasks();
  await sender.queueLyricsSend("/lyrics", "spotify:track:new", { id: "new" });
  await timers.advanceBy(250);
  await oldQueue;

  assert.deepEqual(sentPayloads, ["old", "new"]);
  assert.equal(sender.lastDeliveredUri, "spotify:track:new");
});

test("late success after generation invalidation or disable cannot revive delivery", async () => {
  for (const invalidation of ["generation", "disable"]) {
    const timers = new FakeTimers();
    const OverlaySender = createQueuePrototype(timers);
    let resolveSend;
    const sender = createQueueSender(
      OverlaySender,
      () => new Promise((resolve) => {
        resolveSend = resolve;
      })
    );
    const uri = `spotify:track:late-${invalidation}`;
    sender.lastSentUri = uri;
    sender.lastSentLyrics = "hash";
    sender.lastSentOffset = 0;

    const queued = sender.queueLyricsSend("/lyrics", uri, { id: invalidation });
    await flushMicrotasks();
    if (invalidation === "generation") {
      sender._deliveryGeneration += 1;
      sender._deliveryKey = null;
    } else {
      sender.enabled = false;
    }
    resolveSend(true);
    await queued;

    assert.equal(sender.lastDeliveredUri, null, invalidation);
  }
});

test("a successful lyrics request does not trigger duplicate reconnect recovery", async () => {
  const timers = new FakeTimers();
  const { OverlaySender, context } = createQueueRuntime(timers);
  let sender;
  let reconnectResends = 0;
  sender = createQueueSender(OverlaySender, async () => {
    sender.isConnected = true;
    return true;
  });
  sender.resendWithNewOffset = () => {
    reconnectResends += 1;
  };
  sender.lastSentUri = "spotify:track:connected";
  sender.lastSentLyrics = "hash";
  sender.lastSentOffset = 0;

  await sender.queueLyricsSend("/lyrics", sender.lastSentUri, { id: "connected" });
  await timers.advanceBy(1000);

  assert.equal(sender.lastDeliveredUri, "spotify:track:connected");
  assert.equal(reconnectResends, 0);
  assert.equal(context.bootstrapCalls, 0);
  assert.equal(timers.tasks.size, 0);
});

test("permanently failing lyrics allow only one automatic reconnect resend cycle", async () => {
  const timers = new FakeTimers();
  const { OverlaySender, context } = createQueueRuntime(timers);
  let sends = 0;
  let reconnectResends = 0;
  let reconnectQueue = null;
  let sender;
  const uri = "spotify:track:permanent";
  sender = createQueueSender(OverlaySender, async () => {
    sends += 1;
    sender._isConnected = false;
    return false;
  });
  sender.lastSentUri = uri;
  sender.lastSentLyrics = "hash";
  sender.lastSentOffset = 0;
  sender.resendWithNewOffset = (reason) => {
    reconnectResends += 1;
    sender.lastSentUri = uri;
    sender.lastSentLyrics = "hash";
    sender.lastSentOffset = 0;
    reconnectQueue = sender.queueLyricsSend("/lyrics", uri, { id: "reconnect" }, {
      key: sender._deliveryKey,
      generation: sender._deliveryGeneration,
      isReconnectCycle: reason === "reconnect",
    });
    return reconnectQueue;
  };

  const initialQueue = sender.queueLyricsSend("/lyrics", uri, { id: "initial" });
  await flushMicrotasks();
  await timers.advanceBy(250);
  await flushMicrotasks();
  await timers.advanceBy(750);
  await initialQueue;
  assert.equal(sends, 3);

  sender.isConnected = true;
  await timers.advanceBy(100);
  await flushMicrotasks();
  await timers.advanceBy(250);
  await flushMicrotasks();
  await timers.advanceBy(750);
  await reconnectQueue;

  for (let index = 0; index < 5; index += 1) {
    sender._isConnected = false;
    sender.isConnected = true;
  }
  await timers.advanceBy(5000);

  assert.equal(sends, 6);
  assert.equal(reconnectResends, 1);
  assert.equal(context.bootstrapCalls, 0);
  assert.equal(timers.tasks.size, 0);
});

test("successful reconnect delivery clears suppression for future reconnects", async () => {
  const timers = new FakeTimers();
  const { OverlaySender, context } = createQueueRuntime(timers);
  let sends = 0;
  let reconnectResends = 0;
  let reconnectQueue = null;
  let sender;
  const uri = "spotify:track:recovered";
  sender = createQueueSender(OverlaySender, async () => {
    sends += 1;
    if (sends <= 3) {
      sender._isConnected = false;
      return false;
    }
    return true;
  });
  sender.lastSentUri = uri;
  sender.lastSentLyrics = "hash";
  sender.lastSentOffset = 0;
  sender.resendWithNewOffset = (reason) => {
    reconnectResends += 1;
    sender.lastSentUri = uri;
    sender.lastSentLyrics = "hash";
    sender.lastSentOffset = 0;
    reconnectQueue = sender.queueLyricsSend("/lyrics", uri, { id: reconnectResends }, {
      key: sender._deliveryKey,
      generation: sender._deliveryGeneration,
      isReconnectCycle: reason === "reconnect",
    });
    return reconnectQueue;
  };

  const initialQueue = sender.queueLyricsSend("/lyrics", uri, { id: "initial" });
  await flushMicrotasks();
  await timers.advanceBy(250);
  await flushMicrotasks();
  await timers.advanceBy(750);
  await initialQueue;

  sender.isConnected = true;
  await timers.advanceBy(100);
  await reconnectQueue;
  assert.equal(sender._terminalDeliveryFailure, null);
  assert.equal(sender.lastDeliveredUri, uri);

  sender._isConnected = false;
  sender.isConnected = true;
  await timers.advanceBy(100);
  await reconnectQueue;

  assert.equal(reconnectResends, 2);
  assert.equal(sends, 5);
  assert.equal(context.bootstrapCalls, 1);
  assert.equal(timers.tasks.size, 0);
});

test("lyricsHelperSender owns successful-delivery state", () => {
  const context = { setTimeout };
  vm.createContext(context);
  vm.runInContext(
    `${extract(
      "    const LYRICS_SEND_RETRY_DELAYS =",
      "    window.LyricsService = LyricsService;"
    )}\n    globalThis.__senders = { OverlaySender, lyricsHelperSender };`,
    context,
    { filename: "LyricsService.helper.extracted.js" }
  );

  const { OverlaySender, lyricsHelperSender } = context.__senders;
  assert.equal(Object.hasOwn(lyricsHelperSender, "lastDeliveredUri"), true);
  assert.equal(Object.hasOwn(lyricsHelperSender, "_lastSentDedupeToken"), true);
  assert.equal(Object.hasOwn(lyricsHelperSender, "_deliveryGeneration"), true);
  assert.equal(Object.hasOwn(lyricsHelperSender, "_deliveryKey"), true);
  assert.equal(Object.hasOwn(lyricsHelperSender, "_terminalDeliveryFailure"), true);
  lyricsHelperSender.lastDeliveredUri = "spotify:track:helper";
  assert.equal(OverlaySender.lastDeliveredUri, null);
});
