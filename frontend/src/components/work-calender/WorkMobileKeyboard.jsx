export default function WorkMobileKeyboard({
  value,
  onChange,
  onSubmit,
  disabled = false,
}) {
  function pressKey(key) {
    if (disabled) return;

    if (key === "Enter") {
      onSubmit();
      return;
    }

    if (key === "⌫") {
      onChange(value.slice(0, -1));
      return;
    }

    if (["A", "H", "W"].includes(key)) {
      onChange(key);
      return;
    }

    const nextValue = /^[AHW]$/i.test(value)
      ? key
      : `${value}${key}`;

    onChange(nextValue);
  }

  // H replaces the previous W position,
  // W moves to the previous H position,
  // and backspace moves to the previous W position.
  const keys = [
    "1", "2", "3", "A",
    "4", "5", "6", "W",
    "7", "8", "9", "⌫",
    "H", "0", "Enter",
  ];

  const statusColors = {
    A: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
    H: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
    W: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700/70",
  };

  return (
    <div className="space-y-2 md:hidden">
      <p className="text-xs font-medium text-text-muted">
        Enter hours or select a status
      </p>

      <div className="grid grid-cols-4 gap-2">
        {keys.map((key) => {
          const isEnter = key === "Enter";
          const isStatus = ["A", "H", "W"].includes(key);
          const isDelete = key === "⌫";

          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => pressKey(key)}
              className={`flex min-h-12 items-center justify-center rounded-lg border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isEnter
                  ? "col-span-2 border-[#007AFF] bg-[#007AFF] text-white hover:opacity-90 dark:border-[#0A84FF] dark:bg-[#0A84FF]"
                  : isStatus
                    ? `${statusColors[key]} hover:brightness-95`
                    : isDelete
                      ? "border-border bg-paper text-text hover:bg-surface"
                      : "border-border bg-surface text-text hover:bg-paper"
              }`}
              aria-label={
                isDelete
                  ? "Delete last character"
                  : isEnter
                    ? "Submit work entry"
                    : key
              }
            >
              {key === "Enter" ? "Enter ↵" : key}
            </button>
          );
        })}
      </div>

      <p className="text-center text-xs text-text-muted">
        A = Absent · H = Holiday · W = Weekly Off
      </p>
    </div>
  );
}
