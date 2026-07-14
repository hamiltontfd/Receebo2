import * as React from "react";
import { cn } from "@/lib/utils";

interface AutosizeTextareaProps extends React.ComponentProps<"textarea"> {
  minRows?: number;
}

const AutosizeTextarea = React.forwardRef<HTMLTextAreaElement, AutosizeTextareaProps>(
  ({ className, minRows = 3, onChange, value, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

    const setRef = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    const resize = React.useCallback(() => {
      const el = innerRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }, []);

    React.useEffect(() => {
      resize();
    }, [value, resize]);

    return (
      <textarea
        ref={setRef}
        value={value}
        rows={minRows}
        onChange={(e) => {
          resize();
          onChange?.(e);
        }}
        className={cn(
          "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm overflow-hidden resize-none",
          className,
        )}
        {...props}
      />
    );
  },
);
AutosizeTextarea.displayName = "AutosizeTextarea";

export { AutosizeTextarea };
