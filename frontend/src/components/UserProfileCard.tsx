import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ExternalLink, Briefcase, ChevronLeft } from "lucide-react";
import { UserProfile } from "../types";
import * as api from "../api/client";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Администратор", HEAD_MARKETER: "Гл. маркетолог",
  MARKETER: "Маркетолог", HEAD_CREATOR: "Гл. креатор",
  LEAD_CREATOR: "Лид-креатор", CREATOR: "Креатор",
};
const ROLE_COLORS: Record<string, string> = {
  ADMIN: "text-red-400 bg-red-400/10",        HEAD_MARKETER: "text-purple-400 bg-purple-400/10",
  MARKETER: "text-blue-400 bg-blue-400/10",   HEAD_CREATOR: "text-orange-400 bg-orange-400/10",
  LEAD_CREATOR: "text-amber-400 bg-amber-400/10", CREATOR: "text-green-400 bg-green-400/10",
};

interface PopupPos { top: number; left: number; }

interface Props { userId: string; trigger: React.ReactNode; }

export default function UserProfileCard({ userId, trigger }: Props) {
  const [open,        setOpen]        = useState(false);
  const [profile,     setProfile]     = useState<UserProfile | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [leadProfile, setLeadProfile] = useState<UserProfile | null>(null);
  const [showLead,    setShowLead]    = useState(false);
  const [pos,         setPos]         = useState<PopupPos>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const popupRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    load(userId);
  }, [open, userId]);

  // Position popup using fixed coords from trigger's bounding rect
  useEffect(() => {
    if (!open || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const POPUP_W = 256;
    const POPUP_H = 240; // approx

    let left = rect.left;
    let top  = rect.bottom + 6;

    // Don't go off right edge
    if (left + POPUP_W > window.innerWidth - 8) {
      left = rect.right - POPUP_W;
    }
    // Don't go off left edge
    if (left < 8) left = 8;

    // Don't go off bottom
    if (top + POPUP_H > window.innerHeight - 8) {
      top = rect.top - POPUP_H - 6;
    }

    setPos({ top, left });
  }, [open, profile]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const trig = triggerRef.current;
      const pop  = popupRef.current;
      if (trig && !trig.contains(e.target as Node) && pop && !pop.contains(e.target as Node)) {
        setOpen(false);
        setShowLead(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const load = async (id: string) => {
    setLoading(true);
    try { const d = await api.getUser(id); setProfile(d); } catch {}
    setLoading(false);
  };

  const openLead = async (id: string) => {
    setLoading(true);
    try { const d = await api.getUser(id); setLeadProfile(d); setShowLead(true); } catch {}
    setLoading(false);
  };

  const displayed = showLead ? leadProfile : profile;

  const popup = open ? (
    <div
      ref={popupRef}
      className="fixed z-[9999] w-64 bg-bg-surface border border-bg-border rounded-modal shadow-modal overflow-hidden animate-modal"
      style={{ top: pos.top, left: pos.left }}
      onClick={(e) => e.stopPropagation()}
    >
      {showLead && (
        <button onClick={() => setShowLead(false)}
          className="flex items-center gap-1 px-3 pt-2.5 text-xs text-ink-tertiary hover:text-ink-primary transition-colors">
          <ChevronLeft size={12} /> Назад
        </button>
      )}

      {loading && !displayed ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : displayed ? (
        <CardContent profile={displayed} onLeadClick={openLead} onClose={() => { setOpen(false); setShowLead(false); }} />
      ) : null}
    </div>
  ) : null;

  return (
    <div className="relative inline-block" ref={triggerRef}>
      <div onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
        {trigger}
      </div>
      {createPortal(popup, document.body)}
    </div>
  );
}

function CardContent({ profile, onLeadClick, onClose }: { profile: UserProfile; onLeadClick: (id: string) => void; onClose: () => void }) {
  const initials = profile.displayName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="p-4">
      <button onClick={onClose}
        className="absolute top-3 right-3 p-1 rounded-lg text-ink-tertiary hover:text-ink-primary hover:bg-bg-raised transition-colors">
        <X size={13} />
      </button>

      {/* Avatar + name */}
      <div className="flex items-center gap-3 mb-3">
        {profile.telegramUsername ? (
          <a
            href={`https://t.me/${profile.telegramUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-11 h-11 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center overflow-hidden flex-shrink-0 hover:border-green-500/50 transition-colors"
            title="Открыть Telegram"
          >
            {profile.avatarUrl
              ? <img src={profile.avatarUrl} alt={profile.displayName} className="w-full h-full object-cover" />
              : <span className="text-sm font-bold text-green-400">{initials}</span>
            }
          </a>
        ) : (
          <div className="w-11 h-11 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center overflow-hidden flex-shrink-0">
            {profile.avatarUrl
              ? <img src={profile.avatarUrl} alt={profile.displayName} className="w-full h-full object-cover" />
              : <span className="text-sm font-bold text-green-400">{initials}</span>
            }
          </div>
        )}
        <div className="min-w-0">
          <div className="font-semibold text-ink-primary text-sm truncate">{profile.displayName}</div>
          {profile.telegramUsername && (
            <div className="text-xs text-ink-tertiary mt-0.5">@{profile.telegramUsername}</div>
          )}
          <span className={`inline-block mt-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[profile.role] || "text-ink-tertiary bg-bg-raised"}`}>
            {ROLE_LABELS[profile.role] || profile.role}
          </span>
        </div>
      </div>

      {/* TG link */}
      {profile.telegramUsername && (
        <a href={`https://t.me/${profile.telegramUsername}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-[#229ED9]/10 border border-[#229ED9]/20 text-[#229ED9] text-xs font-medium hover:bg-[#229ED9]/20 transition-colors mb-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
          </svg>
          @{profile.telegramUsername}
          <ExternalLink size={11} className="ml-auto" />
        </a>
      )}

      {/* Team lead */}
      {profile.teamLead && (
        <div className="border-t border-bg-border pt-2 mt-1">
          <div className="text-[10px] text-ink-tertiary mb-1.5 uppercase tracking-wide">Тимлид</div>
          <button onClick={() => onLeadClick(profile.teamLead!.id)}
            className="flex items-center gap-2 w-full text-left px-2.5 py-2 rounded-lg hover:bg-bg-raised transition-colors">
            <div className="w-7 h-7 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {profile.teamLead.avatarUrl
                ? <img src={profile.teamLead.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
                : <span className="text-[10px] font-bold text-amber-400">{profile.teamLead.displayName.slice(0, 2).toUpperCase()}</span>
              }
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-ink-primary truncate">{profile.teamLead.displayName}</div>
              {profile.teamLead.telegramUsername && <div className="text-[10px] text-ink-tertiary">@{profile.teamLead.telegramUsername}</div>}
            </div>
            <ExternalLink size={11} className="ml-auto text-ink-tertiary flex-shrink-0" />
          </button>
        </div>
      )}

      {/* Stats */}
      {profile._count && (
        <div className="border-t border-bg-border pt-2 mt-2">
          <div className="flex items-center gap-1 text-[10px] text-ink-tertiary">
            <Briefcase size={10} /> {profile._count.assignments} заказов
          </div>
        </div>
      )}
    </div>
  );
}
