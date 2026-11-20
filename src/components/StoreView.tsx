import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Coins,
  Copy,
  Crown,
  Gift,
  History,
  ImagePlus,
  Moon,
  Receipt,
  RefreshCw,
  ShoppingBag,
  Smartphone,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import {
  fetchUserTransactions,
  purchaseBasicVoiceRoom,
  submitRechargeRequest,
  type CoinTxRecord,
} from '../firebase';
import {
  BASIC_ROOM_PRICE_COINS,
  COIN_STORE_PACKAGES,
  RECHARGE_METHODS,
  ROOM_LEVELS,
  isAdminEmail,
} from '../shared/gameCatalog';
import type {
  CoinPackage,
  PaymentMethod,
  PlayerProfile,
  RechargeRequest,
} from '../shared/types';
import { compressReceiptImage } from '../utils/imageCompress';
import { soundFx } from '../utils/sound';
import { AdminRechargePanel, type AdminFilterTab } from './AdminRechargePanel';
import { AdminReportsPanel } from './AdminReportsPanel';
import { AdminSupportPanel } from './AdminSupportPanel';

interface StoreViewProps {
  profile: PlayerProfile;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onUpdateCoins: (newCoins: number, newBasicRoomId?: string) => void;
  onEnterBasicRoom: (roomId: string) => void;
  userRequests: RechargeRequest[];
  adminRequests: RechargeRequest[];
  adminInitialTab?: AdminFilterTab;
  onAdminTabChange?: (tab: AdminFilterTab) => void;
}

type TxFilter = 'all' | 'store_purchase' | 'gift_sent' | 'room_upgrade';
type UserReqFilter = 'all' | 'pending' | 'approved' | 'rejected';

function formatTxDate(ms: number): string {
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return '';
  }
}

