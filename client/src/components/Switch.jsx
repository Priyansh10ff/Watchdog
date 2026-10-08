const Switch = ({ checked, onChange, label }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[30px] w-[52px] shrink-0 rounded-full transition-colors ${
        checked ? "bg-ink" : "bg-[#d3d1e0]"
      }`}
    >
      <span
        className={`absolute top-[3px] h-6 w-6 rounded-full bg-white transition-all ${
          checked ? "left-[25px]" : "left-[3px]"
        }`}
      />
    </button>
  );
};

export default Switch;
