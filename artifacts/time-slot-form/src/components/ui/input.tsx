import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex w-full rounded-xl border-2 bg-background/50 px-4 py-3.5 text-base shadow-sm transition-all duration-200",
          "placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:bg-card",
          error 
            ? "border-destructive/50 focus-visible:border-destructive focus-visible:ring-destructive/20" 
            : "border-border hover:border-primary/30 focus-visible:border-primary focus-visible:ring-primary/15",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
