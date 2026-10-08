const AuthSidePanel = () => {
  return (
    <div className="hidden w-1/2 md:block">
      <div className="flex h-full w-full flex-col justify-end rounded-[38px] bg-[#303030] p-10 text-white">
        <h2 className="text-[28px] font-semibold leading-tight tracking-[-1px]">
          Know when your site goes down, before your users do.
        </h2>

        <p className="mt-3 text-[13px] text-[#bdbdbd]">
          Checks run every minute. You get one alert per incident and a full
          history of what happened.
        </p>

        <div className="mt-8 flex gap-5 text-[12px] text-[#bdbdbd]">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Up
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#ff9918]" />
            Slow
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            Down
          </span>
        </div>
      </div>
    </div>
  );
};

export default AuthSidePanel;
