// Read-only browser acceptance of the shipping extension's fallback transport.
// Supply Addon_Lyrics_Lrclib.js bundled with tests/fixtures/initializer-bundle.mjs.
// Force only the direct request to fail; the Spicetify proxy is a real request.
async (page) => {
  const target = "https://lrclib.net/api/get/18694795";
  const proxy = "https://cors-proxy.spicetify.app/" + target;
  const fixture = "https://xpui.app.spotify.com/ivlyrics-cors-fixture";
  await page.unroute("https://**");
  // Serve this bare test document locally, without visiting Spotify or loading
  // any account scripts. Its origin matches the reported desktop request.
  await page.route(fixture, route => route.fulfill({ contentType: "text/html", body:
    '<!doctype html><title>Offline transport fixture</title><script>window.Spicetify={Config:{version:"fixture"}};window.LyricsAddonManager={register(){}};window.transportDiagnostics=[];window.__ivLyricsDebugLog=message=>transportDiagnostics.push(message);</script>' }));
  await page.goto(fixture);
  const requests = [];
  const observe = request => {
    if (request.url() === target || request.url() === proxy) {
      const headers = request.headers();
      requests.push({ url: request.url(), method: request.method(),
        sensitiveHeader: !!(headers.authorization || headers.cookie) });
    }
  };
  page.on("request", observe);
  await page.route(target, route => route.abort("failed"));
  await page.addScriptTag({ path: "Addon_Lyrics_Lrclib.js" });
  try {
    const response = await page.evaluate(async url => {
      const response = await window.IvLyricsLrclibTransport.fetch(url);
      if (!response) throw new Error("LRCLIB fallback returned no response: " + transportDiagnostics.join("; "));
      const body = await response.json();
      return { status: response.status, bodyReadable: true, id: body.id, hasLyrics: !!(body.syncedLyrics || body.plainLyrics) };
    }, target);
    // A rate-limited response still proves browser CORS/readability and must
    // remain a 429, not be hidden by more retries or treated as lyric success.
    if (response.status === 200) {
      if (response.id !== 18694795 || !response.hasLyrics) throw new Error(JSON.stringify(response));
    } else if (response.status !== 429) throw new Error(JSON.stringify(response));
    if (requests.length !== 2 || requests[0].url !== target || requests[1].url !== proxy
      || requests.some(request => request.sensitiveHeader)) throw new Error(JSON.stringify(requests));
    const liveRequests = [...requests];
    requests.length = 0;
    // Independently prove the successful lyric payload with a synthetic proxy
    // response, without attempting to evade or retry a live 429.
    await page.route(proxy, route => route.fulfill({ status: 200, headers: {
      "Access-Control-Allow-Origin": "https://xpui.app.spotify.com", "Content-Type": "application/json",
    }, body: JSON.stringify({ id: 1, syncedLyrics: "[00:01.00]Fixture", plainLyrics: "Fixture" }) }));
    const controlled = await page.evaluate(async url => {
      const response = await window.IvLyricsLrclibTransport.fetch(url);
      const body = await response.json();
      return { status: response.status, id: body.id, text: body.plainLyrics };
    }, target);
    if (controlled.status !== 200 || controlled.id !== 1 || controlled.text !== "Fixture" || requests.length !== 2) {
      throw new Error(JSON.stringify({ controlled, requests }));
    }
    return { directFailure: "simulated browser network/CORS failure", realProxy: response,
      liveRequests, controlledProxyPayload: controlled };
  } finally {
    page.off("request", observe);
    await page.unroute(target);
    await page.unroute(proxy);
    await page.unroute(fixture);
  }
}
