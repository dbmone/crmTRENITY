import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { TOUR_STEPS, type TourStep } from "../../data/tourSteps";
import { useTourStore } from "../../store/tour.store";

type RectLike = {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

const TOOLTIP_WIDTH = 300;
const TARGET_PADDING = 8;
const VIEWPORT_PADDING = 16;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function getTargetElement(target?: string) {
  if (!target) return null;
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`));
  return nodes.find(isVisible) ?? null;
}

function getRect(element: HTMLElement | null): RectLike | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    top: Math.max(VIEWPORT_PADDING, rect.top - TARGET_PADDING),
    left: Math.max(VIEWPORT_PADDING, rect.left - TARGET_PADDING),
    width: rect.width + TARGET_PADDING * 2,
    height: rect.height + TARGET_PADDING * 2,
    right: Math.min(window.innerWidth - VIEWPORT_PADDING, rect.right + TARGET_PADDING),
    bottom: Math.min(window.innerHeight - VIEWPORT_PADDING, rect.bottom + TARGET_PADDING),
  };
}

function getTooltipPosition(rect: RectLike | null, placement: TourStep["placement"], tooltipHeight: number) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const tooltipWidth = Math.min(TOOLTIP_WIDTH, viewportWidth - VIEWPORT_PADDING * 2);

  if (!rect || placement === "center") {
    return {
      top: Math.max(80, viewportHeight / 2 - tooltipHeight / 2),
      left: clamp(
        (viewportWidth - tooltipWidth) / 2,
        VIEWPORT_PADDING,
        Math.max(VIEWPORT_PADDING, viewportWidth - tooltipWidth - VIEWPORT_PADDING)
      ),
    };
  }

  const gap = 18;
  const maxTop = Math.max(VIEWPORT_PADDING, viewportHeight - tooltipHeight - VIEWPORT_PADDING);
  const maxLeft = Math.max(VIEWPORT_PADDING, viewportWidth - tooltipWidth - VIEWPORT_PADDING);
  const fitsAbove = rect.top >= tooltipHeight + gap + VIEWPORT_PADDING;
  const fitsBelow = viewportHeight - rect.bottom >= tooltipHeight + gap + VIEWPORT_PADDING;
  const fitsLeft = rect.left >= tooltipWidth + gap + VIEWPORT_PADDING;
  const fitsRight = viewportWidth - rect.right >= tooltipWidth + gap + VIEWPORT_PADDING;

  const resolvedPlacement =
    placement === "top" && !fitsAbove && fitsBelow ? "bottom"
    : placement === "bottom" && !fitsBelow && fitsAbove ? "top"
    : placement === "left" && !fitsLeft && fitsRight ? "right"
    : placement === "right" && !fitsRight && fitsLeft ? "left"
    : !fitsBelow && fitsAbove ? "top"
    : !fitsAbove && fitsBelow ? "bottom"
    : !fitsRight && fitsLeft ? "left"
    : !fitsLeft && fitsRight ? "right"
    : placement;

  switch (resolvedPlacement) {
    case "top":
      return {
        top: clamp(rect.top - tooltipHeight - gap, VIEWPORT_PADDING, maxTop),
        left: clamp(rect.left + rect.width / 2 - tooltipWidth / 2, VIEWPORT_PADDING, maxLeft),
      };
    case "left":
      return {
        top: clamp(rect.top + rect.height / 2 - tooltipHeight / 2, VIEWPORT_PADDING, maxTop),
        left: clamp(rect.left - tooltipWidth - gap, VIEWPORT_PADDING, maxLeft),
      };
    case "right":
      return {
        top: clamp(rect.top + rect.height / 2 - tooltipHeight / 2, VIEWPORT_PADDING, maxTop),
        left: clamp(rect.right + gap, VIEWPORT_PADDING, maxLeft),
      };
    case "bottom":
    default:
      return {
        top: clamp(rect.bottom + gap, VIEWPORT_PADDING, maxTop),
        left: clamp(rect.left, VIEWPORT_PADDING, maxLeft),
      };
  }
}

export default function TourOverlay() {
  const navigate = useNavigate();
  const location = useLocation();

  const active = useTourStore((s) => s.active);
  const role = useTourStore((s) => s.role);
  const stepIndex = useTourStore((s) => s.stepIndex);
  const next = useTourStore((s) => s.next);
  const prev = useTourStore((s) => s.prev);
  const finish = useTourStore((s) => s.finish);
  const skip = useTourStore((s) => s.skip);

  const steps = useMemo(() => (role ? TOUR_STEPS[role] ?? [] : []), [role]);
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  const [targetRect, setTargetRect] = useState<RectLike | null>(null);
  const [targetFound, setTargetFound] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  const [tooltipHeight, setTooltipHeight] = useState(360);
  const tooltipRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!active || !step?.route) return;
    if (location.pathname !== step.route) {
      navigate(step.route, { replace: true });
    }
  }, [active, location.pathname, navigate, step?.route]);

  useEffect(() => {
    if (!active || !step) return;

    const update = () => {
      const element = getTargetElement(step.target);
      if (element) {
        const rect = getRect(element);
        setTargetRect(rect);
        setTargetFound(Boolean(rect));
      } else {
        setTargetRect(null);
        setTargetFound(false);
      }
    };

    const interval = window.setInterval(update, 180);
    update();

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, step]);

  useEffect(() => {
    if (!active || !step?.target) return;
    const element = getTargetElement(step.target);
    if (!element) return;

    window.setTimeout(() => {
      element.scrollIntoView({
        block: window.innerWidth < 640 ? "start" : "center",
        inline: "center",
        behavior: "smooth",
      });
    }, 80);
  }, [active, stepIndex, step?.target]);

  useEffect(() => {
    const measure = () => {
      if (!tooltipRef.current) return;
      const nextHeight = Math.ceil(tooltipRef.current.getBoundingClientRect().height);
      if (nextHeight > 0) {
        setTooltipHeight((current) => (Math.abs(current - nextHeight) > 4 ? nextHeight : current));
      }
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active, isMobile, step, targetFound]);

  if (!active || !step || steps.length === 0) return null;

  const position = getTooltipPosition(targetRect, targetFound ? step.placement : "center", tooltipHeight);
  const progress = Math.round(((stepIndex + 1) / steps.length) * 100);
  const desktopTop = clamp(
    position.top,
    VIEWPORT_PADDING,
    Math.max(VIEWPORT_PADDING, window.innerHeight - tooltipHeight - VIEWPORT_PADDING)
  );
  const desktopLeft = clamp(
    position.left,
    VIEWPORT_PADDING,
    Math.max(
      VIEWPORT_PADDING,
      window.innerWidth - Math.min(TOOLTIP_WIDTH, window.innerWidth - VIEWPORT_PADDING * 2) - VIEWPORT_PADDING
      )
  );
  const mobileShowOnTop = Boolean(targetRect && targetRect.top > window.innerHeight * 0.42);
  const mobileStyle = isMobile
    ? mobileShowOnTop
      ? {
          left: VIEWPORT_PADDING,
          right: VIEWPORT_PADDING,
          top: VIEWPORT_PADDING,
          bottom: "auto" as const,
          maxHeight: "30vh",
          overflowY: "auto" as const,
        }
      : {
          left: VIEWPORT_PADDING,
          right: VIEWPORT_PADDING,
          bottom: VIEWPORT_PADDING,
          top: "auto" as const,
          maxHeight: "30vh",
          overflowY: "auto" as const,
        }
    : null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[120]">
      {targetRect ? (
        <>
          <div className="pointer-events-auto fixed left-0 top-0 bg-black/68" style={{ width: "100vw", height: targetRect.top }} />
          <div className="pointer-events-auto fixed bottom-0 left-0 bg-black/68" style={{ width: "100vw", top: targetRect.bottom }} />
          <div className="pointer-events-auto fixed bg-black/68" style={{ left: 0, top: targetRect.top, width: targetRect.left, height: targetRect.height }} />
          <div className="pointer-events-auto fixed bg-black/68" style={{ left: targetRect.right, top: targetRect.top, right: 0, height: targetRect.height }} />

          <div
            className="pointer-events-none fixed rounded-2xl border border-green-400/70 shadow-[0_0_0_9999px_rgba(0,0,0,0)] transition-[top,left,width,height] duration-200"
            style={{
              top: targetRect.top,
              left: targetRect.left,
              width: targetRect.width,
              height: targetRect.height,
              boxShadow: "0 0 0 2px rgba(74,222,128,0.25), 0 0 30px rgba(74,222,128,0.22)",
            }}
          />
        </>
      ) : (
        <div className="pointer-events-auto fixed inset-0 bg-black/72 backdrop-blur-[2px]" />
      )}

      <aside
        ref={tooltipRef}
        className="pointer-events-auto fixed rounded-3xl border border-bg-border bg-bg-surface/95 p-3.5 shadow-[0_24px_90px_rgba(0,0,0,0.45)] backdrop-blur transition-[top,left,bottom,right] duration-200 sm:p-4"
        style={
          isMobile
            ? mobileStyle ?? undefined
            : {
                top: desktopTop,
                left: desktopLeft,
                width: "min(300px, calc(100vw - 32px))",
                maxHeight: `calc(100vh - ${VIEWPORT_PADDING * 2}px)`,
                overflowY: "auto",
              }
        }
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-tertiary">
              <span>
                Шаг {stepIndex + 1} из {steps.length}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-bg-raised">
              <div className="h-2 rounded-full bg-green-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => void skip()}
            className="rounded-xl p-2 text-ink-tertiary transition-colors hover:bg-bg-raised hover:text-ink-primary"
            title="Пропустить обучение"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-3.5 flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-green-500/12 text-xs font-black text-green-300">
            {String(stepIndex + 1).padStart(2, "0")}
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-black leading-tight text-ink-primary">{step.title}</h3>
            <p className="mt-1.5 text-[13px] leading-5 text-ink-secondary">{step.content}</p>
          </div>
        </div>

        {step.details && step.details.length > 0 && (
          <div className="mb-3.5 space-y-2 rounded-2xl border border-bg-border bg-bg-raised/70 p-3">
            {step.details.map((detail) => (
              <p key={detail} className="text-[13px] leading-5 text-ink-secondary">
                {detail}
              </p>
            ))}
          </div>
        )}

        {!targetFound && step.target && (
          <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-400/8 p-3 text-sm leading-5 text-amber-200">
            {step.hint ?? "Элемент ещё не виден на экране — подсветка недоступна. Читай описание и нажимай «Далее»."}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => prev()}
            disabled={stepIndex === 0}
            className="rounded-2xl border border-bg-border px-4 py-2.5 text-sm font-semibold text-ink-primary transition-colors hover:bg-bg-raised disabled:cursor-not-allowed disabled:opacity-35"
          >
            Назад
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void skip()}
              className="rounded-2xl px-4 py-2.5 text-sm font-medium text-ink-tertiary transition-colors hover:text-ink-primary"
            >
              Пропустить
            </button>

            {isLast ? (
              <button
                type="button"
                onClick={() => void finish()}
                className="rounded-2xl bg-green-500 px-4 py-2.5 text-sm font-black text-black transition-colors hover:bg-green-400"
              >
                Завершить
              </button>
            ) : (
              <button
                type="button"
                onClick={() => next(steps.length)}
                className="rounded-2xl bg-green-500 px-4 py-2.5 text-sm font-black text-black transition-colors hover:bg-green-400"
              >
                {step.nextLabel ?? "Далее"}
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
