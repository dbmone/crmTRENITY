import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth.store";

export default function LoginPage() {
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  useEffect(() => {
    refs[0].current?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    setError("");

    if (value && index < 3) {
      refs[index + 1].current?.focus();
    }

    // Автосабмит при заполнении всех 4
    if (index === 3 && value) {
      const pin = next.join("");
      if (pin.length === 4) submitPin(pin);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      refs[index - 1].current?.focus();
    }
    if (e.key === "Enter") {
      const pin = digits.join("");
      if (pin.length === 4) submitPin(pin);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").trim().slice(0, 4);
    const next = [...digits];
    for (let i = 0; i < text.length; i++) {
      next[i] = text[i];
    }
    setDigits(next);
    if (text.length === 4) {
      submitPin(text);
    } else {
      refs[Math.min(text.length, 3)].current?.focus();
    }
  };

  const submitPin = async (pin: string) => {
    setLoading(true);
    setError("");
    try {
      await login(pin);
      navigate("/");
    } catch {
      setError("Неверный PIN-код");
      setDigits(["", "", "", ""]);
      refs[0].current?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-secondary">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-brand-50 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#534AB7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-ink-primary">CRM Creators</h1>
          <p className="text-sm text-ink-tertiary mt-1">Введите PIN-код для входа</p>
        </div>

        {/* PIN Input */}
        <div className="flex gap-3 justify-center mb-6">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={refs[i]}
              type="text"
              inputMode="text"
              maxLength={1}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={i === 0 ? handlePaste : undefined}
              className={`w-14 h-16 text-center text-2xl font-semibold rounded-xl border-2 outline-none transition-all ${
                error
                  ? "border-red-300 bg-red-50"
                  : d
                  ? "border-brand-400 bg-brand-50"
                  : "border-gray-200 bg-surface-secondary focus:border-brand-400 focus:bg-brand-50"
              }`}
              disabled={loading}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <p className="text-center text-sm text-red-500 mb-4">{error}</p>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center mb-4">
            <div className="w-6 h-6 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        <p className="text-center text-xs text-ink-tertiary">
          PIN-код можно получить в Telegram-боте
        </p>
      </div>
    </div>
  );
}
