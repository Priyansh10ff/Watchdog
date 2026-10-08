const EAR = "#b8692a";
const INK = "#101536";

const abs = (left, top, width, height, extra = {}) => ({
  position: "absolute",
  left,
  top,
  width,
  height,
  ...extra,
});

const SentryAvatar = ({ mode = "up", size = 104 }) => {
  const asleep = mode === "up";
  const down = mode === "down";
  const scale = size / 104;

  const closedEye = (left) => (
    <div
      style={abs(left, 38, 22, 10, {
        borderBottom: `4px solid ${INK}`,
        borderRadius: "0 0 22px 22px",
        boxSizing: "border-box",
      })}
    />
  );

  return (
    <div style={{ width: size, height: size }} aria-hidden="true">
      <div
        className={down ? "animate-shake3" : ""}
        style={{
          position: "relative",
          width: 104,
          height: 104,
          background: "#ffcf86",
          borderRadius: "50%",
          overflow: "hidden",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <div style={abs(0, 10, 30, 52, { background: EAR, borderRadius: "50%" })} />
        <div style={abs(74, 10, 30, 52, { background: EAR, borderRadius: "50%" })} />

        {asleep ? (
          <>
            {closedEye(24)}
            {closedEye(58)}
          </>
        ) : (
          <>
            <div style={abs(22, 30, 24, 24, { background: "#ffffff", borderRadius: "50%" })} />
            <div style={abs(58, 30, 24, 24, { background: "#ffffff", borderRadius: "50%" })} />
            <div style={abs(30, 38, 11, 11, { background: INK, borderRadius: "50%" })} />
            <div style={abs(64, 38, 11, 11, { background: INK, borderRadius: "50%" })} />
          </>
        )}

        <div
          style={abs(30, 56, 44, 38, {
            background: "#fff0cf",
            borderRadius: "50% 50% 55% 55%",
          })}
        />
        <div
          style={abs(41, 55, 22, 15, {
            background: INK,
            borderRadius: "50% 50% 60% 60%",
          })}
        />
        {down && (
          <div
            style={abs(42, 72, 20, 20, {
              background: "#3a1020",
              borderRadius: "0 0 12px 12px",
            })}
          />
        )}
      </div>
    </div>
  );
};

export default SentryAvatar;
