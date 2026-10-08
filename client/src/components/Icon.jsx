const paths = {
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  pause: <path d="M8 5v14M16 5v14" />,
  play: <path d="M7 5v14l12-7z" />,
  trash: <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" />,
};

const Icon = ({ name, size = 16 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
};

export default Icon;