export const StoreView: React.FC<StoreViewProps> = ({
  profile,
  theme,
  onToggleTheme,
  onUpdateCoins,
  onEnterBasicRoom,
  userRequests,
  adminRequests,
  adminInitialTab,
  onAdminTabChange,
}) => {
  const isAdmin = isAdminEmail(profile.email);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [roomTitle, setRoomTitle] = useState(`غرفة ${profile.name}`);
  const [transactions, setTransactions] = useState<CoinTxRecord[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txFilter, setTxFilter] = useState<TxFilter>('all');
  const [reqFilter, setReqFilter] = useState<UserReqFilter>('all');

  // Checkout Modal State
  const [selectedPkg, setSelectedPkg] = useState<CoinPackage | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('vodafone_cash');
  const [senderInfo, setSenderInfo] = useState('');
  const [receiptImage, setReceiptImage] = useState('');
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [submittingReq, setSubmittingReq] = useState(false);
  const [previewReceipt, setPreviewReceipt] = useState<string | null>(null);

  const refreshTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const list = await fetchUserTransactions(profile.id);
      setTransactions(list);
    } catch {
      // Handled gracefully
    } finally {
      setTxLoading(false);
    }
  }, [profile.id]);

  useEffect(() => {
    void refreshTransactions();
  }, [refreshTransactions, profile.coins]);

  const txStats = useMemo(() => {
    let addedCoins = 0;
    let spentCoins = 0;
    let totalEgp = 0;
    for (const tx of transactions) {
      if (tx.coinsDelta >= 0) addedCoins += tx.coinsDelta;
      else spentCoins += Math.abs(tx.coinsDelta);
      if (tx.priceEgp > 0) totalEgp += tx.priceEgp;
    }
    return { addedCoins, spentCoins, totalEgp };
  }, [transactions]);

  const filteredTx = useMemo(
    () =>
      txFilter === 'all'
        ? transactions
        : transactions.filter((tx) => tx.kind === txFilter),
    [transactions, txFilter]
  );

  const filteredUserReqs = useMemo(
    () =>
      reqFilter === 'all'
        ? userRequests
        : userRequests.filter((r) => r.status === reqFilter),
    [userRequests, reqFilter]
  );

  const handleCopyNumber = async (num: string, key: string) => {
    try {
      await navigator.clipboard.writeText(num);
      setCopiedKey(key);
      soundFx.tap();
      setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptError(null);
    setCompressing(true);
    try {
      const compressed = await compressReceiptImage(file);
      setReceiptImage(compressed);
    } catch (err) {
      setReceiptError(err instanceof Error ? err.message : 'تعذر معالجة الصورة');
    } finally {
      setCompressing(false);
      e.target.value = '';
    }
  };

  const openCheckout = (pkg: CoinPackage) => {
    soundFx.tap();
    setSelectedPkg(pkg);
    setPaymentMethod('vodafone_cash');
    setSenderInfo('');
    setReceiptImage('');
    setReceiptError(null);
    setErrorMsg(null);
  };

  const handleSubmitRecharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPkg || submittingReq || compressing) return;
    setSubmittingReq(true);
    setReceiptError(null);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      await submitRechargeRequest({
        profile,
        pkg: selectedPkg,
        paymentMethod,
        senderInfo,
        receiptImage,
      });
      soundFx.gift();
      const methodLabel = RECHARGE_METHODS[paymentMethod].labelAr;
      setStatusMsg(
        `تم إرسال طلب شحن ${selectedPkg.coins.toLocaleString('en-US')} عملة عبر ${methodLabel} بنجاح، وهو الآن قيد مراجعة الإدارة.`
      );
      setSelectedPkg(null);
      setSenderInfo('');
      setReceiptImage('');
    } catch (err) {
      setReceiptError(err instanceof Error ? err.message : 'تعذر إرسال طلب الشحن');
    } finally {
      setSubmittingReq(false);
    }
  };

  const handleBuyBasicRoom = async () => {
    if (profile.coins < BASIC_ROOM_PRICE_COINS) {
      setErrorMsg(`تحتاج إلى ${BASIC_ROOM_PRICE_COINS} عملة لتفعيل الغرفة الأساسية الدائمة`);
      return;
    }
    setBusyId('basic_room');
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const { newCoins, room } = await purchaseBasicVoiceRoom(profile, roomTitle);
      soundFx.win();
      onUpdateCoins(newCoins, room.roomId);
      setStatusMsg(`تم تفعيل غرفتك الأساسية الدائمة برقم تعريفي مثبت: ${room.roomId}`);
      await refreshTransactions();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تفعيل الغرفة الأساسية');
    } finally {
      setBusyId(null);
    }
  };

  const activeMethodMeta = RECHARGE_METHODS[paymentMethod];

  return (
    <main className="max-w-[1360px] mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header & Current Balance */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-[#141824] dark:text-white">المتجر والعملات</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            اشحن عملاتك عبر فودافون كاش أو إنستا باي لإرسال الهدايا وترقية غرفتك الأساسية
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
            <span>{theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}</span>
          </button>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-5 py-3 flex items-center gap-3">
            <Coins className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">رصيدك الحالي</p>
              <p className="text-xl font-extrabold font-mono-num text-[#141824] dark:text-white">
                {profile.coins.toLocaleString('en-US')} عملة
              </p>
            </div>
          </div>
        </div>
      </div>

      {statusMsg && (
        <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-sm font-semibold px-4 py-3 rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm font-semibold px-4 py-3 rounded-xl">
          {errorMsg}
        </div>
      )}

      {/* Admin Panel (visible only to configured admin email) */}
      {isAdmin && profile.email && (
        <div className="space-y-6">
          <AdminRechargePanel
            adminEmail={profile.email}
            requests={adminRequests}
            activeFilter={adminInitialTab}
            onChangeFilter={onAdminTabChange}
          />
          <AdminReportsPanel />
          <AdminSupportPanel adminProfile={profile} />
        </div>
      )}

      {/* Official Transfer Numbers Strip */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-rose-600 dark:text-rose-400">فودافون كاش</p>
              <p className="text-xl font-extrabold font-mono-num text-[#141824] dark:text-white tracking-wide" dir="ltr">
                {RECHARGE_METHODS.vodafone_cash.accountNumber}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleCopyNumber(RECHARGE_METHODS.vodafone_cash.accountNumber, 'vf')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer shrink-0"
          >
            {copiedKey === 'vf' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>تم النسخ</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>نسخ الرقم</span>
              </>
            )}
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-blue-600 dark:text-blue-400">إنستا باي · InstaPay</p>
              <p className="text-xl font-extrabold font-mono-num text-[#141824] dark:text-white tracking-wide" dir="ltr">
                {RECHARGE_METHODS.instapay.accountNumber}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleCopyNumber(RECHARGE_METHODS.instapay.accountNumber, 'ip')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer shrink-0"
          >
            {copiedKey === 'ip' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>تم النسخ</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>نسخ الرقم</span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* 7 Coin Packages Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-xl font-extrabold text-[#141824] dark:text-white">باقات العملات</h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            اختر الباقة وأرسل طلب الشحن مع إرفاق صورة التحويل (اختياري)
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {COIN_STORE_PACKAGES.map((pkg) => (
            <div
              key={pkg.id}
              className={`bg-white dark:bg-slate-900 rounded-xl p-5 border flex flex-col justify-between gap-4 ${
                pkg.popular
                  ? 'border-blue-600 ring-1 ring-blue-600/20 dark:border-blue-500'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>شحن فودافون / إنستا باي</span>
                  {pkg.popular && (
                    <span className="font-bold text-blue-600 dark:text-blue-400">الأكثر طلباً</span>
                  )}
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <Coins className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold font-mono-num text-[#141824] dark:text-white">
                      {pkg.coins.toLocaleString('en-US')}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">عملة يلا بلاي</p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => openCheckout(pkg)}
                className="w-full py-2.5 px-4 bg-[#141824] dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span className="font-mono-num">{pkg.priceEgp} جنيه</span>
                <span aria-hidden="true">·</span>
                <span>طلب شحن الباقة</span>
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* User Recharge Requests History */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-[#141824] dark:text-white">
                تاريخ معاملات الشحن
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                متابعة فورية لطلبات شحنك عبر فودافون كاش وإنستا باي وحالة مراجعتها
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {(
              [
                { id: 'all', label: 'الكل' },
                { id: 'pending', label: 'المعلقة' },
                { id: 'approved', label: 'المقبولة' },
                { id: 'rejected', label: 'المرفوضة' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setReqFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  reqFilter === tab.id
                    ? 'bg-white dark:bg-slate-900 text-[#141824] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-[#141824] dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredUserReqs.length === 0 ? (
          <div className="py-8 text-center space-y-1.5 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              لا توجد طلبات شحن في هذا التصنيف
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              اختر إحدى باقات العملات أعلاه لتقديم طلب شحن جديد عبر فودافون كاش أو إنستا باي
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredUserReqs.map((req) => {
              const methodMeta = RECHARGE_METHODS[req.paymentMethod];
              return (
                <div
                  key={req.requestId}
                  className="py-3.5 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {req.receiptImage ? (
                      <button
                        type="button"
                        onClick={() => setPreviewReceipt(req.receiptImage)}
                        className="w-11 h-11 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 cursor-pointer"
                        title="عرض إيصال التحويل"
                      >
                        <img
                          src={req.receiptImage}
                          alt="صورة التحويل"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0">
                        <Smartphone className="w-4 h-4" />
                      </div>
                    )}

                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-[#141824] dark:text-white font-mono-num">
                        +{req.coins.toLocaleString('en-US')} عملة · {req.priceEgp} جنيه
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                        <span>{methodMeta.labelAr}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num" dir="ltr">
                          {req.targetNumber}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num">{formatTxDate(req.createdAtMs)}</span>
                        {req.senderInfo && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>مرجع: {req.senderInfo}</span>
                          </>
                        )}
                      </p>
                      {req.adminNote && req.status !== 'pending' && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                          رد الإدارة: {req.adminNote}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-xs font-extrabold shrink-0">
                    <span
                      className={
                        req.status === 'approved'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : req.status === 'rejected'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-amber-600 dark:text-amber-400'
                      }
                    >
                      {req.status === 'approved'
                        ? 'تمت الموافقة وإضافة العملات'
                        : req.status === 'rejected'
                          ? 'مرفوض'
                          : 'قيد المراجعة'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Basic Permanent Room Card (2000 Coins) */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-bold">
              <Crown className="w-4 h-4" />
              <span>ترقية الغرف الصوتية</span>
            </div>
            <h2 className="text-2xl font-extrabold text-[#141824] dark:text-white">
              الغرفة الأساسية الدائمة (2,000 عملة)
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              احصل على رقم تعريفي مثبت خاص بك لا يغلق أبداً، مع 8 مستويات للترقية، حتى 14 مايك،
              15 مشرفاً، 3 نواب غرفة، 11 خلفية، وجميع الألعاب الستة.
            </p>
          </div>

          {profile.basicRoomId ? (
            <div className="space-y-2 text-left">
              <p className="text-xs text-slate-500 dark:text-slate-400">رقم غرفتك المثبت</p>
              <p className="text-lg font-extrabold font-mono-num text-emerald-700 dark:text-emerald-400">
                {profile.basicRoomId}
              </p>
              <button
                type="button"
                onClick={() => onEnterBasicRoom(profile.basicRoomId)}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg cursor-pointer"
              >
                دخول غرفتي الأساسية
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
              <input
                type="text"
                value={roomTitle}
                onChange={(e) => setRoomTitle(e.target.value)}
                maxLength={40}
                placeholder="اسم غرفتك الدائمة"
                className="px-3.5 py-2.5 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141824] dark:text-white rounded-lg focus:outline-none focus:border-blue-600"
              />
              <button
                type="button"
                disabled={busyId !== null}
                onClick={handleBuyBasicRoom}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-sm font-bold rounded-lg whitespace-nowrap cursor-pointer"
              >
                {busyId === 'basic_room' ? 'جاري التفعيل...' : 'شراء الغرفة (2,000 عملة)'}
              </button>
            </div>
          )}
        </div>

        {/* 8 Levels Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-3 font-bold">المستوى</th>
                <th className="py-2.5 px-3 font-bold">نقاط الترقية المطلوبة</th>
                <th className="py-2.5 px-3 font-bold">المايكات</th>
                <th className="py-2.5 px-3 font-bold">المشرفين</th>
                <th className="py-2.5 px-3 font-bold">نواب الغرفة</th>
                <th className="py-2.5 px-3 font-bold">الخلفيات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {ROOM_LEVELS.map((lvl) => (
                <tr key={lvl.level} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/60">
                  <td className="py-2.5 px-3 font-extrabold text-[#141824] dark:text-white">
                    المستوى {lvl.level}
                  </td>
                  <td className="py-2.5 px-3 font-mono-num text-slate-600 dark:text-slate-300">
                    {lvl.maxXp !== null
                      ? `${lvl.minXp.toLocaleString('en-US')} / ${lvl.maxXp.toLocaleString('en-US')}`
                      : `${lvl.minXp.toLocaleString('en-US')}+`}
                  </td>
                  <td className="py-2.5 px-3 font-mono-num font-semibold">{lvl.maxMics} مايك</td>
                  <td className="py-2.5 px-3 font-mono-num font-semibold">{lvl.maxMods} مشرفين</td>
                  <td className="py-2.5 px-3 font-mono-num font-semibold">
                    {lvl.maxCoHosts === 0 ? '—' : `${lvl.maxCoHosts} نائب`}
                  </td>
                  <td className="py-2.5 px-3 font-mono-num font-semibold">
                    {lvl.backgroundsCount} خلفيات
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Full Transaction History Ledger */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-[#141824] dark:text-white">
                تاريخ المعاملات المالية والهدايا
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                سجل كامل لعمليات شحن العملات المعتمدة، الهدايا المرسلة، وترقية الغرفة الأساسية
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void refreshTransactions()}
            disabled={txLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${txLoading ? 'animate-spin' : ''}`} />
            <span>تحديث السجل</span>
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-3.5">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
              إجمالي العملات المشحونة
            </p>
            <p className="text-lg font-extrabold font-mono-num text-emerald-700 dark:text-emerald-400 mt-0.5">
              +{txStats.addedCoins.toLocaleString('en-US')} عملة
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-3.5">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
              إجمالي الهدايا والترقيات
            </p>
            <p className="text-lg font-extrabold font-mono-num text-rose-600 dark:text-rose-400 mt-0.5">
              -{txStats.spentCoins.toLocaleString('en-US')} عملة
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-3.5">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
              إجمالي المدفوعات
            </p>
            <p className="text-lg font-extrabold font-mono-num text-[#141824] dark:text-white mt-0.5">
              {txStats.totalEgp.toLocaleString('en-US')} جنيه
            </p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
          {(
            [
              { id: 'all', label: 'الكل' },
              { id: 'store_purchase', label: 'شحن العملات' },
              { id: 'gift_sent', label: 'الهدايا المرسلة' },
              { id: 'room_upgrade', label: 'ترقية الغرفة' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTxFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                txFilter === tab.id
                  ? 'bg-white dark:bg-slate-900 text-[#141824] dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-[#141824] dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Transactions List */}
        {txLoading && transactions.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
            جاري تحميل تاريخ المعاملات...
          </p>
        ) : filteredTx.length === 0 ? (
          <div className="py-8 text-center space-y-1.5 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              لا توجد معاملات مسجلة في هذا القسم حتى الآن
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ستظهر هنا تلقائياً جميع عمليات الشحن المعتمدة وإرسال الهدايا الصوتية
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredTx.map((tx) => {
              const Icon =
                tx.kind === 'store_purchase'
                  ? Coins
                  : tx.kind === 'room_upgrade'
                    ? Crown
                    : Gift;
              const iconBg =
                tx.kind === 'store_purchase'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                  : tx.kind === 'room_upgrade'
                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                    : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400';

              return (
                <div
                  key={tx.id}
                  className="py-3 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#141824] dark:text-white truncate">
                        {tx.label}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {tx.kind === 'store_purchase'
                          ? 'شحن من المتجر'
                          : tx.kind === 'room_upgrade'
                            ? 'ترقية الغرفة الأساسية'
                            : 'هدية داخل غرفة صوتية'}
                        <span aria-hidden="true" className="mx-1.5">·</span>
                        <span>{formatTxDate(tx.createdAtMs)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 font-mono-num text-xs shrink-0">
                    {tx.priceEgp > 0 && (
                      <span className="text-slate-500 dark:text-slate-400">
                        {tx.priceEgp} جنيه
                      </span>
                    )}
                    <span
                      className={
                        tx.coinsDelta >= 0
                          ? 'text-emerald-700 dark:text-emerald-400 font-extrabold text-sm'
                          : 'text-rose-600 dark:text-rose-400 font-extrabold text-sm'
                      }
                    >
                      {tx.coinsDelta >= 0
                        ? `+${tx.coinsDelta.toLocaleString('en-US')}`
                        : tx.coinsDelta.toLocaleString('en-US')}{' '}
                      عملة
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Vodafone Cash / InstaPay Recharge Request Modal */}
      {selectedPkg && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !submittingReq && setSelectedPkg(null)}
        >
          <form
            onSubmit={handleSubmitRecharge}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-extrabold text-[#141824] dark:text-white">
                  طلب شحن {selectedPkg.coins.toLocaleString('en-US')} عملة
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-num mt-0.5">
                  المبلغ المطلوب تحويله: {selectedPkg.priceEgp} جنيه مصري
                </p>
              </div>
              <button
                type="button"
                disabled={submittingReq}
                onClick={() => setSelectedPkg(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Method Selector */}
            <div className="space-y-2">
              <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                اختر وسيلة التحويل
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                {(['vodafone_cash', 'instapay'] as PaymentMethod[]).map((methodId) => {
                  const meta = RECHARGE_METHODS[methodId];
                  const active = paymentMethod === methodId;
                  return (
                    <button
                      key={methodId}
                      type="button"
                      onClick={() => setPaymentMethod(methodId)}
                      className={`p-3 rounded-xl border text-right transition-colors cursor-pointer ${
                        active
                          ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/60 dark:border-blue-500'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <p className="text-sm font-extrabold text-[#141824] dark:text-white">
                        {meta.labelAr}
                      </p>
                      <p className="text-xs font-mono-num text-slate-600 dark:text-slate-300 mt-0.5" dir="ltr">
                        {meta.accountNumber}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Transfer Target Number Card */}
            <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-2">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {activeMethodMeta.instructionAr}
              </p>
              <div className="flex items-center justify-between gap-3 pt-1">
                <span
                  className="text-lg font-extrabold font-mono-num text-[#141824] dark:text-white"
                  dir="ltr"
                >
                  {activeMethodMeta.accountNumber}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyNumber(activeMethodMeta.accountNumber, 'modal')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  {copiedKey === 'modal' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>تم النسخ</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>نسخ الرقم</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Optional Sender Ref */}
            <div className="space-y-1.5">
              <label
                htmlFor="sender-info"
                className="block text-xs font-bold text-slate-700 dark:text-slate-200"
              >
                رقم المحفظة أو حساب إنستا باي المحوّل منه (اختياري)
              </label>
              <input
                id="sender-info"
                type="text"
                value={senderInfo}
                onChange={(e) => setSenderInfo(e.target.value)}
                maxLength={80}
                placeholder="مثال: 010xxxxxxxx أو اسم حساب InstaPay"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141824] dark:text-white rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>

            {/* Optional Receipt Image Upload */}
            <div className="space-y-2">
              <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                إرفاق صورة التحويل (اختياري)
              </span>

              {receiptImage ? (
                <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={receiptImage}
                      alt="معاينة صورة التحويل"
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 object-cover rounded-lg shrink-0"
                    />
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      تم إرفاق صورة التحويل وجاهزة للإرسال
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReceiptImage('')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>إزالة</span>
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-1.5 py-5 px-4 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50/70 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                  <ImagePlus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    {compressing ? 'جاري تجهيز الصورة...' : 'اضغط لاختيار صورة إيصال التحويل (اختياري)'}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    يمكنك الإرسال بدون صورة أو إرفاق لقطة شاشة للتحويل لتسريع المراجعة
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={compressing}
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </label>
              )}

              {receiptError && (
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {receiptError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={submittingReq}
                onClick={() => setSelectedPkg(null)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={submittingReq || compressing}
                className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 rounded-lg cursor-pointer"
              >
                {submittingReq ? 'جاري إرسال الطلب...' : 'تأكيد وإرسال طلب الشحن'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* User Receipt Preview Lightbox */}
      {previewReceipt && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewReceipt(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl max-w-xl w-full p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-[#141824] dark:text-white">
                صورة إيصال التحويل
              </h3>
              <button
                type="button"
                onClick={() => setPreviewReceipt(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto rounded-xl bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-2">
              <img
                src={previewReceipt}
                alt="صورة التحويل"
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[64vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
