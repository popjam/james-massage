import { useEffect, useRef, useState, type ReactNode } from 'react';

export default function CopyContact({ value, label, children }: {
  value: string;
  label: string;
  children?: ReactNode;
}) {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setMessage('Copied');
    } catch {
      setMessage('Couldn’t copy. Select the text to copy manually.');
    }
    timer.current = setTimeout(() => setMessage(''), 4000);
  }
  return <span className="copy-contact">
    <button type="button" className="copy-contact-button" aria-label={`Copy ${label}: ${value}`} title={`Copy ${label}`} onClick={() => void copy()}>
      {children}{value}
    </button>
    <span className="copy-contact-status" role="status" aria-live="polite">{message}</span>
  </span>;
}
