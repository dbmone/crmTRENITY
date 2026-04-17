import { useEffect, useRef, useState } from "react";
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

  const submitPin = async (pin: string) => {
    setLoading(true);
    setError("");
    try {
      await login(pin.toLowerCase());
      navigate("/");
    } catch {
      setError("Неверный PIN-код");
      setDigits(["", "", "", ""]);
      refs[0].current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (index: number, value: string) => {
    value = value.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (value.length > 1) value = value.slice(-1);

    const next = [...digits];
    next[index] = value;
    setDigits(next);
    setError("");

    if (value && index < 3) refs[index + 1].current?.focus();
    if (index === 3 && value && next.join("").length === 4) {
      void submitPin(next.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) refs[index - 1].current?.focus();
    if (e.key === "Enter") {
      const pin = digits.join("");
      if (pin.length === 4) void submitPin(pin);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4);
    const next = [...digits];

    for (let i = 0; i < text.length; i += 1) next[i] = text[i];

    setDigits(next);
    if (text.length === 4) void submitPin(text);
    else refs[Math.min(text.length, 3)].current?.focus();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base animate-soft-in">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-green-500/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm rounded-modal border border-bg-border bg-bg-surface p-10 shadow-modal animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-green-500/20 bg-green-500/10">
            <span className="text-2xl font-black text-green-400">T</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-ink-primary">
            TRENITY <span className="text-green-500">CRM</span>
          </h1>
          <p className="mt-1.5 text-sm text-ink-tertiary">Введите PIN-код для входа</p>
        </div>

        <div className="mb-6 flex justify-center gap-3">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={refs[index]}
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete={index === 0 ? "one-time-code" : "off"}
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={index === 0 ? handlePaste : undefined}
              disabled={loading}
              className={`h-16 w-14 rounded-xl border-2 bg-bg-raised text-center text-2xl font-bold text-ink-primary outline-none transition-all ${
                error
                  ? "border-red-500/50 bg-red-500/5"
                  : digit
                    ? "border-green-500/50 bg-green-500/5 text-green-400"
                    : "border-bg-border focus:border-green-500/50 focus:bg-green-500/5"
              }`}
            />
          ))}
        </div>

        {error && <p className="mb-4 text-center text-sm text-red-400">{error}</p>}

        {loading && (
          <div className="mb-4 flex justify-center">
            <div className="h-5 w-5 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
          </div>
        )}

        <p className="text-center text-xs text-ink-tertiary">
          PIN-код можно получить в{" "}
          <a
            href="https://t.me/TrenityWork_bot"
            target="_blank"
            rel="noreferrer"
            className="text-green-400 underline underline-offset-2 transition-colors hover:text-green-300"
          >
            @TrenityWork_bot
          </a>
        </p>
      </div>
    </div>
  );
}
