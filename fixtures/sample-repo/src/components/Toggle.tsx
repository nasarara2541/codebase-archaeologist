type ToggleProps = {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function Toggle({ label, description, checked, onChange }: ToggleProps) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i aria-hidden="true" />
    </label>
  );
}
