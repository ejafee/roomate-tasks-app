import { cn } from "@/src/lib/utils";
import React, { ButtonHTMLAttributes, forwardRef } from "react";

const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'accent' | 'danger' | 'white' }>(
  ({ className, variant = 'primary', ...props }, ref) => {
    const variants = {
      primary: "bg-[#7CFF01] text-black", // New Green
      secondary: "bg-[#00E5FF] text-black", // Sidebar Cyan
      accent: "bg-[#FFDE00] text-black", // Yellow
      danger: "bg-[#FF0055] text-white", // Pink
      white: "bg-white text-black",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "px-4 py-2 font-black uppercase border-3 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50 disabled:cursor-not-allowed",
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

const Card = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "bg-white border-4 border-black p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full px-4 py-2 border-3 border-black focus:outline-none focus:ring-4 focus:ring-[#FFDE00] font-bold text-sm",
        className
      )}
      {...props}
    />
  )
);

Input.displayName = "Input";

export { Button, Card, Input };
