"use client";

import * as React from "react";
import {
	AnimatePresence,
	motion,
	useReducedMotionConfig,
	type Variants,
} from "motion/react";
import { useHydrated } from "@/hooks/use-hydrated";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

/*
  A formatted number whose changed characters roll: up when the value rises,
  down when it falls. Ported from Shadow Garden's registry
  (D:\Vxrcel\shadow-garden\components\registry\animated-number,
  AnimatedNumberAdvanced) with these changes for Wanheda:

  - Characters are matched by place from the right, so ₦29,200 → ₦29,300
    rolls only the hundreds digit; the symbol and separators stay put.
  - The roll follows the direction of `value`, not the text, so the caller
    keeps formatting (exact minor units through formatMoney, V25).
  - A place that didn't exist before (999 → 1,000) rolls in; the first paint
    never animates.
  - Reduced motion (OS or the app setting) renders plain text.
  - Screen readers get the whole text once; the moving pieces are hidden.
*/

const ROLL: Variants = {
	enter: (dir: number) => ({ y: `${String(dir * 100)}%`, opacity: 0 }),
	center: { y: "0%", opacity: 1 },
	exit: (dir: number) => ({ y: `${String(-dir * 100)}%`, opacity: 0 }),
};

const TRANSITION = { duration: 0.52, ease: EASE_OUT };

const graphemes = new Intl.Segmenter();

type Seen = { text: string; value: number; dir: 1 | -1; fromLength: number };

export function RollingNumber({
	text,
	value,
	className,
	charClassName,
}: {
	text: string;
	value: number;
	className?: string;
	/** A class for one character's slot, e.g. a symbol sized apart from the digits. */
	charClassName?: (char: string) => string | undefined;
}) {
	// MotionConfig "user" reads the OS setting on the client's first render; the
	// server can't, so wait for hydration or the two trees differ (React #418).
	const hydrated = useHydrated();
	const reduce = (useReducedMotionConfig() ?? false) && hydrated;
	// The previous render's text and value (React's "storing information from
	// previous renders" pattern): sets the roll direction and which places are new.
	const [seen, setSeen] = React.useState<Seen>({
		text,
		value,
		dir: 1,
		fromLength: text.length,
	});
	if (seen.text !== text || seen.value !== value) {
		setSeen({
			text,
			value,
			dir: value < seen.value ? -1 : 1,
			fromLength: seen.text.length,
		});
	}

	if (reduce)
		return (
			<span className={cn("tabular", className)}>
				{charClassName
					? Array.from(graphemes.segment(text), (g, i) => {
							const c = charClassName(g.segment);
							return c ? (
								<span key={String(i)} className={c}>
									{g.segment}
								</span>
							) : (
								g.segment
							);
						})
					: text}
			</span>
		);

	const chars = Array.from(graphemes.segment(text), (g) => g.segment);
	return (
		<span className={cn("tabular relative inline-flex items-baseline", className)}>
			<span className="sr-only">{text}</span>
			{chars.map((char, i) => {
				const place = chars.length - 1 - i;
				return (
					<span
						key={`p${String(place)}`}
						aria-hidden
						className={cn(
							"relative -my-[0.15em] inline-flex overflow-hidden py-[0.15em] whitespace-pre",
							charClassName?.(char),
						)}
					>
						<AnimatePresence
							mode="popLayout"
							initial={place >= seen.fromLength}
							custom={seen.dir}
						>
							<motion.span
								key={char}
								custom={seen.dir}
								variants={ROLL}
								initial="enter"
								animate="center"
								exit="exit"
								transition={TRANSITION}
								className="inline-block"
							>
								{char}
							</motion.span>
						</AnimatePresence>
					</span>
				);
			})}
		</span>
	);
}
