import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Eraser,
  Palette,
  PenTool,
  Play,
  RotateCcw,
  Trash2,
  Trophy,
  Undo2,
} from 'lucide-react';
import type { DrawStroke, RoomFullState } from '../../shared/types';
import { soundFx } from '../../utils/sound';

interface DrawGameProps {
  room: RoomFullState;
  playerId: string;
  isHost: boolean;
  send: (payload: Record<string, unknown>) => boolean;
}

const PALETTE = [
  '#141824',
  '#475569',
  '#DC2626',
  '#EA580C',
  '#D97706',
  '#16A34A',
  '#0D9488',
  '#2563EB',
  '#4F46E5',
  '#7C3AED',
  '#DB2777',
  '#78350F',
];

const BRUSH_SIZES = [3, 6, 11, 18];

const LOGICAL_W = 800;
const LOGICAL_H = 460;

export const DrawGame: React.FC<DrawGameProps> = ({ room, playerId, isHost, send }) => {
  const draw = room.draw;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStrokeRef = useRef<DrawStroke | null>(null);
  const [brushColor, setBrushColor] = useState('#141824');
  const [brushSize, setBrushSize] = useState(6);
  const [isDrawingLocal, setIsDrawingLocal] = useState(false);

  const seatedHumans = room.seats.filter((s) => s.playerId && !s.isBot);
  const canDraw =
    draw.phase === 'FREE_DRAW' || (draw.phase === 'DRAWING' && draw.drawerId === playerId);

  const getMemberName = (pid: string) =>
    room.members.find((m) => m.id === pid)?.name || 'لاعب';

  // Smooth quadratic Bezier rendering for buttery fluid brush strokes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    const renderStroke = (stroke: DrawStroke) => {
      const pts = stroke.points;
      if (pts.length === 0) return;
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, stroke.size / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const midX = (pts[i].x + pts[i + 1].x) / 2;
        const midY = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    };

    for (const s of draw.strokes) {
      renderStroke(s);
    }
    if (activeStrokeRef.current) {
      renderStroke(activeStrokeRef.current);
    }
  }, [draw.strokes, isDrawingLocal]);

  const toCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - rect.left) / rect.width) * LOGICAL_W),
      y: Math.round(((e.clientY - rect.top) / rect.height) * LOGICAL_H),
    };
  };

  const drawLiveSegment = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = toCanvasCoords(e);
    activeStrokeRef.current = {
      id: `st_${Date.now()}`,
      color: brushColor,
      size: brushSize,
      points: [pt],
    };
    setIsDrawingLocal(true);
    drawLiveSegment(pt, { x: pt.x + 0.1, y: pt.y + 0.1 });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || !activeStrokeRef.current) return;
    const pt = toCanvasCoords(e);
    const pts = activeStrokeRef.current.points;
    const prev = pts[pts.length - 1];
    if (Math.hypot(pt.x - prev.x, pt.y - prev.y) < 2) return;
    pts.push(pt);
    drawLiveSegment(prev, pt);
  };

  const finishStroke = () => {
    if (!activeStrokeRef.current) return;
    const completed = activeStrokeRef.current;
    activeStrokeRef.current = null;
    setIsDrawingLocal(false);
    send({ type: 'draw:stroke', stroke: completed });
  };

  const sortedScores = Object.entries(draw.scores).sort((a, b) => b[1] - a[1]);
  const wordChars =
    draw.phase === 'DRAWING'
      ? (draw.drawerId === playerId ? draw.actualWord || '' : draw.maskedWord || '').split(' ')
      : [];

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col gap-4 shadow-xs">
      {/* Studio Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-600 shrink-0" />
          <div>
            <h3 className="text-lg font-extrabold text-[#141824] dark:text-white">استوديو الرسم والتخمين</h3>
            {draw.phase === 'DRAWING' && (
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-num mt-0.5">
                الجولة {draw.round}/{draw.maxRounds} · الرسام: {draw.drawerName} · أصابها:{' '}
                {draw.guessedPlayerIds.length}
              </p>
            )}
            {draw.phase === 'FREE_DRAW' && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                مرسم حر تعاوني للجميع
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {draw.phase === 'DRAWING' && (
            <span
              className={`font-mono-num text-sm font-extrabold px-3 py-1.5 rounded-xl border ${
                draw.timeLeft <= 10
                  ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 animate-pulse'
                  : 'bg-orange-50 dark:bg-orange-950/60 border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-200'
              }`}
            >
              {draw.timeLeft} ث
            </span>
          )}
          {isHost && draw.phase !== 'LOBBY' && (
            <button
              type="button"
              onClick={() => send({ type: 'draw:start' })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-200 hover:text-[#141824] dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إعادة التحدي</span>
            </button>
          )}
        </div>
      </div>

      {/* Timer Bar */}
      {draw.phase === 'DRAWING' && (
        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              draw.timeLeft <= 10 ? 'bg-rose-500' : 'bg-orange-500'
            }`}
            style={{ width: `${Math.min(100, (draw.timeLeft / 60) * 100)}%` }}
          />
        </div>
      )}

      {/* LOBBY OVERLAY */}
      {draw.phase === 'LOBBY' && (
        <div className="py-8 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-orange-50 dark:bg-orange-950/60 border border-orange-100 dark:border-orange-900 text-orange-600 dark:text-orange-400 flex items-center justify-center">
            <Palette className="w-8 h-8" />
          </div>
          <div className="max-w-md space-y-1">
            <h4 className="text-base font-extrabold text-[#141824] dark:text-white">
              تحدي الرسم السريع
            </h4>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              يرسم أحد اللاعبين الكلمة بلوحة فنية ناعمة بينما يتسابق الباقون لكتابة التخمين الصحيح في
              دردشة الغرفة.
            </p>
          </div>
          {isHost ? (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={seatedHumans.length < 2}
                onClick={() => {
                  soundFx.tap();
                  send({ type: 'draw:start' });
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-orange-600 hover:bg-orange-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 rounded-xl cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                <Play className="w-4 h-4" />
                <span>
                  {seatedHumans.length < 2 ? 'تحدي تنافسي (2+ لاعبين)' : 'بدء مسابقة الرسم'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  soundFx.tap();
                  send({ type: 'draw:free_mode' });
                }}
                className="px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl cursor-pointer transition-colors"
              >
                فتح لوحة الرسم الحر
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              بانتظار المضيف لبدء اللعبة...
            </p>
          )}
        </div>
      )}

      {/* WORD SELECTION */}
      {draw.phase === 'CHOOSING_WORD' && (
        <div className="py-10 text-center space-y-4">
          {draw.drawerId === playerId && draw.wordChoices ? (
            <>
              <h4 className="text-lg font-extrabold text-[#141824] dark:text-white">
                اختر الكلمة التي سترسمها
              </h4>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {draw.wordChoices.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => {
                      soundFx.tap();
                      send({ type: 'draw:choose_word', word: w });
                    }}
                    className="px-6 py-3.5 text-base font-extrabold text-[#141824] dark:text-white bg-orange-50 dark:bg-orange-950/60 hover:bg-orange-100 dark:hover:bg-orange-900/60 border-2 border-orange-200 dark:border-orange-800 rounded-2xl cursor-pointer transition-colors"
                  >
                    {w}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <h4 className="text-base font-extrabold text-[#141824] dark:text-white">
                يختار {draw.drawerName} الكلمة الآن...
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                استعد للكتابة في الدردشة لتخمين الرسمة!
              </p>
            </div>
          )}
        </div>
      )}

      {/* ROUND END */}
      {draw.phase === 'ROUND_END' && (
        <div className="py-8 text-center space-y-4 bg-orange-50/40 dark:bg-orange-950/20 rounded-2xl border border-orange-200 dark:border-orange-900">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400">الكلمة الصحيحة كانت</p>
          <h4 className="text-3xl font-black text-orange-600 dark:text-orange-400">
            {draw.actualWord}
          </h4>
          {sortedScores.length > 0 && (
            <div className="flex flex-wrap justify-center gap-3 pt-2 max-w-md mx-auto">
              {sortedScores.map(([pid, pts], i) => (
                <div
                  key={pid}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs flex items-center gap-2"
                >
                  {i === 0 && <Trophy className="w-3.5 h-3.5 text-amber-500" />}
                  <span className="font-bold text-[#141824] dark:text-white">{getMemberName(pid)}</span>
                  <span className="font-mono-num font-extrabold text-orange-600 dark:text-orange-400">
                    {pts}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ACTIVE STUDIO CANVAS */}
      {(draw.phase === 'DRAWING' || draw.phase === 'FREE_DRAW') && (
        <div className="space-y-3">
          {/* Role + Letter Tiles Banner */}
          <div
            className={`px-4 py-2.5 rounded-xl flex flex-wrap items-center justify-between gap-3 ${
              canDraw
                ? 'bg-orange-50 dark:bg-orange-950/45 text-orange-950 dark:text-orange-100 border border-orange-200 dark:border-orange-800'
                : 'bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-extrabold">
              <PenTool className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
              <span>
                {draw.phase === 'FREE_DRAW'
                  ? 'لوحة الرسم الجماعي الحر — ارسموا معاً بحرية'
                  : draw.drawerId === playerId
                    ? `أنت الرسام الآن · ارسم كلمة «${draw.actualWord}»`
                    : `يرسم ${draw.drawerName} الآن — اكتب تخمينك في الدردشة`}
              </span>
            </div>

            {draw.phase === 'DRAWING' && draw.drawerId !== playerId && (
              <div className="flex items-center gap-1 flex-wrap" dir="rtl">
                {wordChars.map((ch, idx) => (
                  <span
                    key={idx}
                    className="min-w-[22px] h-7 px-1 rounded-md bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 flex items-center justify-center text-xs font-extrabold text-[#141824] dark:text-white font-mono-num"
                  >
                    {ch}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Framed Studio Drawing Board */}
          <div className="p-2.5 bg-slate-200/80 dark:bg-slate-800 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-inner">
            <div className="relative border border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden bg-white shadow-sm">
              <canvas
                ref={canvasRef}
                width={LOGICAL_W}
                height={LOGICAL_H}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishStroke}
                onPointerCancel={finishStroke}
                className={`w-full aspect-[800/460] block touch-none ${
                  canDraw ? 'cursor-crosshair' : 'cursor-default'
                }`}
              />
            </div>
          </div>

          {/* Studio Palette & Brush Tools */}
          {canDraw && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                {PALETTE.map((col) => (
                  <button
                    key={col}
                    type="button"
                    aria-label={`لون ${col}`}
                    onClick={() => setBrushColor(col)}
                    style={{ backgroundColor: col }}
                    className={`w-7 h-7 rounded-full border transition-transform cursor-pointer ${
                      brushColor === col
                        ? 'scale-110 ring-2 ring-orange-600 ring-offset-2 border-white'
                        : 'border-slate-300 dark:border-slate-600 hover:scale-105'
                    }`}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setBrushColor('#FFFFFF')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-bold cursor-pointer ${
                    brushColor === '#FFFFFF'
                      ? 'bg-slate-900 dark:bg-orange-600 text-white border-slate-900 dark:border-orange-600'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                  }`}
                  title="ممحاة"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>ممحاة</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {BRUSH_SIZES.map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setBrushSize(sz)}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center border cursor-pointer transition-colors ${
                      brushSize === sz
                        ? 'border-orange-600 bg-orange-50 dark:bg-orange-950/60'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                    }`}
                    title={`حجم القلم ${sz}`}
                  >
                    <span
                      className="rounded-full block"
                      style={{
                        width: Math.min(22, sz + 2),
                        height: Math.min(22, sz + 2),
                        backgroundColor: brushColor === '#FFFFFF' ? '#94A3B8' : brushColor,
                      }}
                    />
                  </button>
                ))}

                <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-0.5" />

                <button
                  type="button"
                  onClick={() => send({ type: 'draw:undo' })}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                  title="تراجع"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>تراجع</span>
                </button>
                <button
                  type="button"
                  onClick={() => send({ type: 'draw:clear' })}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 cursor-pointer"
                  title="مسح اللوحة"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>مسح</span>
                </button>
              </div>
            </div>
          )}

          {/* Live Scoreboard Strip */}
          {draw.phase === 'DRAWING' && sortedScores.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {sortedScores.map(([pid, pts]) => {
                const hasGuessed = draw.guessedPlayerIds.includes(pid);
                const isDrawer = pid === draw.drawerId;
                return (
                  <div
                    key={pid}
                    className={`px-3 py-2 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                      hasGuessed
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                        : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {hasGuessed && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      )}
                      <span className="font-bold text-[#141824] dark:text-white truncate">
                        {getMemberName(pid)}
                      </span>
                      {isDrawer && (
                        <span className="text-[10px] text-orange-600 dark:text-orange-400 font-bold">
                          (يرسم)
                        </span>
                      )}
                    </div>
                    <span className="font-mono-num font-extrabold text-[#141824] dark:text-white">
                      {pts}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
