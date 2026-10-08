const abs = (left, top, width, height, extra = {}) => ({
  position: "absolute",
  left,
  top,
  width,
  height,
  ...extra,
});

const EAR = "#b8692a";
const INK = "#101536";

const Logo = () => {
  return (
    <span className="flex items-center gap-3">
      <span className="relative block h-10 w-10 shrink-0 overflow-hidden rounded-[13px] bg-white">
        <span
          style={abs(2.3, 2.3, 104, 104, {
            display: "block",
            borderRadius: "50%",
            background: "#ffcf86",
            overflow: "hidden",
            transform: "scale(0.34)",
            transformOrigin: "top left",
          })}
        >
          <span style={abs(0, 10, 30, 52, { background: EAR, borderRadius: "50%" })} />
          <span style={abs(74, 10, 30, 52, { background: EAR, borderRadius: "50%" })} />
          <span
            style={abs(24, 38, 22, 10, {
              borderBottom: `4px solid ${INK}`,
              borderRadius: "0 0 22px 22px",
              boxSizing: "border-box",
            })}
          />
          <span
            style={abs(58, 38, 22, 10, {
              borderBottom: `4px solid ${INK}`,
              borderRadius: "0 0 22px 22px",
              boxSizing: "border-box",
            })}
          />
          <span
            style={abs(30, 56, 44, 38, {
              background: "#fff0cf",
              borderRadius: "50% 50% 55% 55%",
            })}
          />
          <span
            style={abs(41, 55, 22, 15, {
              background: INK,
              borderRadius: "50% 50% 60% 60%",
            })}
          />
        </span>
      </span>
      <span className="font-display text-[23px] font-bold tracking-[-0.4px]">Watchdog</span>
    </span>
  );
};

export default Logo;
