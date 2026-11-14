import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

const STORAGE_KEY_PREFIX = 'compeng.reminder.';
const THRESHOLD_MINUTES = 10;
const POLL_INTERVAL_MS = 60_000;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function useClassReminder(enabled = true) {
  const [reminder, setReminder] = useState(null);
  const dismissedRef = useRef(new Set());
  const inFlightRef = useRef(false);

  // Load today's dismissed set so a page refresh doesn't re-show
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PREFIX + todayKey());
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          dismissedRef.current = new Set(arr);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const persistDismissed = useCallback(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY_PREFIX + todayKey(),
        JSON.stringify([...dismissedRef.current]),
      );
    } catch {
      // ignore
    }
  }, []);

  const check = useCallback(async () => {
    if (!enabled || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const data = await api.get('/attendance/upcoming/?limit=5');
      const upcoming = data?.results || [];
      const now = Date.now();

      let best = null;

      for (const u of upcoming) {
        const startMs = new Date(`${u.date}T${u.start_time}:00`).getTime();
        const minutesUntilStart = Math.round((startMs - now) / 60000);

        // Determine what kind of reminder this class deserves
        let kind = null;
        let priority = Infinity;

        if (u.is_open_now) {
          kind = 'check_in_open';
          priority = 0;
        } else if (minutesUntilStart > 0 && minutesUntilStart <= THRESHOLD_MINUTES) {
          kind = 'class_soon';
          priority = 1;
        } else {
          continue;
        }

        const key = `${u.timetable_entry_id}_${u.date}_${kind}`;
        if (dismissedRef.current.has(key)) continue;

        if (priority < (best?.priority ?? Infinity)) {
          best = {
            key,
            kind,
            priority,
            minutesUntilStart,
            courseCode: u.course_code,
            courseTitle: u.course_title,
            room: u.room,
            startTime: u.start_time,
            endTime: u.end_time,
            date: u.date,
          };
        }
      }

      setReminder(best);
    } catch {
      // Silent — a reminder failing to check is never worth a UI error
    } finally {
      inFlightRef.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [check, enabled]);

  const dismiss = useCallback(() => {
    if (reminder) {
      dismissedRef.current.add(reminder.key);
      persistDismissed();
    }
    setReminder(null);
  }, [reminder, persistDismissed]);

  return { reminder, dismiss, refresh: check };
}