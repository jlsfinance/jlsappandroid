import { addMonths, format } from 'date-fns';
import { Deposit, DepositInstallment, DepositType } from '../types';

// Compute maturity amount for a deposit plan
export const computeMaturity = (
  type: DepositType,
  principal: number,
  monthlyAmount: number,
  interestRate: number,
  tenure: number
): number => {
  const monthlyRate = interestRate / 12 / 100;

  if (type === 'fd_lumpsum') {
    // Simple interest paid at maturity (principal * r * t)
    return Math.round(principal + principal * monthlyRate * tenure);
  }

  // RD: each kist earns interest for the months it stays in the account after deposit
  let maturity = 0;
  for (let i = 0; i < tenure; i++) {
    const monthsDeposited = tenure - i;
    maturity += monthlyAmount * (1 + monthlyRate * (monthsDeposited - 1));
  }
  return Math.round(maturity);
};

// Generate the installment schedule
export const generateDepositSchedule = (
  type: DepositType,
  principal: number,
  monthlyAmount: number,
  interestRate: number,
  tenure: number,
  startDate: string,
  emiDueDay: number = 1
): { schedule: DepositInstallment[]; maturityDate: string; maturityAmount: number } => {
  const monthlyRate = interestRate / 12 / 100;
  const startObj = new Date(startDate);
  const schedule: DepositInstallment[] = [];

  if (type === 'fd_lumpsum') {
    // Single deposit now, interest accrues; show per-month interest installments
    const firstDate = new Date(startObj.getFullYear(), startObj.getMonth(), emiDueDay);
    for (let i = 0; i < tenure; i++) {
      const d = addMonths(firstDate, i);
      schedule.push({
        installmentNumber: i + 1,
        dueDate: format(d, 'yyyy-MM-dd'),
        amount: Math.round(principal * monthlyRate), // interest for the month
        interest: Math.round(principal * monthlyRate),
        status: 'Pending',
      });
    }
    const maturityDate = format(addMonths(firstDate, tenure), 'yyyy-MM-dd');
    return { schedule, maturityDate, maturityAmount: Math.round(principal + principal * monthlyRate * tenure) };
  }

  // RD (maturity or payout): monthly deposit starts from the SAME month.
  // Interest on kist N = interest on all previously deposited kists for the months
  // they've been in the account (kist 1 earns 0, kist 2 earns 1 month on kist 1, etc.)
  const firstDate = new Date(startObj.getFullYear(), startObj.getMonth(), emiDueDay);
  let balance = 0;
  for (let i = 0; i < tenure; i++) {
    const d = addMonths(firstDate, i);
    const interest = Math.round(balance * monthlyRate);
    schedule.push({
      installmentNumber: i + 1,
      dueDate: format(d, 'yyyy-MM-dd'),
      amount: monthlyAmount,
      interest,
      status: 'Pending',
    });
    balance += monthlyAmount;
  }
  const maturityDate = format(addMonths(firstDate, tenure), 'yyyy-MM-dd');
  const maturityAmount = computeMaturity(type, principal, monthlyAmount, interestRate, tenure);
  return { schedule, maturityDate, maturityAmount };
};
