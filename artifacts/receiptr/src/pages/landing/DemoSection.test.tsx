import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";

vi.mock("framer-motion", () => ({
  useReducedMotion: () => true,
  motion: new Proxy({}, {
    get: (_target, tag: string) => ({
      children, variants: _v, initial: _i, animate: _a, transition: _t,
      whileHover: _h, whileInView: _w, viewport: _vp, ...props
    }: Record<string, unknown>) =>
      React.createElement(tag, props, children as React.ReactNode),
  }),
}));

import DemoSection from "./DemoSection";

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

describe("landing demo modals", () => {
  it("shows poster buttons without loading or playing videos before a choice", () => {
    render(<DemoSection />);
    expect(document.querySelectorAll("video")).toHaveLength(0);
    expect(document.querySelectorAll('a[href$=".mp4"]')).toHaveLength(0);
    for (const title of ["Capture", "Find", "Protect"]) {
      expect(screen.getByRole("button", { name: `Play ${title} demo` })).toHaveAttribute("aria-haspopup", "dialog");
    }
  });

  it.each(["Capture", "Find", "Protect"])("opens %s inline with both formats and stops playback on close", (title) => {
    render(<DemoSection />);
    fireEvent.click(screen.getByRole("button", { name: `Play ${title} demo` }));
    const dialog = screen.getByRole("dialog", { name: `${title} — Receebo demo` });
    const video = dialog.querySelector("video")!;
    expect(video).toHaveAttribute("playsinline");
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("controlslist", "nofullscreen nodownload noremoteplayback");
    expect(video.muted).toBe(true);
    expect(video.querySelectorAll("source")).toHaveLength(2);
    expect(video.querySelector('source[type="video/webm"]')).toHaveAttribute("src", expect.stringContaining(`${title.toLowerCase()}.webm`));
    expect(video.querySelector('source[type="video/mp4"]')).toHaveAttribute("src", expect.stringContaining(`${title.toLowerCase()}.mp4`));
    fireEvent.click(screen.getByRole("button", { name: "Close video" }));
    expect(video.pause).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("also opens the description's watch button in the modal and supports Escape", () => {
    render(<DemoSection />);
    fireEvent.click(screen.getByRole("button", { name: "Watch find video" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("explains a video failure without navigating away", () => {
    render(<DemoSection />);
    fireEvent.click(screen.getByRole("button", { name: "Play Capture demo" }));
    fireEvent.error(screen.getByRole("dialog").querySelector("video")!);
    expect(screen.getByRole("alert")).toHaveTextContent("This video couldn’t load");
    expect(screen.getByRole("button", { name: "Close video" })).toBeInTheDocument();
  });
});
