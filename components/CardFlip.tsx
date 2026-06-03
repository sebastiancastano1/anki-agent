"use client";

import { motion } from "framer-motion";
import { Citation } from "@/components/ui/Citation";
import { EASE_COZY } from "@/lib/motion";

export function CardFlip({
  front,
  back,
  source,
  flipped,
  onClick,
}: {
  front: React.ReactNode;
  back: React.ReactNode;
  source?: string | null;
  flipped: boolean;
  onClick?: () => void;
}) {
  return (
    <div className="perspective w-full" onClick={onClick}>
      <motion.div
        className="preserve-3d relative w-full cursor-pointer"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.6, ease: EASE_COZY }}
        style={{ minHeight: "20rem" }}
      >
        <div className="backface-hidden absolute inset-0 flex flex-col items-center justify-center rounded-cozy bg-white/80 p-8 text-center shadow-soft ring-1 ring-clay">
          <span className="mb-3 text-xs uppercase tracking-widest text-terracotta">Pregunta</span>
          <div className="text-2xl font-medium leading-snug text-espresso">{front}</div>
          <span className="mt-6 text-sm text-cocoa/60">toca para revelar</span>
        </div>
        <div className="backface-hidden rotate-y-180 absolute inset-0 flex flex-col items-center justify-center rounded-cozy bg-sage/15 p-8 text-center shadow-soft ring-1 ring-sage/40">
          <span className="mb-3 text-xs uppercase tracking-widest text-sage">Respuesta</span>
          <div className="text-xl leading-relaxed text-espresso">{back}</div>
          {source && (
            <div className="mt-5" onClick={(e) => e.stopPropagation()}>
              <Citation source={source} />
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
