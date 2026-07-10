"use client";

import { useEffect, useRef } from "react";
import { animate, useMotionValue, useMotionValueEvent } from "motion/react";
import { useState } from "react";

export function AnimatedNumber({
  value,
  suffix = "",
}: {
  value: number;
  suffix?: string;
}) {
  const motionValue = useMotionValue(0);
  const [display, setDisplay] = useState(0);
  const first = useRef(true);

  useMotionValueEvent(motionValue, "change", (latest) => {
    setDisplay(Math.round(latest));
  });

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: first.current ? 0.6 : 0.4,
      ease: [0.22, 1, 0.36, 1],
    });
    first.current = false;
    return controls.stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span>
      {display}
      {suffix}
    </span>
  );
}
