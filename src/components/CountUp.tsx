"use client";

import { useEffect, useState, useRef } from "react";

export default function CountUp({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value); // 初期値を0ではなくvalueにする
  const previousValueRef = useRef(value);

  useEffect(() => {
    let start = previousValueRef.current;
    const end = value;

    // 同じ数字なら動かさない
    if (start === end) return;

    const duration = 1000; // 1秒
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsedTime = currentTime - startTime;
      const progress = Math.min(elapsedTime / duration, 1);

      // イージング
      const easeOutExpo = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const currentNumber = Math.floor(start + (end - start) * easeOutExpo);

      setDisplayValue(currentNumber);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        previousValueRef.current = end;
      }
    };

    requestAnimationFrame(animate);
  }, [value]); // valueが変わるたびに実行

  return <span>¥{displayValue.toLocaleString()}</span>;
}
