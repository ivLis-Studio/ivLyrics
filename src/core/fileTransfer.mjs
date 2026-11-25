export function sanitizeFileName(value, fallback = "ivLyrics", maxBytes = 180) {
  const clean = (input) => String(input || "")
    .normalize("NFC")
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u001F\u007F<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[\s.-]+|[\s.-]+$/g, "");

  const safeFallback = clean(fallback) || "ivLyrics";
  let fileName = clean(value) || safeFallback;

  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(fileName)) {
    fileName = `_${fileName}`;
  }

  const byteLimit = Math.max(1, Math.floor(Number(maxBytes) || 180));
  let byteLength = 0;
  let truncated = "";
  for (const char of fileName) {
    const codePoint = char.codePointAt(0);
    const charBytes = codePoint <= 0x7F
      ? 1
      : codePoint <= 0x7FF
        ? 2
        : codePoint <= 0xFFFF
          ? 3
          : 4;
    if (byteLength + charBytes > byteLimit) break;
    truncated += char;
    byteLength += charBytes;
  }

  return truncated.replace(/[\s.-]+$/g, "") || safeFallback;
}

export function createFileTransfer({ host, spicetify }) {
  return {
    async copyToClipboard(text) {
      try {
        if (spicetify?.Platform?.ClipboardAPI?.copy) {
          await spicetify.Platform.ClipboardAPI.copy(text);
          return true;
        }
        // Fallback
        if (host.navigator.clipboard?.writeText) {
          await host.navigator.clipboard.writeText(text);
          return true;
        }
        return false;
      } catch (error) {
        console.error("[Utils] Copy failed:", error);
        return false;
      }
    },

    sanitizeFileName,

    async requestSaveFileTarget(fileName, options = {}) {
      if (typeof host.showSaveFilePicker !== "function") {
        return { handle: null, canceled: false };
      }

      const {
        description = "JSON",
        mimeType = "application/json",
        extensions = [".json"],
      } = options;

      try {
        const handle = await host.showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description,
              accept: {
                [mimeType]: extensions,
              },
            },
          ],
        });
        return { handle, canceled: false };
      } catch (error) {
        if (error?.name === "AbortError") {
          return { handle: null, canceled: true };
        }

        console.warn("[Utils] Save file picker unavailable, falling back to download:", error);
        return { handle: null, canceled: false };
      }
    },

    async saveBlobAs(blob, fileName, saveTarget = null) {
      const handle = saveTarget?.handle || saveTarget;

      if (handle && typeof handle.createWritable === "function") {
        const writable = await handle.createWritable();
        try {
          await writable.write(blob);
          await writable.close();
        } catch (error) {
          // Closing commits the staged file. Discard a failed write instead.
          try { await writable.abort(); } catch { /* The stream may already be closed or errored. */ }
          throw error;
        }
        return "picker";
      }

      const url = host.URL.createObjectURL(blob);
      const link = host.document.createElement("a");
      link.href = url;
      link.download = fileName;
      host.document.body.appendChild(link);
      link.click();
      host.document.body.removeChild(link);
      host.URL.revokeObjectURL(url);

      return "download";
    },
  };
}
