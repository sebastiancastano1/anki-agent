"use client";

import { motion } from "framer-motion";
import { EASE_COZY } from "@/lib/motion";
import type { Rating } from "@/lib/srs";

const OPTIONS: { rating: Rating; label: string; key: string; color: string }[] = [
  { rating: "again", label: "Otra vez", key: "1", color: "bg-terracotta/90" },
  { rating: "hard", label: "Difícil", key: "2", color: "bg-honey/90" },
  { rating: "good", label: "Bien", key: "3", color: "bg-sage/90" },
  { rating: "easy", label: "Fácil", key: "4", color: "bg-cocoa/90" },
];

export function ReviewButtons({ onRate }: { onRate: (r: Rating) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {OPTIONS.map((o, i) => (
        <motion.button
          key={o.rating}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, ease: EASE_COZY }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => onRate(o.rating)}
          className={`${o.color} flex flex-col items-center gap-0.5 rounded-cozy px-4 py-3 font-medium text-cream shadow-soft transition-shadow hover:shadow-lift`}
        >
          <span>{o.label}</span>
          <span className="text-xs text-cream/60">{o.key}</span>
        </motion.button>
      ))}
    </div>
  );
}
