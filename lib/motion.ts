// Shared Framer Motion tokens & variants for a consistent, cozy/Apple feel.
// Components import from here instead of hand-rolling easing literals.
import type { Transition, Variants } from "framer-motion";

// The signature Apple-style ease used across the app.
export const EASE_COZY = [0.22, 1, 0.36, 1] as const;

export const DURATION = {
  fast: 0.18,
  base: 0.32,
  slow: 0.6,
} as const;

export const springSoft: Transition = {
  type: "spring",
  stiffness: 200,
  damping: 22,
};

// Entrance: rise + fade. Use as `variants={fadeUp}` with initial/animate="hidden"/"show".
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE_COZY },
  },
};

// Container that staggers its children's `show` state.
export const staggerContainer = (stagger = 0.06): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger } },
});

// Press/hover feedback for interactive surfaces.
export const tapScale = {
  whileHover: { y: -2 },
  whileTap: { scale: 0.97 },
  transition: { duration: DURATION.fast, ease: EASE_COZY },
} as const;
