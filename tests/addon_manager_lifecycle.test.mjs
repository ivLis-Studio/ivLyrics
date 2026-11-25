import assert from "node:assert/strict";
import test from "node:test";
import { createAIAddonManager } from "#ivlyrics/providers/ai/createAIAddonManager.mjs";
import { createLyricsAddonManager } from "#ivlyrics/providers/lyrics/createLyricsAddonManager.mjs";

function addon(id, init, version = "1") {
    return {
        id, name: id, author: "fixture", description: "fixture", version, init,
        supports: { karaoke: true, synced: true, unsynced: false, translate: true },
        getLyrics() {}, getSettingsUI() {}, translateLyrics() {},
    };
}

for (const [type, create] of [["ai", createAIAddonManager], ["lyrics", createLyricsAddonManager]]) {
    const createManager = () => create({ readAddonDebug: () => null, getAddonDebug: () => null, debug() {} });

    test(`${type}: late registration supports synchronous init and isolates add-on init failures`, async context => {
        const errors = [];
        context.mock.method(console, "error", (...args) => errors.push(args));
        const manager = createManager();
        await manager.init();
        const events = [];
        const off = manager.on("addon:registered", event => events.push([event, manager.getAddon(event.id)]));
        let receiver;
        const synchronous = addon("sync", function () { receiver = this; });
        const failed = addon("broken", () => { throw new Error("init failed"); });
        const rejected = addon("rejected", async () => { throw new Error("async init failed"); });
        assert.equal(manager.register(synchronous), true);
        assert.equal(receiver, synchronous);
        assert.equal(manager.register(failed), true);
        assert.equal(manager.register(rejected), true);
        off();
        assert.equal(manager.register(addon("after")), true);
        await Promise.resolve();
        assert.deepEqual(events, [synchronous, failed, rejected].map(value => [{ id: value.id, name: value.name, type }, value]));
        assert.deepEqual(errors.map(([, error]) => error.message), ["init failed", "async init failed"]);
    });

    test(`${type}: startup initializes replacements and skips add-ons removed before their turn`, async () => {
        const manager = createManager();
        const calls = [];
        const started = Promise.withResolvers();
        const finish = Promise.withResolvers();
        manager.register(addon("same", function () {
            calls.push(`same:${this.version}`);
            started.resolve();
            return finish.promise;
        }));
        manager.register(addon("remove", () => calls.push("removed")));
        manager.register(addon("keep", () => calls.push("kept")));
        const first = manager.init();
        await started.promise;
        const second = manager.init();
        const replacement = addon("same", function () { calls.push(`same:${this.version}`); }, "2");
        manager.register(replacement);
        manager.register(replacement);
        manager.markAsMarketplaceAddon("remove");
        assert.equal(manager.unregister("remove"), true);
        assert.equal(manager.isMarketplaceAddon("remove"), false);
        finish.resolve();
        await Promise.all([first, second]);
        assert.deepEqual(calls, ["same:1", "kept", "same:2"]);
        assert.deepEqual(manager.getAddonIds(), ["same", "keep"]);
        assert.equal(manager.getAddon("same"), replacement);
    });
}

test("an AI add-on that only directs motion lyrics passes validation and registers", () => {
    const manager = createAIAddonManager({ getAddonDebug: () => null, debug() {} });
    const director = {
        id: "custom-director", name: "Custom director", author: "fixture", description: "fixture", version: "1",
        getSettingsUI() {}, generateMotionDirection() {},
    };
    assert.deepEqual(manager.validate(director), { valid: true, errors: [] });
    assert.equal(manager.register(director), true);
    assert.equal(manager.getAddon(director.id), director);
    assert.equal(manager.supportsCapability(director.id, "motionDirection"), true);
});
