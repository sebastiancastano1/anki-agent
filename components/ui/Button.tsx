"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";
import { EASE_COZY } from "@/lib/motion";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-terracotta text-cream shadow-soft hover:shadow-lift",
  secondary: "bg-sage text-cream shadow-soft hover:shadow-lift",
  ghost:
    "bg-white/70 text-cocoa shadow-hairline backdrop-blur-md hover:bg-white",
};

interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: Variant;
  loading?: boolean;
  children?: React.ReactNode;
}

/**
 * Cozy/Apple button with tokenized hover/tap feedback and a loading state.
 * Replaces the repeated inline button markup across pages.
 */
export function Button({
  variant = "primary",
  loading = false,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <motion.button
      whileHover={isDisabled ? undefined : { y: -2 }}
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.18, ease: EASE_COZY }}
      disabled={isDisabled}
      className={`inline-flex items-center justify-center gap-2 rounded-cozy px-6 py-3 font-medium transition-shadow duration-200 ease-cozy disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </motion.button>
  );
}
