"use client";

import { motion } from "framer-motion";
import type { Rating } from "@/lib/srs";

const OPTIONS: { rating: Rating; label: string; color: string }[] = [
  { rating: "again", label: "Otra vez", color: "bg-terracotta/90" },
  { rating: "hard", label: "Difícil", color: "bg-honey/90" },
  { rating: "good", label: "Bien", color: "bg-sage/90" },
  { rating: "easy", label: "Fácil", color: "bg-cocoa/90" },
];

export function ReviewButtons({ onRate }: { onRate: (r: Rating) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {OPTIONS.map((o, i) => (
        <motion.button
          key={o.rating}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => onRate(o.rating)}
          className={`${o.color} rounded-cozy px-4 py-3 font-medium text-cream shadow-soft`}
        >
          {o.label}
        </motion.button>
      ))}
    </div>
  );
}
