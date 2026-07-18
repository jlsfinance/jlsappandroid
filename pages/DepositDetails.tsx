import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, runTransaction, collection, addDoc, getDocs, query, where, deleteDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Deposit, DepositInstallment } from '../types';
import { useCompany } from '../context/CompanyContext';
import { format, parseISO, isPast } from 'date-fns';
import { WhatsappService } from '../services/whatsappService';
import { DownloadService } from '../services/DownloadService';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { generateDepositAgreementPDF, generateDepositSchedulePDF } from '../services/depositPdf';

const formatCurrency = (v: number | undefined) => `Rs. ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v || 0)}`;

const DepositDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentCompany } = useCompany();
  const [deposit, setDeposit] = useState<Deposit | null>(null);
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<any>(null);

  const [selectedInst, setSelectedInst] = useState<DepositInstallment | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [customAmount, setCustomAmount] = useState<number>(0);
  const [paymentRemark, setPaymentRemark] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [forecloseOpen, setForecloseOpen] = useState(false);
  const [foreclosurePct, setForeclosurePct] = useState(2);
  const DEFAULT_FORECLOSURE_PCT = 2;

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "deposits", id));
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() } as Deposit;
        setDeposit(d);
        if (d.customerId) {
          const cSnap = await getDoc(doc(db, "customers", d.customerId));
          if (cSnap.exists()) setCustomer(cSnap.data());
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const paidCount = deposit?.depositSchedule?.filter(i => i.status === 'Paid').length || 0;
  const totalCount = deposit?.depositSchedule?.length || 0;
  const collected = deposit?.depositSchedule?.filter(i => i.status === 'Paid').reduce((s, i) => s + (i.amountPaid || i.amount), 0) || 0;
  const companyDetails = useMemo(() => ({
    name: currentCompany?.name || "Finance Company",
    address: currentCompany?.address || "",
    phone: currentCompany?.phone || "",
  }), [currentCompany]);

  const handleCollect = async () => {
    if (!selectedInst || !deposit || isSubmitting) return;
    const amountToPay = customAmount > 0 ? customAmount : selectedInst.amount;
    setIsSubmitting(true);
    try {
      await runTransaction(db, async (transaction) => {
        const depRef = doc(db, "deposits", deposit.id);
        const depSnap = await transaction.get(depRef);
        if (!depSnap.exists()) throw new Error("Deposit not found");
        const data = depSnap.data();
        const today = format(new Date(), 'yyyy-MM-dd');
        const updatedSchedule = (data.depositSchedule || []).map((inst: DepositInstallment) => {
          if (inst.installmentNumber === selectedInst.installmentNumber) {
            return { ...inst, status: 'Paid', paymentDate: today, paymentMethod, amountPaid: amountToPay, remark: paymentRemark };
          }
          return inst;
        });
        transaction.update(depRef, { depositSchedule: updatedSchedule });

        // Cash account: deposit received = CREDIT (cash in)
        await addDoc(collection(db, "ledger"), {
          companyId: deposit.companyId,
          customerId: deposit.customerId,
          depositId: deposit.id,
          date: new Date().toISOString(),
          narration: `Deposit Recd: ${deposit.customerName} (#${deposit.id})`,
          entries: [{ account: 'Cash / Bank', type: 'Credit', amount: amountToPay }],
          createdAt: new Date().toISOString(),
        });
      });
      alert("Deposit collected! Cash account updated.");
      // ponytail: notify customer kist received
      WhatsappService.sendDepositReceived(
        deposit.customerName, WhatsappService.phoneOf(customer),
        amountToPay, deposit.id, selectedInst.installmentNumber, format(new Date(), 'yyyy-MM-dd')
      );
      setSelectedInst(null); setCustomAmount(0); setPaymentRemark('');
      load();
    } catch (e: any) {
      console.error(e);
      alert("Failed: " + e.message);
    } finally { setIsSubmitting(false); }
  };

  // ponytail: inverse of handleCollect — un-collect one installment + remove its ledger Credit
  const handleUndoCollect = async (inst: DepositInstallment) => {
    if (!deposit || isSubmitting) return;
    if (!confirm(`Undo collection for installment #${inst.installmentNumber} of ${formatCurrency(inst.amountPaid || inst.amount)}?`)) return;
    setIsSubmitting(true);
    try {
      await runTransaction(db, async (transaction) => {
        const depRef = doc(db, "deposits", deposit.id);
        const depSnap = await transaction.get(depRef);
        if (!depSnap.exists()) throw new Error("Deposit not found");
        const data = depSnap.data();
        const updatedSchedule = (data.depositSchedule || []).map((s: DepositInstallment) => {
          if (s.installmentNumber === inst.installmentNumber) {
            const { status, paymentDate, paymentMethod, amountPaid, remark, ...rest } = s;
            return { ...rest, status: 'Pending' };
          }
          return s;
        });
        transaction.update(depRef, { depositSchedule: updatedSchedule });
      });

      const ledSnap = await getDocs(query(
        collection(db, "ledger"),
        where("depositId", "==", deposit.id),
        where("companyId", "==", deposit.companyId)
      ));
      for (const l of ledSnap.docs) {
        const e = l.data();
        const ent = (e.entries || [])[0];
        if (ent && ent.type === 'Credit' && (ent.amount === inst.amountPaid || ent.amount === inst.amount)) {
          await deleteDoc(doc(db, "ledger", l.id));
        }
      }
      alert("Collection undone. Cash account updated.");
      load();
    } catch (e: any) {
      console.error(e); alert("Failed: " + e.message);
    } finally { setIsSubmitting(false); }
  };

  const handlePayMaturity = async () => {
    if (!deposit || isSubmitting) return;
    if (!confirm(`Pay maturity amount ${formatCurrency(deposit.maturityAmount)} to ${deposit.customerName}?`)) return;
    setIsSubmitting(true);
    try {
      await runTransaction(db, async (transaction) => {
        const depRef = doc(db, "deposits", deposit.id);
        transaction.update(depRef, { status: 'Matured' });
        // Cash account: interest/maturity payout = DEBIT (cash out)
        await addDoc(collection(db, "ledger"), {
          companyId: deposit.companyId,
          customerId: deposit.customerId,
          depositId: deposit.id,
          date: new Date().toISOString(),
          narration: `Maturity Payout: ${deposit.customerName} (#${deposit.id})`,
          entries: [{ account: 'Cash / Bank', type: 'Debit', amount: deposit.maturityAmount || 0 }],
          createdAt: new Date().toISOString(),
        });
      });
      alert("Maturity paid. Cash account updated.");
      load();
    } catch (e: any) {
      console.error(e); alert("Failed: " + e.message);
    } finally { setIsSubmitting(false); }
  };

  // ponytail: foreclosure preview — interest on ACTUAL deposited kists for ACTUAL months held,
  // then a foreclosure charge % (company income) is deducted from that interest.
  const foreclosePreview = useMemo(() => {
    if (!deposit) return { principalPaid: 0, charge: 0, payable: 0, interestEarned: 0 };
    const monthlyRate = (deposit.interestRate || 0) / 12 / 100;
    const today = new Date();
    const paid = (deposit.depositSchedule || []).filter(i => i.status === 'Paid');
    const principalPaid = paid.reduce((s, i) => s + (i.amountPaid || i.amount), 0);
    // interest = sum of each kist amount * rate * months from its payment to foreclose date
    const interestEarned = Math.round(paid.reduce((s, i) => {
      const from = i.paymentDate ? new Date(i.paymentDate) : new Date(deposit.startDate);
      const monthsHeld = Math.max(0, (today.getFullYear() - from.getFullYear()) * 12 + (today.getMonth() - from.getMonth()));
      return s + (i.amountPaid || i.amount) * monthlyRate * monthsHeld;
    }, 0));
    const charge = Math.round((interestEarned * foreclosurePct) / 100);
    const payable = principalPaid + interestEarned - charge;
    return { principalPaid, charge, payable, interestEarned };
  }, [deposit, foreclosurePct]);

  const handleForeclose = async () => {
    if (!deposit || isSubmitting) return;
    if (!confirm(`Foreclose deposit for ${deposit.customerName}?\nPayable: ${formatCurrency(foreclosePreview.payable)}\nForeclosure charge (company income): ${formatCurrency(foreclosePreview.charge)}`)) return;
    setIsSubmitting(true);
    try {
      await runTransaction(db, async (transaction) => {
        const depRef = doc(db, "deposits", deposit.id);
        transaction.update(depRef, { status: 'Foreclosed', foreclosedAt: new Date().toISOString(), foreclosureCharge: foreclosePreview.charge });
        await addDoc(collection(db, "ledger"), {
          companyId: deposit.companyId, customerId: deposit.customerId, depositId: deposit.id,
          date: new Date().toISOString(),
          narration: `Foreclosure Payout: ${deposit.customerName} (#${deposit.id})`,
          entries: [{ account: 'Cash / Bank', type: 'Debit', amount: foreclosePreview.payable }],
          createdAt: new Date().toISOString(),
        });
        await addDoc(collection(db, "ledger"), {
          companyId: deposit.companyId, customerId: deposit.customerId, depositId: deposit.id,
          date: new Date().toISOString(),
          narration: `Foreclosure Charge: ${deposit.customerName} (#${deposit.id})`,
          entries: [{ account: 'Foreclosure Income', type: 'Credit', amount: foreclosePreview.charge }],
          createdAt: new Date().toISOString(),
        });
      });
      WhatsappService.sendForeclosed(deposit.customerName, WhatsappService.phoneOf(customer), foreclosePreview.payable, deposit.id, format(new Date(), 'yyyy-MM-dd'));
      alert("Deposit foreclosed. Payout sent, charge booked as income.");
      setForecloseOpen(false);
      load();
    } catch (e: any) {
      console.error(e); alert("Failed: " + e.message);
    } finally { setIsSubmitting(false); }
  };

  // ponytail: downloadable foreclosure certificate (with customer photo)
  const downloadForeclosureCert = async () => {
    if (!deposit) return;
    const toB64 = (url: string) => new Promise<string | null>((res) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { try { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d')?.drawImage(img, 0, 0); res(c.toDataURL('image/jpeg')); } catch { res(null); } };
      img.onerror = () => res(null);
      img.src = url;
    });
    const docu = new jsPDF();
    const cd = companyDetails;
    docu.setFontSize(16); docu.text(cd.name, 20, 20);
    docu.setFontSize(10); docu.text(cd.address || '', 20, 28); docu.text(`Ph: ${cd.phone || ''}`, 20, 34);
    docu.setFontSize(14); docu.text('FORECLOSURE CERTIFICATE', 20, 50);
    docu.setFontSize(10);
    docu.text(`Certificate No: FC-${deposit.id}`, 20, 60);
    docu.text(`Date: ${format(new Date(), 'dd MMM yyyy')}`, 20, 66);
    docu.text(`Customer: ${deposit.customerName}`, 20, 76);
    docu.text(`Deposit ID: #${deposit.id}   Type: ${deposit.type?.replace('_', ' ').toUpperCase()}`, 20, 82);
    const fp = foreclosePreview;
    docu.text(`Principal deposited: ${formatCurrency(fp.principalPaid)}`, 20, 92);
    docu.text(`Interest (reduced): ${formatCurrency(fp.interestEarned)}`, 20, 98);
    docu.text(`Foreclosure charge (company): ${formatCurrency(fp.charge)}`, 20, 104);
    docu.text(`Amount paid to customer: ${formatCurrency(fp.payable)}`, 20, 110);
    docu.text('This deposit account is hereby foreclosed and closed.', 20, 120);
    docu.text(`Authorised Signatory, ${cd.name}`, 20, 140);
    const photo = deposit.customerPhoto || customer?.photo_url;
    if (photo) {
      const b64 = await toB64(photo);
      if (b64) { try { docu.addImage(b64, 'JPEG', 150, 55, 35, 35); } catch { /* ignore */ } }
    }
    docu.save(`Foreclosure_${deposit.id}.pdf`);
  };

  if (loading) return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div></div>;
  if (!deposit) return <div className="p-8 text-center text-slate-500">Deposit not found.</div>;

  const isFd = deposit.type === 'fd_lumpsum';
  const isPayout = deposit.type === 'rd_payout';

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark pb-24 text-slate-900 dark:text-white">
      <div className="sticky top-0 z-20 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="text-lg font-bold">Deposit #{deposit.id}</h1>
        <div className="flex gap-2">
          {customer?.phone ? (
            <a href={`tel:${customer.phone}`}
              className="p-2 rounded-lg bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400"
              title="Call Customer">
              <span className="material-symbols-outlined text-[18px]">call</span>
            </a>
          ) : null}
          <button onClick={() => generateDepositAgreementPDF(deposit, customer, companyDetails, deposit.customerPhoto)} className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800"><span className="material-symbols-outlined text-[18px]">description</span></button>
          <button onClick={() => generateDepositSchedulePDF(deposit, customer, companyDetails, deposit.customerPhoto)} className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800"><span className="material-symbols-outlined text-[18px]">picture_as_pdf</span></button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="bg-white dark:bg-[#1e2736] rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-lg capitalize">{deposit.customerName}</h2>
              <p className="text-xs text-slate-500">{deposit.type?.replace('_', ' ').toUpperCase()} · {deposit.interestRate}% p.a. · {deposit.tenure} months</p>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${deposit.status === 'Active' ? 'bg-green-100 text-green-700' : deposit.status === 'Matured' ? 'bg-blue-100 text-blue-700' : deposit.status === 'Foreclosed' ? 'bg-orange-100 text-orange-700' : 'bg-slate-200 text-slate-600'}`}>{deposit.status}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 text-center">
            <div>
              <p className="text-xs text-slate-500 uppercase">Principal</p>
              <p className="font-extrabold text-primary">{formatCurrency(deposit.principal)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase">Collected</p>
              <p className="font-extrabold">{formatCurrency(collected)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase">Maturity</p>
              <p className="font-extrabold text-green-600">{formatCurrency(deposit.maturityAmount)}</p>
            </div>
          </div>
          <div className="mt-3">
            <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${totalCount ? (paidCount / totalCount) * 100 : 0}%` }}></div>
            </div>
            <p className="text-xs text-slate-500 mt-1 text-center">{paidCount}/{totalCount} installments</p>
          </div>
          {deposit.status === 'Active' && !isFd && paidCount < totalCount && (
            <button onClick={() => {
              const next = deposit.depositSchedule?.find(i => i.status === 'Pending');
              if (next) { setSelectedInst(next); setCustomAmount(next.amount); }
            }} className="w-full mt-4 py-3 rounded-xl bg-primary text-white font-bold">
              Collect Next Kist ({paidCount + 1}/{totalCount})
            </button>
          )}
          {(deposit.status === 'Active' && (isFd || paidCount === totalCount)) && (
            <button onClick={handlePayMaturity} disabled={isSubmitting}
              className="w-full mt-4 py-3 rounded-xl bg-green-600 text-white font-bold disabled:opacity-60">
              Pay Maturity ({formatCurrency(deposit.maturityAmount)})
            </button>
          )}
          {deposit.status === 'Active' && (
            <button onClick={() => { setForeclosurePct(DEFAULT_FORECLOSURE_PCT); setForecloseOpen(true); }}
              className="w-full mt-2 py-3 rounded-xl bg-orange-600 text-white font-bold">
              Foreclose Deposit
            </button>
          )}
          {deposit.status === 'Foreclosed' && (
            <button onClick={downloadForeclosureCert}
              className="w-full mt-2 py-3 rounded-xl bg-slate-800 text-white font-bold flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[18px]">download</span> Download Foreclosure Cert
            </button>
          )}
        </div>

        <h3 className="font-bold text-base px-1">{isFd ? 'Interest Schedule' : 'Deposit Schedule'}</h3>
        <div className="space-y-2">
          {[...((deposit.depositSchedule || []) as DepositInstallment[])].sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).map(inst => (
            <div key={inst.installmentNumber}
              className={`flex items-center justify-between p-4 bg-white dark:bg-[#1e2736] rounded-xl border border-slate-100 dark:border-slate-800 ${inst.status === 'Pending' && isPast(parseISO(inst.dueDate)) ? 'ring-2 ring-red-400' : ''}`}>
              <div>
                <p className="font-bold">#{inst.installmentNumber} {isPayout && inst.interest ? <span className="text-xs text-green-600">(+₹{inst.interest.toLocaleString('en-IN')} int)</span> : ''}</p>
                <p className="text-xs text-slate-500">{format(parseISO(inst.dueDate), 'dd MMM yyyy')}</p>
                {inst.status === 'Paid' && inst.paymentDate && <p className="text-[11px] text-green-600">Paid {format(parseISO(inst.paymentDate), 'dd MMM')}</p>}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-extrabold">{formatCurrency(inst.amount)}</span>
                {inst.status === 'Pending' ? (
                  <button onClick={() => { setSelectedInst(inst); setCustomAmount(inst.amount); }}
                    className="px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg">Collect</button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded">Paid</span>
                    <button onClick={() => handleUndoCollect(inst)}
                      className="px-2 py-1.5 bg-slate-200 dark:bg-slate-700 text-xs font-bold rounded-lg flex items-center gap-1" title="Undo collection">
                      <span className="material-symbols-outlined text-[14px]">undo</span> Undo
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedInst && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <h3 className="text-lg font-bold mb-1">Collect Deposit</h3>
            <p className="text-sm text-slate-500 mb-4">Installment #{selectedInst.installmentNumber} from {deposit.customerName}</p>
            <div className="space-y-4 mb-6">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex justify-between items-center">
                <span className="text-sm font-bold text-blue-800 dark:text-blue-300">Amount</span>
                <span className="text-lg font-extrabold text-blue-600">{formatCurrency(selectedInst.amount)}</span>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">Amount Received</label>
                <input type="number" value={customAmount || selectedInst.amount} onChange={(e) => setCustomAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none text-lg font-bold" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {['cash', 'upi', 'bank'].map(m => (
                    <button key={m} onClick={() => setPaymentMethod(m)}
                      className={`py-2 rounded-lg text-sm font-bold capitalize border ${paymentMethod === m ? 'bg-primary text-white border-primary' : 'bg-white dark:bg-[#1a2230] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>{m}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">Remark</label>
                <input type="text" value={paymentRemark} onChange={(e) => setPaymentRemark(e.target.value)} placeholder="Notes..."
                  className="w-full px-3 py-2 bg-white dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none" />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setSelectedInst(null); setCustomAmount(0); setPaymentRemark(''); }} className="px-4 py-2 text-sm font-bold text-slate-500">Cancel</button>
              <button onClick={handleCollect} disabled={isSubmitting}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 flex items-center gap-2">
                {isSubmitting && <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></div>}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {forecloseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <h3 className="text-lg font-bold mb-1">Foreclose Deposit</h3>
            <p className="text-sm text-slate-500 mb-4">{deposit.customerName} · #{deposit.id}</p>
            <div className="space-y-3 mb-5">
              <div className="flex justify-between text-sm"><span className="text-slate-500">Principal collected</span><span className="font-bold">{formatCurrency(foreclosePreview.principalPaid)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Interest (reduced)</span><span className="font-bold text-green-600">{formatCurrency(foreclosePreview.interestEarned)}</span></div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Foreclosure Charge (%) — company income</label>
                <input type="number" min={0} max={10} step={0.5} value={foreclosurePct}
                  onChange={(e) => setForeclosurePct(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg font-bold" />
              </div>
              <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg flex justify-between items-center">
                <span className="text-sm font-bold text-orange-800 dark:text-orange-300">Payable to customer</span>
                <span className="text-lg font-extrabold text-orange-600">{formatCurrency(foreclosePreview.payable)}</span>
              </div>
              <div className="flex justify-between text-sm text-orange-700 dark:text-orange-400"><span>Charge kept by company</span><span className="font-bold">{formatCurrency(foreclosePreview.charge)}</span></div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setForecloseOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-500">Cancel</button>
              <button onClick={handleForeclose} disabled={isSubmitting}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 flex items-center gap-2">
                {isSubmitting && <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></div>}
                Foreclose
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DepositDetails;
