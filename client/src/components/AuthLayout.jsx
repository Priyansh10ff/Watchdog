import { useRef } from "react";
import { Link } from "react-router-dom";
import Logo from "./Logo";
import Sentry from "./Sentry";

const AuthLayout = ({ mode = "slow", children }) => {
  const rig = useRef(null);

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    rig.current?.lookAt(
      ((e.clientX - rect.left) / rect.width - 0.5) * 2,
      ((e.clientY - rect.top) / rect.height - 0.5) * 2,
    );
  };

  const down = mode === "down";

  return (
    <div
      onMouseMove={handleMove}
      className={`grid min-h-screen overflow-hidden transition-colors duration-500 lg:grid-cols-[minmax(460px,1fr)_1fr] ${
        down ? "bg-coral text-ink" : "bg-cobalt text-white"
      }`}
    >
      <div className="flex flex-col px-6 py-8 sm:px-14">
        <Link to="/" className="w-fit">
          <Logo />
        </Link>

        <div className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-[460px] py-10">{children}</div>
        </div>
      </div>

      <div className="hidden items-center justify-center lg:flex">
        <Sentry ref={rig} mode={mode} scale={0.9} intro />
      </div>
    </div>
  );
};

export default AuthLayout;
