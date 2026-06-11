import { useId } from "react";
import type { ChangeEvent } from "react";
import "./TextInput.css";

interface TextInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Help line under the field. Replaced by `error` when present. */
  help?: string;
  /** Error message; also sets the error border and aria-invalid. */
  error?: string;
  /** Multiline variant for paste/gloss editing (min 3 lines, grows to 12). */
  multiline?: boolean;
  /** Content is studied-language (headword, example) → serif input text. */
  study?: boolean;
  disabled?: boolean;
  placeholder?: string;
  name?: string;
  autoFocus?: boolean;
}

export function TextInput({
  label,
  value,
  onChange,
  help,
  error,
  multiline = false,
  study = false,
  disabled = false,
  placeholder,
  name,
  autoFocus,
}: TextInputProps) {
  const id = useId();
  const messageId = useId();
  const message = error ?? help;

  const fieldClass = [
    "text-input__field",
    multiline && "text-input__field--multiline",
    study && "text-input__field--study",
    error && "text-input__field--error",
  ]
    .filter(Boolean)
    .join(" ");

  const shared = {
    id,
    name,
    value,
    placeholder,
    disabled,
    autoFocus,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": message ? messageId : undefined,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
  };

  return (
    <div className="text-input">
      <label className="text-input__label" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea className={fieldClass} rows={3} {...shared} />
      ) : (
        <input type="text" className={fieldClass} {...shared} />
      )}
      {message && (
        <p
          id={messageId}
          className={
            "text-input__message" + (error ? " text-input__message--error" : "")
          }
        >
          {message}
        </p>
      )}
    </div>
  );
}
