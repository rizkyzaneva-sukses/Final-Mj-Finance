"use client";

import { useEffect } from "react";

export function MeetingSheetScaler() {
  useEffect(() => {
    const PAGE_MM = 330;
    const PAD_MM = 10;
    const MM_TO_PX = 96 / 25.4;
    const usablePx = (PAGE_MM - 2 * PAD_MM) * MM_TO_PX;
    let wrapper: HTMLDivElement | null = null;

    function fit() {
      const paper = document.querySelector<HTMLElement>(".meeting-sheet-paper");
      if (!paper) return;
      paper.style.transform = "none";
      const height = paper.getBoundingClientRect().height;
      const scale = Math.min(1, usablePx / height);
      if (scale >= 1) {
        if (wrapper && paper.parentElement === wrapper) {
          wrapper.parentNode?.insertBefore(paper, wrapper);
          wrapper.remove();
          wrapper = null;
        }
        paper.style.transform = "";
        paper.style.transformOrigin = "";
        return;
      }
      if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.style.overflow = "hidden";
        paper.parentNode?.insertBefore(wrapper, paper);
        wrapper.appendChild(paper);
      }
      paper.style.transformOrigin = "top center";
      paper.style.transform = `scale(${scale})`;
      wrapper.style.height = `${height * scale}px`;
    }

    function reset() {
      const paper = document.querySelector<HTMLElement>(".meeting-sheet-paper");
      if (wrapper && paper && paper.parentElement === wrapper) {
        wrapper.parentNode?.insertBefore(paper, wrapper);
        wrapper.remove();
        wrapper = null;
      }
      if (paper) {
        paper.style.transform = "";
        paper.style.transformOrigin = "";
      }
    }

    const onBefore = () => fit();
    const onAfter = () => reset();
    window.addEventListener("beforeprint", onBefore);
    window.addEventListener("afterprint", onAfter);
    return () => {
      window.removeEventListener("beforeprint", onBefore);
      window.removeEventListener("afterprint", onAfter);
      reset();
    };
  }, []);

  return null;
}
