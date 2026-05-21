"use client";

type Props = {
  onClear: () => void;
  label?: string;
  className?: string;
};

export function InputClearButton({
  onClear,
  label = "Clear input",
  className = "",
}: Props) {
  return (
    <button
      type="button"
      onClick={onClear}
      aria-label={label}
      className={`absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-[#D3D1C7] bg-[#F7F5EE] text-[14px] leading-none text-text-subtle ${className}`.trim()}
    >
      ×
    </button>
  );
}
