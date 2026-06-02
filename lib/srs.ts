// Classic SuperMemo SM-2 scheduling.
// Ratings map to SM-2 quality grades:
//   Again = 1, Hard = 3, Good = 4, Easy = 5
export type Rating = "again" | "hard" | "good" | "easy";

export const RATING_QUALITY: Record<Rating, number> = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
};

export interface SrsState {
  ease: number;
  interval: number; // days
  repetitions: number;
}

export interface SrsResult extends SrsState {
  dueDate: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Compute the next SM-2 state for a card given a rating.
 * @param state current card scheduling state
 * @param rating the user's grade
 * @param now reference time (defaults to current time)
 */
export function scheduleNext(
  state: SrsState,
  rating: Rating,
  now: Date = new Date()
): SrsResult {
  const q = RATING_QUALITY[rating];
  let { ease, interval, repetitions } = state;

  if (q < 3) {
    // Failed recall: reset repetitions, review again soon.
    repetitions = 0;
    interval = 0; // due again today (sub-day handled by caller as "again")
  } else {
    repetitions += 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 6;
    } else {
      interval = Math.round(interval * ease);
    }
  }

  // Update ease factor (SM-2 formula), floor at 1.3.
  ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ease < 1.3) ease = 1.3;

  const dueDate = new Date(now.getTime() + interval * MS_PER_DAY);

  return { ease, interval, repetitions, dueDate };
}
