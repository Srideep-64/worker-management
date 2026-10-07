import { useEffect } from "react";
import { X } from "lucide-react";

export default function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-lg bg-surface shadow-card ${wide ? "max-w-3xl" : "max-w-lg"}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h3 className="text-sm font-semibold text-text">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
