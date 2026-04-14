import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth.store";

export default function LoginPage() {
  const [digits,  setDigits]  = useState(["", "", "", ""]);
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];
  const navigate = useNavigate();
  const login    = useAuthStore((s) => s.login);

  useEffect(() => { refs[0].current?.focus(); }, []);

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    setError("");
    if (value && index < 3) refs[index + 1].current?.focus();
    if (index === 3 && value && next.join("").length === 4) submitPin(next.join(""));
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) refs[index - 1].current?.focus();
    if (e.key === "Enter") { const p = digits.join(""); if (p.length === 4) submitPin(p); }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").trim().slice(0, 4);
    const next  = [...digits];
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setDigits(next);
    if (text.length === 4) submitPin(text);
    else refs[Math.min(text.length, 3)].current?.focus();
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
    <div className="min-h-screen flex items-center justify-center bg-bg-base">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-green-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative bg-bg-surface border border-bg-border rounded-modal p-10 w-full max-w-sm shadow-modal">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-green-400 font-black text-2xl">T</span>
          </div>
          <h1 className="text-xl font-bold text-ink-primary tracking-tight">
            TRENITY <span className="text-green-500">CRM</span>
          </h1>
          <p className="text-sm text-ink-tertiary mt-1.5">Введите PIN-код для входа</p>
        </div>

        {/* PIN input */}
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
              className={`w-14 h-16 text-center text-2xl font-bold rounded-xl border-2 outline-none transition-all bg-bg-raised text-ink-primary ${
                error
                  ? "border-red-500/50 bg-red-500/5"
                  : d
                  ? "border-green-500/50 bg-green-500/5 text-green-400"
                  : "border-bg-border focus:border-green-500/50 focus:bg-green-500/5"
              }`}
              disabled={loading}
            />
          ))}
        </div>

        {error && <p className="text-center text-sm text-red-400 mb-4">{error}</p>}

        {loading && (
          <div className="flex justify-center mb-4">
            <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        <p className="text-center text-xs text-ink-tertiary">
          PIN-код можно получить в Telegram-боте
        </p>
      </div>
    </div>
  );
}
