import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", isLoading, children, disabled, ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:opacity-50 disabled:pointer-events-none disabled:transform-none";
    
    const variants = {
      default: "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0 active:shadow-md",
      outline: "border-2 border-border bg-transparent hover:border-primary/30 hover:bg-primary/5 text-foreground",
      ghost: "bg-transparent hover:bg-muted text-foreground",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          baseStyles,
          variants[variant],
          "px-6 py-3.5 text-base",
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
        <span className={cn(isLoading && "opacity-0", "flex items-center justify-center w-full h-full")}>
           {children}
        </span>
        {isLoading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
          </span>
        )}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };
