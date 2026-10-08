const FormField = ({ label, htmlFor, hint, children }) => {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-[14px] font-semibold text-ink"
      >
        {label}
      </label>
      {children}
      {hint && (
        <p className="mt-2 text-[13px] leading-relaxed text-soft">{hint}</p>
      )}
    </div>
  );
};

export default FormField;
