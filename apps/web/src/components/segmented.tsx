interface SegmentedProps<T extends string> {
  /** The radios' group name, unique on the page. */
  name: string;
  options: readonly T[];
  labels: Record<T, string>;
  /** Null picks none of them yet. */
  value: T | null;
  onChange: (value: T) => void;
}

/**
 * A segmented control (wireframes/shell.md "Mode"). Native radios, so arrow keys move between
 * them; each input covers its label, so a tap anywhere on the segment picks it.
 */
export function Segmented<T extends string>({
  name,
  options,
  labels,
  value,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div className="flex w-fit rounded-lg border border-input p-0.5">
      {options.map((option) => (
        <label
          key={option}
          className="relative flex h-7 cursor-pointer items-center rounded-md px-3 text-sm text-muted-foreground has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50 pointer-coarse:min-h-11"
        >
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
            className="absolute inset-0 cursor-pointer appearance-none opacity-0"
          />
          {labels[option]}
        </label>
      ))}
    </div>
  );
}
