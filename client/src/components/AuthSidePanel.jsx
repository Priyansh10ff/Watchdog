import StatusBadge from "./StatusBadge";

const samples = [
  { name: "Marketing site", url: "example.com", status: "up", ms: "138 ms" },
  { name: "API", url: "api.example.com", status: "down", ms: "-" },
  { name: "Docs", url: "docs.example.com", status: "paused", ms: "-" },
];

const AuthSidePanel = () => {
  return (
    <div className="hidden flex-col justify-between rounded-3xl bg-[#303030] p-8 text-white md:flex">
      <div>
        <h2 className="text-[26px] font-semibold leading-tight tracking-[-1px]">
          Know when your site goes down, before your users do.
        </h2>
        <p className="mt-3 text-[13px] text-[#bdbdbd]">
          Checks run every minute. Every outage becomes an incident with a full
          history of what happened.
        </p>
      </div>

      <div className="mt-8 space-y-3">
        {samples.map((sample) => (
          <div
            key={sample.name}
            className="flex items-center justify-between gap-4 rounded-2xl bg-white px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-[#303030]">
                {sample.name}
              </p>
              <p className="truncate text-[12px] text-[#999999]">{sample.url}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-medium text-[#303030]">{sample.ms}</span>
              <StatusBadge status={sample.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AuthSidePanel;
