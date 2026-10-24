// Run on the loopback first_use_server fixture with playwright-cli run-code --filename.
//
// Covers the anchored (creator profile) playlist menu, which the fullscreen
// fixture never reaches: that one renders the in-flow menu, so it cannot see a
// portal that never happens, a menu that escapes its panel, or a menu that
// covers its own trigger.
async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const origin = new URL(page.url()).origin;
  assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin), "Use the offline first-use fixture");
  page.setDefaultTimeout(8000);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, route => route.fulfill({ status: 200, contentType: "text/css", body: "" }));

  for (const theme of ["dark", "light"]) {
    const errors = [];
    const benign = /is deprecated|will be removed in the next major release|not wrapped in act|ReactDOM\.render is no longer supported|Warning: ReactDOM/;
    page.on("pageerror", error => errors.push(String(error)));
    page.on("console", message => { if (message.type() === "error" && !benign.test(message.text())) errors.push(message.text()); });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${origin}/?surface=toolbar&language=en&theme=${theme}`);
    await page.addScriptTag({ url: origin + "/PlaylistPicker.js" });

    await page.evaluate(theme => {
      // The picker asks the platform for the viewer's editable playlists.
      window.Spicetify.Platform = {
        LocalStorageAPI: { namespace: "spotify:user:fixture" },
        RootlistAPI: { getContents: async () => ({ items: [
          { type: "playlist", uri: "spotify:playlist:one", name: "First list", isOwnedBySelf: true },
          { type: "playlist", uri: "spotify:playlist:two", name: "Second list", isOwnedBySelf: true },
        ] }) },
        PlaylistAPI: {
          getMetadata: async () => null,
          find: async () => ({}),
          getContents: async () => ({ items: [] }),
          add: async () => {},
          remove: async () => {},
        },
      };
      document.getElementById("toolbar").innerHTML = "";

      const host = document.createElement("div");
      host.className = "lyrics-creator-profile-modal";
      host.setAttribute("data-ui-theme", theme);
      // A narrow panel is what squeezes the track column: the long provider
      // leaves the subline narrower than the date needs, which is where the
      // artist line used to collapse to nothing.
      host.style.cssText = "position:fixed;left:120px;top:60px;width:460px;height:420px;padding:16px;background:#11131a;color:#f5f7fb;";
      const row = document.createElement("div");
      row.className = "lyrics-creator-profile-track";
      row.style.cssText = "display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;padding:13px 16px;";
      const open = document.createElement("button");
      open.className = "lyrics-creator-profile-track-open";
      open.style.cssText = "display:grid;grid-template-columns:56px minmax(0,1fr);gap:14px;background:none;border:0;color:inherit;text-align:left;";
      open.innerHTML = '<div class="lyrics-creator-profile-track-cover"></div><div class="lyrics-creator-profile-track-main"><div class="lyrics-creator-profile-track-title">Offline song</div><div class="lyrics-creator-profile-track-subline"><span class="lyrics-creator-profile-track-artist">Centimillimental</span><span class="lyrics-creator-profile-track-updated">Updated 10/21/2026</span></div></div>';
      const actions = document.createElement("div");
      actions.className = "lyrics-creator-profile-track-actions";
      // A long provider string is what squeezes the track column in the real
      // panel, and it is what collapsed the artist line.
      const side = document.createElement("div");
      side.className = "lyrics-creator-profile-track-side";
      const score = document.createElement("span");
      score.className = "lyrics-sync-score-badge";
      score.textContent = "20.37 pts";
      const provider = document.createElement("span");
      provider.className = "lyrics-creator-profile-track-provider";
      provider.textContent = "LRCLIB, SPOTIFY-MUSIXMATCH";
      side.append(score, provider);
      // React clears whatever it renders into, so the picker gets its own node.
      const pickerMount = document.createElement("div");
      actions.append(side, pickerMount);
      row.append(open, actions);
      host.append(row);
      document.body.append(host);

      ReactDOM.render(React.createElement(window.PlaylistPicker.PlaylistPickerButton, {
        trackUri: "spotify:track:fixture",
        buttonClassName: "lyrics-creator-profile-track-playlist",
        iconSize: 16,
        anchored: true,
        theme,
        boundary: ".lyrics-creator-profile-modal",
      }), pickerMount);
    }, theme);

    await page.locator(".lyrics-creator-profile-track-playlist").click();
    const popover = page.locator("body > .fullscreen-playlist-popover");
    await popover.waitFor();
    await popover.locator(".fullscreen-playlist-item").first().waitFor();

    const geometry = await page.evaluate(() => {
      const popover = document.querySelector("body > .fullscreen-playlist-popover");
      const modal = document.querySelector(".lyrics-creator-profile-modal");
      const trigger = document.querySelector(".lyrics-creator-profile-track-playlist");
      const subline = document.querySelector(".lyrics-creator-profile-track-subline");
      const artist = document.querySelector(".lyrics-creator-profile-track-artist");
      const updated = document.querySelector(".lyrics-creator-profile-track-updated");
      const p = popover.getBoundingClientRect();
      const m = modal.getBoundingClientRect();
      const t = trigger.getBoundingClientRect();
      const a = artist.getBoundingClientRect();
      const u = updated.getBoundingClientRect();
      const s = subline.getBoundingClientRect();
      const openBtn = document.querySelector(".lyrics-creator-profile-track-open").getBoundingClientRect();
      const mainBox = document.querySelector(".lyrics-creator-profile-track-main").getBoundingClientRect();
      const rowBox = document.querySelector(".lyrics-creator-profile-track").getBoundingClientRect();
      const actionsBox = document.querySelector(".lyrics-creator-profile-track-actions").getBoundingClientRect();
      const scoreBox = document.querySelector(".lyrics-sync-score-badge").getBoundingClientRect();
      const providerBox = document.querySelector(".lyrics-creator-profile-track-provider").getBoundingClientRect();
      return {
        popover: { left: p.left, right: p.right, top: p.top, bottom: p.bottom },
        modal: { left: m.left, right: m.right, top: m.top, bottom: m.bottom },
        trigger: { left: t.left, right: t.right, top: t.top, bottom: t.bottom },
        artist: { width: a.width, right: a.right, text: artist.textContent, clipped: artist.scrollWidth > artist.clientWidth + 1, needed: artist.scrollWidth },
        updated: { right: u.right, width: u.width, text: updated.textContent, clipped: updated.scrollWidth > updated.clientWidth + 1 },
        subline: { right: s.right, width: s.width },
        chain: { row: rowBox.width, actions: actionsBox.width, open: openBtn.width, main: mainBox.width },
        stacked: { score: { top: scoreBox.top, right: scoreBox.right }, provider: { top: providerBox.top, right: providerBox.right } },
        items: popover.querySelectorAll(".fullscreen-playlist-item").length,
        theme: popover.getAttribute("data-ui-theme"),
      };
    });

    assert(geometry.artist.width > 0, "the artist line keeps a real width");
    assert(!geometry.updated.clipped, `the update keeps its room: ${geometry.updated.text}`);
    assert(geometry.updated.right <= geometry.subline.right + 1, "the date does not overflow the row");
    assert(geometry.artist.clipped, "the artist gives way instead: " + geometry.artist.text);
    // Points and source stack in one column, right-aligned with each other.
    assert(geometry.stacked.provider.top >= geometry.stacked.score.top, "the source sits below the points");
    assert(Math.abs(geometry.stacked.provider.right - geometry.stacked.score.right) < 2, "both are right-aligned in the column");

    assert(geometry.items === 2, `the menu lists both playlists, saw ${geometry.items}`);
    assert(geometry.theme === theme, `the menu follows the host theme, saw ${geometry.theme}`);
    assert(geometry.popover.left >= geometry.modal.left - 1,
      `the menu stays inside the modal on the left (${geometry.popover.left} < ${geometry.modal.left})`);
    assert(geometry.popover.right <= geometry.modal.right + 1,
      `the menu stays inside the modal on the right (${geometry.popover.right} > ${geometry.modal.right})`);
    assert(geometry.popover.right <= geometry.trigger.left + 1,
      `the menu never covers its own trigger (${geometry.popover.right} > ${geometry.trigger.left})`);
    assert(errors.length === 0, `page errors: ${errors.join(" | ")}`);
  }
}
