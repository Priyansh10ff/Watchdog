const ChipGroup = ({ name, options, value, onChange }) => {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = String(option.value) === String(value);

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(name, String(option.value))}
            className={`h-11 min-w-14 rounded-full border-2 px-4 text-[14px] font-semibold transition-colors ${
              selected
                ? "border-ink bg-ink text-butter"
                : "border-ink/20 bg-white text-soft hover:border-ink/50 hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

export default ChipGroup;
