import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

// YouTube IFrame Player API: needed for getCurrentTime() (reading position) and seekTo() (Rewind).
let apiPromise = null;
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve(window.YT);
      };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.async = true;
      s.onerror = () => {
        apiPromise = null;
        reject(new Error("youtube api failed"));
      };
      document.head.appendChild(s);
    });
  }
  return apiPromise;
}

const ERRORS = {
  2: "קישור הסרטון לא תקין.",
  5: "הנגן לא הצליח להפעיל את הסרטון.",
  100: "הסרטון לא נמצא (אולי נמחק או שהוא פרטי).",
  101: "בעל הסרטון לא מאפשר להציג אותו באתרים אחרים. נסי סרטון אחר.",
  150: "בעל הסרטון לא מאפשר להציג אותו באתרים אחרים. נסי סרטון אחר.",
};

const YouTubePlayer = forwardRef(function YouTubePlayer({ videoId, onDuration, onStateChange }, ref) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const [error, setError] = useState(null);
  // playVideo()/seekTo() called before the player fired onReady are silently ignored by YouTube.
  // Remember them and apply them on onReady (e.g. "הפעלת מצלמה" clicked 1-2 s after opening).
  const readyRef = useRef(false);
  const pendingRef = useRef({ seek: null, play: false });
  const cb = useRef({ onDuration, onStateChange });
  cb.current = { onDuration, onStateChange };

  useImperativeHandle(ref, () => ({
    getCurrentTime: () => playerRef.current?.getCurrentTime?.() ?? 0,
    getDuration: () => playerRef.current?.getDuration?.() ?? 0,
    seekTo: (s) => {
      if (readyRef.current) playerRef.current?.seekTo?.(Math.max(0, s), true);
      else pendingRef.current.seek = Math.max(0, s);
    },
    play: () => {
      if (readyRef.current) playerRef.current?.playVideo?.();
      else pendingRef.current.play = true;
    },
    pause: () => {
      pendingRef.current.play = false;
      playerRef.current?.pauseVideo?.();
    },
    isPlaying: () => playerRef.current?.getPlayerState?.() === 1,
  }));

  useEffect(() => {
    let destroyed = false;
    readyRef.current = false;
    pendingRef.current = { seek: null, play: false };
    const reportDuration = () => {
      const d = playerRef.current?.getDuration?.();
      if (d > 0) cb.current.onDuration?.(d);
    };
    loadYouTubeApi()
      .then((YT) => {
        if (destroyed || !hostRef.current) return;
        const el = document.createElement("div");
        hostRef.current.appendChild(el);
        playerRef.current = new YT.Player(el, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: { rel: 0, playsinline: 1, modestbranding: 1, origin: window.location.origin },
          events: {
            onReady: () => {
              readyRef.current = true;
              reportDuration();
              const p = pendingRef.current;
              if (p.seek !== null) playerRef.current?.seekTo?.(p.seek, true);
              if (p.play) playerRef.current?.playVideo?.();
              pendingRef.current = { seek: null, play: false };
            },
            onStateChange: (e) => {
              reportDuration();
              cb.current.onStateChange?.(e.data);
            },
            onError: (e) => setError(ERRORS[e.data] ?? "הסרטון לא נטען."),
          },
        });
      })
      .catch(() => setError("לא הצלחנו לטעון את נגן YouTube. בדקי את החיבור לאינטרנט ורענני את הדף."));
    return () => {
      destroyed = true;
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, [videoId]);

  return (
    <div>
      <div className="player-wrap" ref={hostRef} aria-label="נגן הסרטון" />
      {error && <div className="msg msg-error" role="alert" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
});

export default YouTubePlayer;
