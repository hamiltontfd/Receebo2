import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

// 30 s promo with burned-in captions, so it reads fine while muted.
// One <video> is rendered for the current viewport (9:16 on narrow screens,
// 16:9 from md up), so phones never download the desktop cut or vice versa.
const WIDE_QUERY = "(min-width: 768px)";
const TITLE = "Receebo in 30 seconds";

export const promoMedia = (file: string) => `${import.meta.env.BASE_URL}media/${file}`;

function useIsWide() {
  const get = () =>
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? true
      : window.matchMedia(WIDE_QUERY).matches;
  const [wide, setWide] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(mql.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);
  return wide;
}

export default function PromoVideoSection() {
  const reduce = useReducedMotion();
  const wide = useIsWide();
  const ratio = wide ? "16x9" : "9x16";
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  // Show the big play button only when playback is up to the visitor:
  // reduced motion, they paused it, or the browser blocked autoplay.
  const [manual, setManual] = useState(!!reduce);
  // Set once the visitor presses play/pause; after that we never auto-resume.
  const userChose = useRef(false);

  const play = () => {
    const v = ref.current;
    if (!v) return;
    const p = v.play();
    if (p && typeof p.catch === "function") p.catch(() => {
      setPlaying(false);
      setManual(true);
    });
  };

  // Autoplay (muted) only while on screen, and never with reduced motion.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    setMuted(true);
    if (reduce) {
      setManual(true);
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      play();
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (userChose.current) return;
        if (entry.isIntersecting) play();
        else v.pause();
      },
      { threshold: 0.35 },
    );
    io.observe(v);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, ratio]);

  const togglePlay = () => {
    const v = ref.current;
    if (!v) return;
    userChose.current = true;
    setManual(true);
    if (v.paused) play();
    else v.pause();
  };

  const toggleSound = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    if (!v.muted && v.paused) {
      userChose.current = true;
      play();
    }
  };

  const btn =
    "flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/40";

  return (
    <section aria-labelledby="promo-video-title" className="pb-20 lg:pb-28" data-testid="promo-video-section">
      <div className="max-w-5xl mx-auto px-6">
        <h2 id="promo-video-title" className="sr-only">{TITLE}</h2>
        <figure className="m-0">
          <div
            data-testid="promo-video-frame"
            className={`relative mx-auto overflow-hidden rounded-2xl border border-border bg-black shadow-[0_30px_60px_-20px_hsl(250_40%_25%/0.35)] ${wide ? "aspect-video w-full" : "aspect-[9/16]"}`}
            style={wide ? undefined : { width: "min(100%, 420px, calc(78svh * 9 / 16))" }}
          >
            <video
              key={ratio}
              ref={ref}
              data-testid="promo-video"
              className="absolute inset-0 h-full w-full object-cover"
              muted
              loop
              playsInline
              preload="metadata"
              poster={promoMedia(`receebo-promo-${ratio}-poster.webp`)}
              width={wide ? 1280 : 720}
              height={wide ? 720 : 1280}
              aria-label={TITLE}
              title={TITLE}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
            >
              <source src={promoMedia(`receebo-promo-${ratio}.webm`)} type="video/webm" />
              <source src={promoMedia(`receebo-promo-${ratio}.mp4`)} type="video/mp4" />
            </video>

            {!playing && manual && (
              <button
                type="button"
                onClick={togglePlay}
                aria-label={`Play video: ${TITLE}`}
                className="group absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 shadow-lg motion-safe:transition-transform motion-safe:group-hover:scale-110">
                  <Play className="h-6 w-6 ml-0.5 fill-current text-foreground" aria-hidden="true" />
                </span>
              </button>
            )}

            <div className="absolute top-3 right-3 flex gap-2">
              {playing && (
                <button type="button" onClick={togglePlay} aria-label="Pause video" className={btn}>
                  <Pause className="h-4 w-4 fill-current" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={toggleSound}
                aria-label={muted ? "Turn sound on" : "Turn sound off"}
                aria-pressed={!muted}
                className={btn}
              >
                {muted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
          </div>
          <figcaption className="mt-3 text-[11px] text-muted-foreground text-center">
            {TITLE}. Captions on screen, sound off until you turn it on. Fictional sample purchase.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
