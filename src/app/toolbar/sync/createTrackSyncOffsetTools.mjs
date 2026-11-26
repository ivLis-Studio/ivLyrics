import { clampSyncOffset } from "./syncOffsetValues.mjs";

export function createTrackSyncOffsetTools({ react, host, readUtils, readTrackOffsets, readCurrentTrackUri, reportError }) {
  const { useState, useRef, useEffect } = react;
  const useCommitEffect = react.useLayoutEffect || useEffect;

  function useTrackSyncOffset(trackUri) {
    const [snapshot, setSnapshot] = useState(null);
    const trackOffsetRef = useRef(0);
    const ownerRef = useRef(null);

    useCommitEffect(() => {
      const owner = { trackUri, loaded: false };
      ownerRef.current = owner;
      trackOffsetRef.current = 0;
      setSnapshot(null);
      if (!trackUri) return undefined;

      let receivedLiveOffset = false;
      const apply = value => {
        const offset = clampSyncOffset(value);
        owner.loaded = true;
        trackOffsetRef.current = offset;
        setSnapshot({ trackUri, offset });
      };
      const handleOffsetChange = ({ detail }) => {
        if (detail?.trackUri !== trackUri || ownerRef.current !== owner) return;
        receivedLiveOffset = true;
        apply(detail.offset);
      };
      const ownsRead = () => ownerRef.current === owner && !receivedLiveOffset;
      host.addEventListener("ivLyrics:offset-changed", handleOffsetChange);
      Promise.resolve().then(() => readTrackOffsets().getOffset(trackUri)).then(offset => {
        if (ownsRead()) apply(offset);
      }, error => {
        if (!ownsRead()) return;
        reportError("[ivLyrics] Failed to load track sync offset:", error);
        apply(0);
      });
      return () => {
        ownerRef.current = null;
        host.removeEventListener("ivLyrics:offset-changed", handleOffsetChange);
      };
    }, [trackUri]);

    const isTrackOffsetLoaded = Boolean(trackUri && snapshot?.trackUri === trackUri);
    const changeTrackOffset = value => {
      const owner = ownerRef.current;
      if (!owner?.loaded || owner.trackUri !== trackUri) return false;
      const playbackUri = readCurrentTrackUri?.();
      if (playbackUri && playbackUri !== trackUri) return false;
      readTrackOffsets().queueOffset(trackUri, value);
      return true;
    };

    return {
      trackOffset: isTrackOffsetLoaded ? snapshot.offset : 0,
      isTrackOffsetLoaded,
      trackOffsetRef,
      changeTrackOffset,
    };
  }

  function useToolbarSyncOffsets(trackUri) {
    const trackOffset = useTrackSyncOffset(trackUri);
    const [globalOffset, setGlobalOffset] = useState(() => clampSyncOffset(readUtils().getGlobalSyncOffset?.() || 0));
    useEffect(() => {
      const handleGlobalOffsetChange = event => setGlobalOffset(clampSyncOffset(event.detail?.offset));
      host.addEventListener("ivLyrics:global-offset-changed", handleGlobalOffsetChange);
      return () => host.removeEventListener("ivLyrics:global-offset-changed", handleGlobalOffsetChange);
    }, []);

    return {
      ...trackOffset,
      globalOffset,
      changeGlobalOffset(value) {
        const offset = clampSyncOffset(value);
        setGlobalOffset(offset);
        readUtils().setGlobalSyncOffset?.(offset);
      },
    };
  }

  return { useTrackSyncOffset, useToolbarSyncOffsets };
}
