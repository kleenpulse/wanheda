/** An on/off switch for a setting row, named by the row's label. A disabled one keeps its place and says why in the row's description. */
export function Switch({ labelId, on, onChange, disabled = false }: { labelId: string; on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelId}
      disabled={disabled}
      onClick={() => {
        onChange(!on);
      }}
      className="group relative inline-flex h-7 w-12 shrink-0 items-center rounded-full bg-signal-soft p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-checked:bg-signal"
    >
      <span
        aria-hidden
        className="size-6 rounded-full bg-card shadow-sm transition-transform duration-200 ease-out-quint motion-reduce:transition-none group-aria-checked:translate-x-5"
      />
    </button>
  );
}
