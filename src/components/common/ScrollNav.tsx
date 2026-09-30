import { useEffect, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

/**
 * Floating up/down scroll buttons.
 * Mounted globally so every page (especially listed views) gets quick
 * top/bottom scroll without users hunting for the scrollbar.
 *
 * - Finds the nearest scrollable container (main content area) and falls
 *   back to window scroll.
 * - Hides itself if the page isn't scrollable.
 */
export default function ScrollNav() {
  const [visible, setVisible] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(false);

  function getScrollEl(): HTMLElement | Window {
    // Most layouts use <main> for the scroll area. Fallback to window.
    const main = document.querySelector("main");
    if (main && main.scrollHeight > main.clientHeight + 4) return main as HTMLElement;
    return window;
  }

  function readState() {
    const el = getScrollEl();
    if (el instanceof Window) {
      const sh = document.documentElement.scrollHeight;
      const ch = window.innerHeight;
      const st = window.scrollY;
      setVisible(sh > ch + 80);
      setAtTop(st < 20);
      setAtBottom(st + ch >= sh - 20);
    } else {
      setVisible(el.scrollHeight > el.clientHeight + 80);
      setAtTop(el.scrollTop < 20);
      setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 20);
    }
  }

  useEffect(() => {
    readState();
    const main = document.querySelector("main");
    const onScroll = () => readState();
    window.addEventListener("scroll", onScroll, { passive: true });
    main?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const interval = window.setInterval(readState, 800); // catch route/content changes
    return () => {
      window.removeEventListener("scroll", onScroll);
      main?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.clearInterval(interval);
    };
  }, []);

  function scrollTo(dir: "up" | "down") {
    const el = getScrollEl();
    if (el instanceof Window) {
      const top = dir === "up" ? 0 : document.documentElement.scrollHeight;
      window.scrollTo({ top, behavior: "smooth" });
    } else {
      el.scrollTo({ top: dir === "up" ? 0 : el.scrollHeight, behavior: "smooth" });
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed right-3 bottom-24 z-50 flex flex-col gap-2">
      <button
        type="button"
        onClick={() => scrollTo("up")}
        disabled={atTop}
        title="Scroll to top"
        className="h-11 w-11 rounded-full bg-primary text-primary-foreground border shadow-lg flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-95"
      >
        <ChevronUp size={20} />
      </button>
      <button
        type="button"
        onClick={() => scrollTo("down")}
        disabled={atBottom}
        title="Scroll to bottom"
        className="h-11 w-11 rounded-full bg-primary text-primary-foreground border shadow-lg flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-95"
      >
        <ChevronDown size={20} />
      </button>
    </div>
  );
}
