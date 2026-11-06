import { useEffect, useState } from "react";

export function useActionFeedback<T = true>() {
  const [feedback, setFeedback] = useState<{ value: T }>();
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(undefined), 3000);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  return {
    feedback: feedback?.value,
    showFeedback: (value: T) => setFeedback({ value }),
    clearFeedback: () => setFeedback(undefined),
  };
}
