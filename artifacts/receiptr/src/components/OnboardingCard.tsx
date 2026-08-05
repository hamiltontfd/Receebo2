import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ScanLine, Search, X } from "lucide-react";
import { useLocation } from "wouter";
import type { OnboardingState } from "@/lib/useOnboarding";

interface OnboardingCardProps extends OnboardingState {
  onFocusSearch: () => void;
}

export function OnboardingCard({
  step1Done,
  step2Done,
  allDone,
  dismissed,
  dismiss,
  onFocusSearch,
}: OnboardingCardProps) {
  const [, setLocation] = useLocation();
  const [celebrating, setCelebrating] = useState(false);
  const [gone, setGone] = useState(false);

  // When all done, show celebration then slide out
  useEffect(() => {
    if (!allDone || gone) return;
    setCelebrating(true);
    const t = setTimeout(() => {
      setGone(true);
      dismiss();
    }, 2000);
    return () => clearTimeout(t);
  }, [allDone, gone, dismiss]);

  const completedCount = (step1Done ? 1 : 0) + (step2Done ? 1 : 0);
  const progressPct = (completedCount / 2) * 100;

  if (dismissed || gone) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="onboarding-card"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16, scale: 0.97 }}
        transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
        className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm"
      >
        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: "0%" }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          />
        </div>

        <div className="px-4 pt-3.5 pb-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <AnimatePresence mode="wait">
              {celebrating ? (
                <motion.p
                  key="celebrating"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-sm font-semibold"
                >
                  🎉 You&apos;re all set!
                </motion.p>
              ) : (
                <motion.p
                  key="title"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-sm font-semibold"
                >
                  Getting started
                </motion.p>
              )}
            </AnimatePresence>
            <button
              onClick={dismiss}
              aria-label="Dismiss onboarding"
              className="text-muted-foreground hover:text-foreground transition-colors -mr-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Steps */}
          <div className="flex flex-col gap-2">
            <StepRow
              icon={<ScanLine className="w-4 h-4" />}
              label="Scan your first receipt"
              done={step1Done}
              onClick={() => !step1Done && setLocation("/scan")}
            />
            <StepRow
              icon={<Search className="w-4 h-4" />}
              label="Search for an item"
              done={step2Done}
              onClick={() => !step2Done && onFocusSearch()}
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function StepRow({
  icon,
  label,
  done,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  done: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={done}
      className={`flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-left transition-colors ${
        done
          ? "opacity-60 cursor-default"
          : "hover:bg-secondary/60 cursor-pointer"
      }`}
    >
      {/* Step icon */}
      <span
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
          done ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
        }`}
      >
        {icon}
      </span>

      {/* Label */}
      <span
        className={`flex-1 text-sm font-medium transition-all ${
          done ? "line-through text-muted-foreground" : ""
        }`}
      >
        {label}
      </span>

      {/* Checkmark */}
      <motion.span
        initial={false}
        animate={{ scale: done ? 1 : 0.4, opacity: done ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
        className="shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
      >
        <Check className="w-3 h-3 text-primary-foreground" />
      </motion.span>
    </button>
  );
}
