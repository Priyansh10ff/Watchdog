import { useEffect, useRef, useState } from "react";
import { inputClass } from "./ui";

const PRESETS = [1, 2, 5, 10, 15, 30, 60];

const degFor = (value) => -135 + (270 * Math.log(value)) / Math.log(60);

const nearestPreset = (value) =>
  PRESETS.reduce(
    (best, preset) =>
      Math.abs(preset - value) < Math.abs(best - value) ? preset : best,
    PRESETS[0],
  );

const labelFor = (value) => {
  if (value === 60) return "1 hour";
  return `${value} ${value === 1 ? "minute" : "minutes"}`;
};

const valueFromPointer = (e) => {
  const rect = e.currentTarget.getBoundingClientRect();
  const dx = e.clientX - (rect.left + rect.width / 2);
  const dy = e.clientY - (rect.top + rect.height / 2);
  const angle = Math.max(
    -135,
    Math.min(135, (Math.atan2(dx, -dy) * 180) / Math.PI),
  );
  const raw = Math.round(Math.exp(((angle + 135) / 270) * Math.log(60)));
  const value = Math.max(1, Math.min(60, raw));
  const near = nearestPreset(value);

  return Math.abs(near - value) <= Math.max(1, near * 0.08) ? near : value;
};

const IntervalDial = ({ value, onChange }) => {
  const dragging = useRef(false);
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const handleDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragging.current = true;
    onChange(valueFromPointer(e));
  };

  const handleMove = (e) => {
    if (dragging.current) onChange(valueFromPointer(e));
  };

  const handleUp = () => {
    dragging.current = false;
  };

  const handleKey = (e) => {
    const index = PRESETS.indexOf(nearestPreset(value));

    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(PRESETS[Math.min(PRESETS.length - 1, index + 1)]);
    }

    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(PRESETS[Math.max(0, index - 1)]);
    }
  };

  const handleCustom = (e) => {
    const next = e.target.value;
    const number = parseInt(next, 10);

    setText(next);

    if (number >= 1 && number <= 60) {
      onChange(number);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-7">
      <div className="shrink-0">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Check interval in minutes"
          aria-valuemin={1}
          aria-valuemax={60}
          aria-valuenow={value}
          aria-valuetext={labelFor(value)}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          onKeyDown={handleKey}
          className="relative h-[150px] w-[150px] cursor-grab select-none touch-none rounded-full"
        >
          {PRESETS.map((preset) => (
            <span
              key={preset}
              className="absolute left-1/2 top-1/2 -ml-[5px] -mt-[5px] h-[10px] w-[10px] rounded-full"
              style={{
                background: preset === value ? "#101536" : "#d3d1e0",
                transform: `rotate(${degFor(preset).toFixed(1)}deg) translateY(-68px)`,
              }}
            />
          ))}
          <span
            className="absolute left-[19px] top-[19px] h-[112px] w-[112px] rounded-full transition-transform duration-150"
            style={{
              background: "radial-gradient(circle at 35% 28%, #3a3f6b 0%, #101536 70%)",
              boxShadow:
                "0 10px 18px rgba(16,21,54,.35), inset 0 2px 2px rgba(255,255,255,.2)",
              transform: `rotate(${degFor(value).toFixed(1)}deg)`,
            }}
          >
            <span className="absolute left-1/2 top-[9px] -ml-[3.5px] h-8 w-[7px] rounded-[4px] bg-butter" />
          </span>
        </div>
        <div className="mt-0.5 flex justify-between text-[12px] text-soft">
          <span>1 min</span>
          <span>1 hour</span>
        </div>
      </div>

      <div className="min-w-[200px] flex-1">
        <div className="text-[13px] text-soft">Check every</div>
        <div className="font-display text-[40px] font-extrabold leading-[1.1] tracking-[-1.5px]">
          {labelFor(value)}
        </div>

        <div className="mt-3.5 flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={preset === value}
              onClick={() => onChange(preset)}
              className={`h-10 rounded-full border-2 px-3.5 text-[14px] font-bold transition-colors ${
                preset === value
                  ? "border-ink bg-ink text-butter"
                  : "border-ink/20 bg-white text-soft hover:border-ink/50 hover:text-ink"
              }`}
            >
              {preset === 60 ? "1 hour" : `${preset} min`}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-[14px] font-semibold">
          Custom, in minutes (1 to 60)
          <input
            type="number"
            min={1}
            max={60}
            value={text}
            onChange={handleCustom}
            className={`${inputClass} mt-1.5 !w-[140px]`}
          />
        </label>
      </div>
    </div>
  );
};

export default IntervalDial;
