import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerProfile, RoomFullState, RoomSummary, UserPresenceInfo } from '../shared/types';

export function useSocket(profile: PlayerProfile) {
  const wsRef = useRef<WebSocket | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const [connected, setConnected] = useState(false);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [activeRoom, setActiveRoom] = useState<RoomFullState | null>(null);
  const [presenceMap, setPresenceMap] = useState<Record<string, UserPresenceInfo>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lockPrompt, setLockPrompt] = useState<{
    code: string;
    title: string;
    wrongPin?: boolean;
  } | null>(null);

  const activeRoomRef = useRef<RoomFullState | null>(null);
  activeRoomRef.current = activeRoom;
  const watchedUidsRef = useRef<string[]>([]);

  const intentionalLeaveRef = useRef(false);
  const pendingQueueRef = useRef<Record<string, unknown>[]>([]);
  const reconnectNowRef = useRef<(() => void) | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setErrorMsg(null), 4000);
  }, []);

  const send = useCallback((payload: Record<string, unknown>) => {
    const type = String(payload.type || '');
    if (type === 'room:leave') {
      intentionalLeaveRef.current = true;
      activeRoomRef.current = null;
      pendingQueueRef.current = [];
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
        return true;
      }
      // Never trap the user inside a room if the socket was disconnected
      setActiveRoom(null);
      return false;
    }

    if (type === 'room:create' || type === 'room:join') {
      intentionalLeaveRef.current = false;
    }

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }

    // Queue user action so it runs immediately once WebSocket finishes reconnecting + rejoining
    if (type !== 'hello') {
      pendingQueueRef.current.push(payload);
      if (pendingQueueRef.current.length > 20) {
        pendingQueueRef.current.shift();
      }
    }
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      reconnectNowRef.current?.();
    }
    return false;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (cancelled) return;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      const currentWs = wsRef.current;
      if (
        currentWs &&
        (currentWs.readyState === WebSocket.OPEN || currentWs.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled || wsRef.current !== ws) return;
        setConnected(true);
        ws.send(
          JSON.stringify({
            type: 'hello',
            playerId: profileRef.current.id,
            name: profileRef.current.name,
            avatar: profileRef.current.avatar,
            hideOnline: Boolean(profileRef.current.privacyHideOnline),
            hideRoom: Boolean(profileRef.current.privacyHideRoom),
          })
        );

        const roomSnapshot = activeRoomRef.current;
        if (roomSnapshot && !intentionalLeaveRef.current) {
          ws.send(
            JSON.stringify({
              type: 'room:rejoin',
              code: roomSnapshot.code,
              snapshot: {
                title: roomSnapshot.title,
                tier: roomSnapshot.tier,
                xp: roomSnapshot.xp,
                backgroundIndex: roomSnapshot.backgroundIndex,
                gameType: roomSnapshot.gameType,
                hostId: roomSnapshot.hostId,
                isPrivate: roomSnapshot.isPrivate,
                isLocked: roomSnapshot.isLocked,
                staff: roomSnapshot.staff,
              },
            })
          );
        }

        if (watchedUidsRef.current.length > 0) {
          ws.send(JSON.stringify({ type: 'presence:watch', uids: watchedUidsRef.current }));
        }

        const queued = pendingQueueRef.current.splice(0, pendingQueueRef.current.length);
        for (const item of queued) {
          ws.send(JSON.stringify(item));
        }
      };

      ws.onmessage = (event) => {
        if (wsRef.current !== ws) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'rooms:list') {
            setRooms(data.rooms || []);
          } else if (data.type === 'room:state') {
            intentionalLeaveRef.current = false;
            setLockPrompt(null);
            setActiveRoom(data.room);
          } else if (data.type === 'room:left') {
            intentionalLeaveRef.current = true;
            activeRoomRef.current = null;
            pendingQueueRef.current = [];
            setActiveRoom(null);
            if (typeof data.reason === 'string' && data.reason.trim()) {
              showError(data.reason.trim());
            }
          } else if (data.type === 'room:lock_required') {
            setLockPrompt({
              code: String(data.code || ''),
              title: String(data.title || 'غرفة مقفلة'),
              wrongPin: Boolean(data.wrongPin),
            });
          } else if (data.type === 'presence:snapshot' && data.statuses) {
            setPresenceMap((prev) => ({ ...prev, ...data.statuses }));
          } else if (data.type === 'presence:update' && data.info?.uid) {
            setPresenceMap((prev) => ({
              ...prev,
              [data.info.uid]: data.info as UserPresenceInfo,
            }));
          } else if (data.type === 'error') {
            showError(data.message || 'حدث خطأ غير متوقع');
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (cancelled || wsRef.current !== ws) return;
        setConnected(false);
        wsRef.current = null;
        reconnectTimer = setTimeout(connect, 1200);
      };
    };

    reconnectNowRef.current = connect;
    connect();

    return () => {
      cancelled = true;
      reconnectNowRef.current = null;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [showError]);

  // Re-sync profile and privacy changes while connected
  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'hello',
          playerId: profile.id,
          name: profile.name,
          avatar: profile.avatar,
          hideOnline: Boolean(profile.privacyHideOnline),
          hideRoom: Boolean(profile.privacyHideRoom),
        })
      );
    }
  }, [
    profile.id,
    profile.name,
    profile.avatar,
    profile.privacyHideOnline,
    profile.privacyHideRoom,
  ]);

  const watchPresence = useCallback((uids: string[]) => {
    const unique = Array.from(new Set(uids.filter((u) => typeof u === 'string' && u.trim())));
    watchedUidsRef.current = unique;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'presence:watch', uids: unique }));
    }
  }, []);

  return {
    connected,
    rooms,
    activeRoom,
    presenceMap,
    watchPresence,
    errorMsg,
    lockPrompt,
    clearLockPrompt: () => setLockPrompt(null),
    clearError: () => setErrorMsg(null),
    send,
  };
}
