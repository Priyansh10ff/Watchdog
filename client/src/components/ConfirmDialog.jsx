import { useCallback, useEffect, useRef, useState } from "react";
import SentryAvatar from "./SentryAvatar";

const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

const ConfirmDialog = ({ title, message, confirmLabel, cancelLabel, onResult }) => {
  const cardRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();

    return () => {
      document.body.style.overflow = overflow;
      if (previous && previous.focus) previous.focus();
    };
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onResult(false);
      return;
    }

    if (e.key !== "Tab") return;

    const items = Array.from(cardRef.current.querySelectorAll(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onResult(false);
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/60 px-5 backdrop-blur-sm"
    >
      <div
        ref={cardRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="w-full max-w-[440px] animate-pop rounded-[28px] bg-white p-8 text-ink shadow-[0_32px_64px_-24px_rgba(16,21,54,0.6)]"
      >
        <SentryAvatar mode="slow" size={64} />

        <h2
          id="confirm-title"
          className="mt-5 font-display text-[28px] font-extrabold leading-tight tracking-[-1px]"
        >
          {title}
        </h2>
        <p id="confirm-message" className="mt-2 text-[16px] leading-normal text-soft">
          {message}
        </p>

        <div className="mt-7 flex flex-wrap justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onResult(false)}
            className="inline-flex min-h-12 items-center rounded-full border-2 border-ink/25 px-6 text-[16px] font-bold transition-colors hover:border-ink"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onResult(true)}
            className="inline-flex min-h-12 items-center rounded-full bg-[#c8321a] px-6 text-[16px] font-bold text-white transition-colors hover:bg-[#a32814]"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export const useConfirm = () => {
  const [options, setOptions] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback(
    (next) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setOptions(next);
      }),
    [],
  );

  const handleResult = (result) => {
    resolver.current?.(result);
    resolver.current = null;
    setOptions(null);
  };

  const dialog = options ? (
    <ConfirmDialog
      title={options.title}
      message={options.message}
      confirmLabel={options.confirmLabel || "Delete"}
      cancelLabel={options.cancelLabel || "Cancel"}
      onResult={handleResult}
    />
  ) : null;

  return { confirm, dialog };
};

export default ConfirmDialog;
