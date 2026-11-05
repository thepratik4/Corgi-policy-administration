'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { usePolicyAdmin } from '../../services/policyAdminStore';
import {
  calculatePortfolioMetrics,
  calculatePortfolioProgressBreakdown,
} from '../../utils/financialRules';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { StatusIndicator } from '../../components/ui/StatusIndicator';
import { Modal } from '../../components/ui/Modal';
import { MONTHLY_PREMIUM_COLLECTION_DATA } from '../../mocks/seedData';
import {
  Plus,
  FilePlus2,
  ShieldAlert,
  ArrowUpRight,
  Search,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Sparkles,
  Layers,
  Building2,
  FileCheck2,
  X,
} from 'lucide-react';
import { Policy } from '../../types/domain';

interface WeeklyVelocityPoint {
  day: string;
  fullDay: string;
  written: number;
  collected: number;
  earned: number;
  pct: number;
  isProjected: boolean;
  policiesCount: number;
}

const WEEKLY_VELOCITY_DATA: WeeklyVelocityPoint[] = [
  {
    day: 'S',
    fullDay: 'Sunday · Nov 01',
    written: 28500,
    collected: 24000,
    earned: 18200,
    pct: 48,
    isProjected: true,
    policiesCount: 2,
  },
  {
    day: 'M',
    fullDay: 'Monday · Nov 02',
    written: 64000,
    collected: 58000,
    earned: 41000,
    pct: 79,
    isProjected: false,
    policiesCount: 4,
  },
  {
    day: 'T',
    fullDay: 'Tuesday · Nov 03',
    written: 59200,
    collected: 54000,
    earned: 38500,
    pct: 74,
    isProjected: false,
    policiesCount: 3,
  },
  {
    day: 'W',
    fullDay: 'Wednesday · Nov 04',
    written: 72000,
    collected: 68500,
    earned: 46200,
    pct: 91,
    isProjected: false,
    policiesCount: 5,
  },
  {
    day: 'T',
    fullDay: 'Thursday · Nov 05 (Est.)',
    written: 66000,
    collected: 59000,
    earned: 42000,
    pct: 83,
    isProjected: true,
    policiesCount: 4,
  },
  {
    day: 'F',
    fullDay: 'Friday · Nov 06 (Est.)',
    written: 51000,
    collected: 45000,
    earned: 33500,
    pct: 64,
    isProjected: true,
    policiesCount: 3,
  },
  {
    day: 'S',
    fullDay: 'Saturday · Nov 07 (Est.)',
    written: 38000,
    collected: 31000,
    earned: 24000,
    pct: 52,
    isProjected: true,
    policiesCount: 2,
  },
];

interface TeamCollaborationItem {
  id: string;
  memberName: string;
  roleTitle: string;
  initials: string;
  avatarBg: string;
  taskTitle: string;
  entityRef: string;
  targetTab: 'policies' | 'claims' | 'approvals' | 'reconciliation' | 'ledger';
  status: 'Completed' | 'In Progress' | 'Pending';
}

const INITIAL_TEAM_TASKS: TeamCollaborationItem[] = [
  {
    id: 'tsk-1',
    memberName: 'Alex Rivera',
    roleTitle: 'Senior Operations Admin',
    initials: 'AR',
    avatarBg: 'bg-orange-600 text-white',
    taskTitle: 'Fremont R&D Warehouse Endorsement Schedule',
    entityRef: 'CRG-CGL-2026-8410',
    targetTab: 'policies',
    status: 'Completed',
  },
  {
    id: 'tsk-2',
    memberName: 'Sarah Chen, CPA',
    roleTitle: 'Controllership & Treasury',
    initials: 'SC',
    avatarBg: 'bg-slate-900 text-white',
    taskTitle: 'Four-Eyes Forensic Payout Authorization ($48.5K)',
    entityRef: 'APR-2026-104',
    targetTab: 'approvals',
    status: 'In Progress',
  },
  {
    id: 'tsk-3',
    memberName: 'Elena Rostova',
    roleTitle: 'Lead Specialty Underwriter',
    initials: 'ER',
    avatarBg: 'bg-amber-600 text-white',
    taskTitle: 'Side A D&O Retention & BioLabs Bind Review',
    entityRef: 'CRG-DNO-2026-8481',
    targetTab: 'policies',
    status: 'Pending',
  },
  {
    id: 'tsk-4',
    memberName: 'Claire Beaumont',
    roleTitle: 'Commercial Claims Adjuster',
    initials: 'CB',
    avatarBg: 'bg-emerald-700 text-white',
    taskTitle: 'Cold-Chain Bay 4 Salvage Reserve Step-Down',
    entityRef: 'CLM-2026-0091',
    targetTab: 'claims',
    status: 'In Progress',
  },
];

export function DashboardView() {
  const {
    policies,
    brokers,
    payments,
    claims,
    approvalRequests,
    reconciliationItems,
    navigateTo,
    issueNewPolicy,
    bindDraftOrPendingPolicy,
    createEndorsement,
    openNewClaim,
    addToast,
  } = usePolicyAdmin();

  // Quick Modals
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [endorseModalOpen, setEndorseModalOpen] = useState(false);
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  // Dashboard Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeBottomTab, setActiveBottomTab] = useState<'policies' | 'payments' | 'distribution'>('policies');

  // Interactive Analytics State (Donezo Pill-Bar Chart)
  const [analyticsCadence, setAnalyticsCadence] = useState<'weekly' | 'monthly'>('weekly');
  const [analyticsMetric, setAnalyticsMetric] = useState<'written' | 'collected' | 'earned'>('written');
  const [selectedBarIndex, setSelectedBarIndex] = useState<number>(2); // Defaults to Tuesday (74%) like reference

  // Interactive Reminders Carousel State
  const [reminderIndex, setReminderIndex] = useState(0);

  // Interactive Team Collaboration State
  const [teamTasks, setTeamTasks] = useState<TeamCollaborationItem[]>(INITIAL_TEAM_TASKS);
  const [newTaskMember, setNewTaskMember] = useState('Alex Rivera');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskRef, setNewTaskRef] = useState('CRG-CYB-2026-8419');

  // Interactive Semi-Circular Gauge Mode
  const [gaugeMode, setGaugeMode] = useState<'earned' | 'collection' | 'reconciliation'>('earned');

  // Issue Policy Form State
  const [customerName, setCustomerName] = useState('');
  const [customerIndustry, setCustomerIndustry] = useState('Enterprise Cloud & AI');
  const [brokerId, setBrokerId] = useState(brokers[0]?.id || 'brk-01');
  const [lineOfBusiness, setLineOfBusiness] = useState<Policy['lineOfBusiness']>('Cyber & Tech E&O');
  const [writtenPremium, setWrittenPremium] = useState('42000');
  const [aggregateLimit, setAggregateLimit] = useState('2000000');
  const [deductible, setDeductible] = useState('15000');
  const [issueError, setIssueError] = useState('');

  // Quick Endorsement Form State
  const activePolicies = policies.filter((p) => p.status === 'Active');
  const [endorsePolicyId, setEndorsePolicyId] = useState(activePolicies[0]?.id || '');
  const [endorseDesc, setEndorseDesc] = useState('');
  const [endorseDelta, setEndorseDelta] = useState('3500');
  const [endorseError, setEndorseError] = useState('');

  // Quick Open Claim Form State
  const [claimPolicyId, setClaimPolicyId] = useState(activePolicies[0]?.id || '');
  const [claimLossDate, setClaimLossDate] = useState('2026-11-01');
  const [claimDesc, setClaimDesc] = useState('');
  const [claimedAmount, setClaimedAmount] = useState('45000');
  const [initialReserve, setInitialReserve] = useState('45000');
  const [claimError, setClaimError] = useState('');

  // Core Portfolio Calculations
  const metrics = calculatePortfolioMetrics(policies);
  const progressBreakdown = calculatePortfolioProgressBreakdown(policies);
  const outstandingReserves = claims.reduce((sum, c) => sum + c.outstandingReserve, 0);
  const pendingApprovals = approvalRequests.filter((a) => a.status === 'Pending');
  const matchedRecCount = reconciliationItems.filter((r) => r.matchStatus === 'Matched').length;
  const recMatchPct =
    reconciliationItems.length > 0
      ? Math.round((matchedRecCount / reconciliationItems.length) * 100)
      : 100;

  const statusDistribution: { status: Policy['status']; count: number; premium: number }[] = (
    ['Active', 'Pending', 'Draft', 'Expired', 'Cancelled'] as const
  ).map((st) => {
    const subset = policies.filter((p) => p.status === st);
    return {
      status: st,
      count: subset.length,
      premium: subset.reduce((s, p) => s + p.writtenPremium, 0),
    };
  });

  // Reminders Data derived from live state
  const reminders = [
    {
      id: 'rem-1',
      title: 'Underwriting Committee: Vanguard Cloud',
      subtitle: `${pendingApprovals.length} pending four-eyes approvals · Forensic retainer & cyber endorsement review`,
      timeWindow: 'Time : 02.00 pm - 04.00 pm',
      ctaLabel: `Review Approval Queue (${pendingApprovals.length})`,
      onAction: () => navigateTo('approvals'),
    },
    {
      id: 'rem-2',
      title: 'Cold-Chain Loss Reserve Audit',
      subtitle: `Cascadia Cold Storage (CLM-2026-0091) · ${formatCurrency(outstandingReserves)} total case reserves`,
      timeWindow: 'Time : 04.15 pm - 05.00 pm',
      ctaLabel: 'Open Claims Reserve Desk',
      onAction: () => navigateTo('claims', 'clm-301'),
    },
    {
      id: 'rem-3',
      title: 'Stripe Settlement Break Triage',
      subtitle: 'Sunbelt Precision Machining (-$565 fee variance) & Redwood endorsement clearing',
      timeWindow: 'Time : 05.00 pm - 05.30 pm',
      ctaLabel: 'Reconcile Settlement Breaks',
      onAction: () => navigateTo('reconciliation'),
    },
  ];
  const currentReminder = reminders[reminderIndex % reminders.length];

  // Analytics Bar Data normalized for Pill-Bar Chart
  const chartBars =
    analyticsCadence === 'weekly'
      ? WEEKLY_VELOCITY_DATA.map((d) => {
          const val = d[analyticsMetric];
          const maxVal =
            analyticsMetric === 'written' ? 80000 : analyticsMetric === 'collected' ? 75000 : 55000;
          const heightPct = Math.max(28, Math.min(96, Math.round((val / maxVal) * 100)));
          return {
            shortLabel: d.day,
            fullLabel: d.fullDay,
            value: val,
            pctLabel: `${heightPct}%`,
            heightPct,
            isProjected: d.isProjected,
            subMeta: `${d.policiesCount} policies · ${formatCurrency(d.collected)} cash`,
          };
        })
      : MONTHLY_PREMIUM_COLLECTION_DATA.map((m, idx) => {
          const val = m[analyticsMetric];
          const maxVal = 95000;
          const heightPct = Math.max(30, Math.min(96, Math.round((val / maxVal) * 100)));
          return {
            shortLabel: m.month,
            fullLabel: `${m.month} 2026 · Fiscal Period`,
            value: val,
            pctLabel: `${heightPct}%`,
            heightPct,
            isProjected: idx >= 4,
            subMeta: `Written ${formatCurrency(m.written)} · Earned ${formatCurrency(m.earned)}`,
          };
        });

  const activeBar = chartBars[selectedBarIndex] || chartBars[0];

  // Gauge Primary Percentage
  const gaugePrimaryPct =
    gaugeMode === 'earned'
      ? progressBreakdown.earnedPct
      : gaugeMode === 'collection'
      ? progressBreakdown.collectionPct
      : recMatchPct;

  const gaugeSubtitle =
    gaugeMode === 'earned'
      ? 'Book Premium Earned'
      : gaugeMode === 'collection'
      ? 'Written Cash Settled'
      : 'Stripe Entries Matched';

  // Filtered Policies & Payments for search query
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredPolicies = normalizedSearch
    ? policies.filter(
        (p) =>
          p.policyNumber.toLowerCase().includes(normalizedSearch) ||
          p.customerName.toLowerCase().includes(normalizedSearch) ||
          p.lineOfBusiness.toLowerCase().includes(normalizedSearch) ||
          p.brokerName.toLowerCase().includes(normalizedSearch)
      )
    : policies;

  const filteredPayments = normalizedSearch
    ? payments.filter(
        (pay) =>
          pay.customerName.toLowerCase().includes(normalizedSearch) ||
          pay.policyNumber.toLowerCase().includes(normalizedSearch) ||
          pay.stripePaymentIntentId.toLowerCase().includes(normalizedSearch)
      )
    : payments;

  // Handlers
  const handleCycleTaskStatus = (taskId: string) => {
    const order: TeamCollaborationItem['status'][] = ['In Progress', 'Completed', 'Pending'];
    setTeamTasks((prev) =>
      prev.map((item) => {
        if (item.id !== taskId) return item;
        const nextStatus = order[(order.indexOf(item.status) + 1) % order.length];
        addToast({
          title: `Task Status Updated to ${nextStatus}`,
          description: `${item.memberName}: ${item.taskTitle}`,
          variant: nextStatus === 'Completed' ? 'success' : 'info',
        });
        return { ...item, status: nextStatus };
      })
    );
  };

  const handleAddTeamTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const initials = newTaskMember
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const newItem: TeamCollaborationItem = {
      id: `tsk-${Date.now()}`,
      memberName: newTaskMember,
      roleTitle: 'Commercial Underwriting Desk',
      initials,
      avatarBg: 'bg-[#EA580C] text-white',
      taskTitle: newTaskTitle.trim(),
      entityRef: newTaskRef.trim() || 'CRG-CGL-2026-8410',
      targetTab: 'policies',
      status: 'In Progress',
    };
    setTeamTasks((prev) => [newItem, ...prev]);
    setNewTaskTitle('');
    setTaskModalOpen(false);
    addToast({
      title: 'Underwriting Task Assigned',
      description: `Assigned "${newItem.taskTitle}" to ${newItem.memberName}.`,
      variant: 'success',
    });
  };

  const handleIssuePolicySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setIssueError('Named insured / customer name is required.');
      return;
    }
    const premiumNum = Number(writtenPremium);
    const limitNum = Number(aggregateLimit);
    if (!premiumNum || premiumNum <= 0 || !limitNum || limitNum <= 0) {
      setIssueError('Written premium and coverage limit must be positive numbers.');
      return;
    }
    setIssueError('');
    issueNewPolicy({
      customerName: customerName.trim(),
      customerIndustry,
      customerEin: '84-9920142',
      customerAddress: '525 Market Street, San Francisco, CA 94105',
      brokerId,
      lineOfBusiness,
      writtenPremium: premiumNum,
      aggregateCoverageLimit: limitNum,
      perOccurrenceLimit: Math.round(limitNum / 2),
      deductible: Number(deductible) || 10000,
      effectiveDate: '2026-11-04',
      expirationDate: '2027-11-04',
    });
    setCustomerName('');
    setIssueModalOpen(false);
  };

  const handleEndorseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!endorsePolicyId || !endorseDesc.trim()) {
      setEndorseError('Please select a policy and enter an endorsement description.');
      return;
    }
    setEndorseError('');
    createEndorsement({
      policyId: endorsePolicyId,
      effectiveDate: '2026-11-04',
      description: endorseDesc.trim(),
      premiumDelta: Number(endorseDelta) || 0,
    });
    setEndorseDesc('');
    setEndorseModalOpen(false);
  };

  const handleOpenClaimSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimPolicyId || !claimDesc.trim()) {
      setClaimError('Please select an active policy and describe the incident.');
      return;
    }
    const result = openNewClaim({
      policyId: claimPolicyId,
      lossDate: claimLossDate,
      description: claimDesc.trim(),
      claimedAmount: Number(claimedAmount) || 0,
      initialReserve: Number(initialReserve) || 0,
    });
    if (!result.success) {
      setClaimError(result.error || 'Unable to open claim.');
      return;
    }
    setClaimError('');
    setClaimDesc('');
    setClaimModalOpen(false);
  };

  // Pipeline ordering: prioritize Pending/Draft submissions followed by Active policies
  const pipelinePolicies = [
    ...policies.filter((p) => p.status === 'Pending' || p.status === 'Draft'),
    ...policies.filter((p) => p.status === 'Active'),
  ].slice(0, 5);

  return (
    <div className="space-y-4">

      {/* Dashboard Title & Pill CTA Row (Matches Donezo "Dashboard" + "+ Add Project / Import Data") */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 font-display">
            Operations Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Underwrite, prioritize, and reconcile commercial insurance portfolios with ease.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIssueModalOpen(true)}
            className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-[#EA580C] to-[#C2410C] hover:from-[#C2410C] hover:to-[#9A3412] rounded-full transition-all shadow-xs hover:shadow-md active:scale-[0.98] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Issue Policy</span>
          </button>

          <button
            type="button"
            onClick={() => setEndorseModalOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-50 rounded-full transition-all active:scale-[0.98] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <FilePlus2 className="w-3.5 h-3.5 text-[#EA580C]" />
            <span>Create Endorsement</span>
          </button>

          <button
            type="button"
            onClick={() => setClaimModalOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-50 rounded-full transition-all active:scale-[0.98] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
            <span>Open Claim</span>
          </button>
        </div>
      </div>

      {/* ROW 1: 4 Hero Bento Stat Cards (1 Featured Corgi Gradient Card + 3 Crisp White Cards) */}
      <section aria-label="Key Financial and Operational Metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Featured Corgi Orange-to-Amber Gradient Hero Card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="bg-gradient-to-br from-[#EA580C] via-[#D97706] to-[#9A3412] text-white rounded-2xl p-4 sm:p-5 flex flex-col justify-between relative overflow-hidden shadow-sm"
        >
          {/* Subtle decorative Corgi architectural arcs */}
          <svg
            aria-hidden="true"
            className="absolute -right-8 -bottom-8 w-32 h-32 text-white/10 pointer-events-none"
            viewBox="0 0 100 100"
            fill="none"
          >
            <circle cx="70" cy="70" r="45" stroke="currentColor" strokeWidth="8" />
            <circle cx="70" cy="70" r="28" stroke="currentColor" strokeWidth="6" />
          </svg>

          <div className="flex items-center justify-between gap-2 relative z-10">
            <span className="text-xs font-medium text-orange-50 whitespace-nowrap">
              Total Active Policies
            </span>
            <button
              type="button"
              onClick={() => navigateTo('policies')}
              aria-label="Navigate to Active Policies"
              className="w-7 h-7 rounded-full bg-white text-slate-900 flex items-center justify-center hover:scale-105 transition-transform shrink-0 shadow-2xs"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="my-2.5 relative z-10 flex items-baseline justify-between gap-2">
            <p className="text-4xl font-bold font-mono tabular-nums tracking-tight">
              {metrics.activeCount}
            </p>
            <div className="text-right">
              <p className="text-[11px] text-orange-100">Written Book</p>
              <p className="text-sm font-bold font-mono tabular-nums text-white">
                {formatCurrency(metrics.writtenPremium)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-orange-100 relative z-10 whitespace-nowrap">
            <span className="font-mono font-semibold text-white">
              +{policies.filter((p) => p.status === 'Pending' || p.status === 'Draft').length} pipeline
            </span>
            <span aria-hidden="true">·</span>
            <span>of {policies.length} total policies</span>
          </div>
        </motion.div>

        {/* Card 2: Earned vs Unearned Premium Recognition */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.04 }}
          className="bg-white border border-slate-200/90 hover:border-orange-300 rounded-2xl p-4 sm:p-5 flex flex-col justify-between transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-700 whitespace-nowrap">
              Earned Premium
            </span>
            <button
              type="button"
              onClick={() => navigateTo('ledger')}
              aria-label="Inspect Earned Premium in Double-Entry Ledger"
              className="w-7 h-7 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900 flex items-center justify-center transition-colors shrink-0"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="my-2.5">
            <p className="text-3xl font-bold text-slate-900 font-mono tabular-nums tracking-tight">
              {formatCurrency(metrics.earnedPremium)}
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 whitespace-nowrap">
            <span className="text-emerald-700 font-semibold font-mono tabular-nums">
              {progressBreakdown.earnedPct}% recognized
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums truncate">
              {formatCurrency(metrics.unearnedPremium)} unearned
            </span>
          </div>
        </motion.div>

        {/* Card 3: Collected Cash & Stripe Settlement */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.08 }}
          className="bg-white border border-slate-200/90 hover:border-orange-300 rounded-2xl p-4 sm:p-5 flex flex-col justify-between transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-700 whitespace-nowrap">
              Premium Collected
            </span>
            <button
              type="button"
              onClick={() => navigateTo('payments')}
              aria-label="Inspect Stripe Sandbox Payments"
              className="w-7 h-7 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900 flex items-center justify-center transition-colors shrink-0"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="my-2.5">
            <p className="text-3xl font-bold text-slate-900 font-mono tabular-nums tracking-tight">
              {formatCurrency(metrics.collectedPremium)}
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 whitespace-nowrap">
            <span className="text-[#EA580C] font-semibold font-mono tabular-nums">
              {progressBreakdown.collectionPct}% settled
            </span>
            <span aria-hidden="true">·</span>
            <span>Clearing Acct 1010</span>
          </div>
        </motion.div>

        {/* Card 4: Pending Approvals & Claims Reserves */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.12 }}
          className="bg-white border border-slate-200/90 hover:border-orange-300 rounded-2xl p-4 sm:p-5 flex flex-col justify-between transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-700 whitespace-nowrap">
              Pending Approvals
            </span>
            <button
              type="button"
              onClick={() => navigateTo('approvals')}
              aria-label="Review Four-Eyes Approval Queue"
              className="w-7 h-7 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900 flex items-center justify-center transition-colors shrink-0"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="my-2.5 flex items-baseline justify-between gap-2">
            <p className="text-3xl font-bold text-slate-900 font-mono tabular-nums tracking-tight">
              {pendingApprovals.length}
            </p>
            <div className="text-right">
              <p className="text-[11px] text-slate-400">Claims Reserves</p>
              <p className="text-sm font-bold font-mono tabular-nums text-amber-700">
                {formatCurrency(outstandingReserves)}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 whitespace-nowrap">
            <span>Four-eyes queue · {claims.length} open claims</span>
            <button
              type="button"
              onClick={() => navigateTo('approvals')}
              className="font-semibold text-[#EA580C] hover:underline"
            >
              Review
            </button>
          </div>
        </motion.div>
      </section>

      {/* ROW 2: Middle 3-Column Bento Grid (Analytics Pill Bars + Reminders + Policy Pipeline) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Col 1 (6 cols): Interactive Pill-Bar Portfolio Analytics (Donezo "Project Analytics" style) */}
        <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 font-display">
                Portfolio Velocity Analytics
              </h2>
              <p className="text-[11px] text-slate-500">
                Hover or select any pillar to inspect solid bound vs. hatched projected volume
              </p>
              <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-1">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#0F172A]" />
                  <span>Bound</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span
                    className="w-2 h-2 rounded-full border border-slate-300 bg-slate-100"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(135deg, #94A3B8 0px, #94A3B8 1px, transparent 1px, transparent 3px)',
                    }}
                  />
                  <span>Projected</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#EA580C]" />
                  <span>Active Focus</span>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Metric Switcher */}
              <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-lg">
                {(['written', 'collected', 'earned'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setAnalyticsMetric(m)}
                    className={`px-2 py-1 text-[11px] font-medium rounded-md capitalize transition-colors whitespace-nowrap ${
                      analyticsMetric === m
                        ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* Cadence Switcher */}
              <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setAnalyticsCadence('weekly');
                    setSelectedBarIndex(2);
                  }}
                  className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                    analyticsCadence === 'weekly'
                      ? 'bg-white text-[#EA580C] shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAnalyticsCadence('monthly');
                    setSelectedBarIndex(3);
                  }}
                  className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                    analyticsCadence === 'monthly'
                      ? 'bg-white text-[#EA580C] shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Monthly
                </button>
              </div>
            </div>
          </div>

          {/* Pill-Bar Visual Stage */}
          <div className="pt-6 pb-1 px-2 flex items-end justify-between gap-3 sm:gap-4 h-40">
            {chartBars.map((bar, idx) => {
              const isSelected = idx === selectedBarIndex;
              const solidColorClass = isSelected
                ? 'bg-[#EA580C] shadow-md shadow-orange-500/25'
                : 'bg-[#0F172A] hover:bg-slate-800';

              return (
                <div
                  key={`${bar.shortLabel}-${idx}`}
                  onMouseEnter={() => setSelectedBarIndex(idx)}
                  className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedBarIndex(idx)}
                    onMouseEnter={() => setSelectedBarIndex(idx)}
                    aria-label={`Inspect ${bar.fullLabel}: ${formatCurrency(bar.value)}`}
                    className="w-full max-w-[48px] h-full flex flex-col justify-end items-center relative focus:outline-none cursor-pointer"
                  >
                    {/* Floating callout badge above selected bar */}
                    <AnimatePresence>
                      {isSelected && (
                        <motion.span
                          initial={{ opacity: 0, y: 6, scale: 0.9 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 4, scale: 0.9 }}
                          transition={{ duration: 0.16 }}
                          className="absolute -top-6 px-2 py-0.5 rounded-md bg-slate-900 text-white font-mono text-[10px] font-semibold tabular-nums shadow-xs whitespace-nowrap z-10"
                        >
                          {bar.pctLabel}
                        </motion.span>
                      )}
                    </AnimatePresence>

                    {/* Pill Column */}
                    <motion.div
                      initial={{ height: '25%' }}
                      animate={{ height: `${bar.heightPct}%` }}
                      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                      style={
                        bar.isProjected && !isSelected
                          ? {
                              backgroundImage:
                                'repeating-linear-gradient(135deg, #CBD5E1 0px, #CBD5E1 3px, transparent 3px, transparent 8px)',
                            }
                          : undefined
                      }
                      className={`w-full rounded-full transition-colors relative ${
                        bar.isProjected && !isSelected
                          ? 'border border-slate-300 bg-slate-50 group-hover:border-[#EA580C]'
                          : solidColorClass
                      }`}
                    >
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-white border-2 border-[#EA580C] absolute top-2 left-1/2 -translate-x-1/2" />
                      )}
                    </motion.div>
                  </button>

                  <span
                    className={`mt-2 text-[11px] font-mono transition-colors ${
                      isSelected ? 'font-bold text-[#EA580C]' : 'text-slate-400 group-hover:text-slate-700'
                    }`}
                  >
                    {bar.shortLabel}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Selected Pillar Detail Footer */}
          <div className="mt-2 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-slate-900 whitespace-nowrap">
                {activeBar.fullLabel}
              </span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="text-slate-500 truncate">{activeBar.subMeta}</span>
            </div>
            <div className="font-mono font-bold text-[#EA580C] tabular-nums whitespace-nowrap">
              {formatCurrency(activeBar.value)} {analyticsMetric}
            </div>
          </div>
        </div>

        {/* Col 2 (3 cols): Underwriting Desk Reminders (Donezo "Reminders / Meeting with Arc Company" card) */}
        <div className="lg:col-span-3 bg-white border border-slate-200/90 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-bold text-slate-900 font-display">Reminders</h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setReminderIndex((prev) => (prev - 1 + reminders.length) % reminders.length)
                  }
                  aria-label="Previous reminder"
                  className="p-1 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono text-slate-400 px-1 tabular-nums">
                  {reminderIndex + 1}/{reminders.length}
                </span>
                <button
                  type="button"
                  onClick={() => setReminderIndex((prev) => (prev + 1) % reminders.length)}
                  aria-label="Next reminder"
                  className="p-1 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={currentReminder.id}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.16 }}
                className="space-y-2"
              >
                <h3 className="text-lg font-bold text-slate-900 font-display leading-snug">
                  {currentReminder.title}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {currentReminder.subtitle}
                </p>
                <div className="pt-0.5 flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                  <CalendarClock className="w-3.5 h-3.5 text-[#EA580C] shrink-0" />
                  <span>{currentReminder.timeWindow}</span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="pt-4">
            <button
              type="button"
              onClick={currentReminder.onAction}
              className="w-full py-2.5 px-4 rounded-full bg-gradient-to-r from-[#EA580C] to-[#C2410C] hover:from-[#C2410C] hover:to-[#9A3412] text-white text-xs font-semibold shadow-xs transition-all active:scale-[0.98] flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>{currentReminder.ctaLabel}</span>
            </button>
          </div>
        </div>

        {/* Col 3 (3 cols): Policy & Submission Pipeline (Donezo "Project / + New" list) */}
        <div className="lg:col-span-3 bg-white border border-slate-200/90 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <h2 className="text-sm font-bold text-slate-900 font-display">Policy Pipeline</h2>
              <button
                type="button"
                onClick={() => setIssueModalOpen(true)}
                className="px-2.5 py-1 text-[11px] font-semibold text-slate-800 border border-slate-300 hover:border-[#EA580C] hover:text-[#EA580C] rounded-full transition-colors inline-flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>New</span>
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {pipelinePolicies.map((pol, idx) => {
                const iconColors = [
                  'bg-orange-100 text-[#EA580C]',
                  'bg-sky-100 text-sky-700',
                  'bg-emerald-100 text-emerald-700',
                  'bg-amber-100 text-amber-700',
                  'bg-violet-100 text-violet-700',
                ];
                const IconComp = idx % 2 === 0 ? Layers : idx % 3 === 0 ? Building2 : FileCheck2;
                const canQuickBind = pol.status === 'Pending' || pol.status === 'Draft';

                return (
                  <div
                    key={pol.id}
                    className="py-2 flex items-center justify-between gap-2 group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          iconColors[idx % iconColors.length]
                        }`}
                      >
                        <IconComp className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => navigateTo('policies', pol.id)}
                          className="text-xs font-semibold text-slate-900 hover:text-[#EA580C] truncate block text-left max-w-[140px]"
                        >
                          {pol.customerName}
                        </button>
                        <p className="text-[10px] text-slate-400 font-mono truncate">
                          {pol.policyNumber} · {formatCurrency(pol.writtenPremium)}
                        </p>
                      </div>
                    </div>

                    {canQuickBind ? (
                      <button
                        type="button"
                        onClick={() => bindDraftOrPendingPolicy(pol.id)}
                        className="px-2 py-0.5 text-[11px] font-semibold text-[#EA580C] bg-orange-50 hover:bg-[#EA580C] hover:text-white rounded-md transition-colors shrink-0"
                      >
                        Bind
                      </button>
                    ) : (
                      <span className="text-[11px] font-mono text-slate-400 shrink-0">
                        {pol.status}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-400">In-force + Pipeline</span>
            <button
              type="button"
              onClick={() => navigateTo('policies')}
              className="font-semibold text-[#EA580C] hover:underline"
            >
              Open All ({policies.length})
            </button>
          </div>
        </div>
      </section>

      {/* ROW 3: Bottom 2-Column Bento Grid (Team Collaboration + Semi-Circular Portfolio Progress) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Col 1 (7 cols): Underwriting & Finance Team Collaboration (Donezo "Team Collaboration") */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 font-display">
                  Team Collaboration
                </h2>
                <p className="text-[11px] text-slate-500">
                  Click any status button to update workflow stage
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTaskModalOpen(true)}
                className="px-3 py-1 text-[11px] font-semibold text-slate-800 border border-slate-300 hover:border-[#EA580C] hover:text-[#EA580C] rounded-full transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3 h-3" />
                <span>Assign Task</span>
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {teamTasks.map((task) => {
                const statusColor =
                  task.status === 'Completed'
                    ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                    : task.status === 'In Progress'
                    ? 'text-amber-800 bg-amber-50 hover:bg-amber-100'
                    : 'text-rose-700 bg-rose-50 hover:bg-rose-100';

                return (
                  <div
                    key={task.id}
                    className="py-2 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${task.avatarBg}`}
                      >
                        {task.initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {task.memberName}
                        </p>
                        <button
                          type="button"
                          onClick={() => navigateTo(task.targetTab)}
                          className="text-[11px] text-slate-500 truncate block w-full text-left hover:text-[#EA580C]"
                        >
                          Working on{' '}
                          <span className="font-semibold text-slate-800 hover:underline">
                            {task.taskTitle}
                          </span>
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCycleTaskStatus(task.id)}
                      title="Click to cycle task status"
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors shrink-0 ${statusColor}`}
                    >
                      {task.status}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>Active Underwriting &amp; Controllership Desk</span>
            <span className="font-mono tabular-nums">
              {teamTasks.filter((t) => t.status === 'Completed').length}/{teamTasks.length} completed
            </span>
          </div>
        </div>

        {/* Col 2 (5 cols): Semi-Circular Portfolio Progress Gauge (Donezo "Project Progress 41%" style) */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 font-display">
                Portfolio Progress
              </h2>
              <p className="text-[11px] text-slate-500">
                Pro-rata revenue &amp; settlement gauge
              </p>
            </div>

            <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'earned', label: 'Earned' },
                  { id: 'collection', label: 'Cash' },
                  { id: 'reconciliation', label: 'Rec' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setGaugeMode(tab.id)}
                  className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors ${
                    gaugeMode === tab.id
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Semi-Circular Gauge SVG */}
          <div className="my-1 flex flex-col items-center justify-center relative">
            <svg
              viewBox="0 0 240 135"
              className="w-full max-w-[215px] overflow-visible"
              aria-label={`Portfolio progress gauge showing ${gaugePrimaryPct}% ${gaugeSubtitle}`}
            >
              <defs>
                <pattern
                  id="corgiHatchPattern"
                  width="8"
                  height="8"
                  patternTransform="rotate(45 0 0)"
                  patternUnits="userSpaceOnUse"
                >
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="8"
                    stroke="#CBD5E1"
                    strokeWidth="4"
                  />
                </pattern>
              </defs>

              {/* Background Hatched Track (Represents Pipeline / Pending Segment) */}
              <path
                d="M 24 115 A 96 96 0 0 1 216 115"
                fill="none"
                stroke="url(#corgiHatchPattern)"
                strokeWidth="24"
                strokeLinecap="round"
              />

              {/* Secondary Dark Slate Segment (Earned + Unearned In-Force Book) */}
              <motion.path
                d="M 24 115 A 96 96 0 0 1 216 115"
                fill="none"
                stroke="#0F172A"
                strokeWidth="24"
                strokeLinecap="round"
                strokeDasharray="301.6"
                initial={{ strokeDashoffset: 301.6 }}
                animate={{
                  strokeDashoffset:
                    301.6 *
                    (1 -
                      Math.min(
                        0.92,
                        (progressBreakdown.earnedPct + progressBreakdown.unearnedPct) / 100
                      )),
                }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />

              {/* Primary Corgi Orange Segment (Selected Metric Percentage) */}
              <motion.path
                d="M 24 115 A 96 96 0 0 1 216 115"
                fill="none"
                stroke="#EA580C"
                strokeWidth="24"
                strokeLinecap="round"
                strokeDasharray="301.6"
                initial={{ strokeDashoffset: 301.6 }}
                animate={{
                  strokeDashoffset: 301.6 * (1 - Math.max(0.05, gaugePrimaryPct / 100)),
                }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </svg>

            <div className="-mt-11 text-center">
              <p className="text-3xl font-bold font-mono tabular-nums text-slate-900">
                {gaugePrimaryPct}%
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">{gaugeSubtitle}</p>
            </div>
          </div>

          {/* Interactive Legend Bar */}
          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
            <button
              type="button"
              onClick={() => setGaugeMode('earned')}
              className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900"
            >
              <span className="w-2.5 h-2.5 rounded-xs bg-[#EA580C] inline-block shrink-0" />
              <span>Earned ({progressBreakdown.earnedPct}%)</span>
            </button>
            <button
              type="button"
              onClick={() => setGaugeMode('collection')}
              className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900"
            >
              <span className="w-2.5 h-2.5 rounded-xs bg-[#0F172A] inline-block shrink-0" />
              <span>Unearned ({progressBreakdown.unearnedPct}%)</span>
            </button>
            <button
              type="button"
              onClick={() => setGaugeMode('reconciliation')}
              className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900"
            >
              <span
                className="w-2.5 h-2.5 rounded-xs border border-slate-400 inline-block shrink-0"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(135deg, #94A3B8 0px, #94A3B8 2px, transparent 2px, transparent 4px)',
                }}
              />
              <span>Pipeline ({progressBreakdown.pipelinePct}%)</span>
            </button>
          </div>
        </div>
      </section>

      {/* ROW 4: Interactive Subledger & Policy Activity Inspector */}
      <section className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
            <button
              type="button"
              onClick={() => setActiveBottomTab('policies')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeBottomTab === 'policies'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Recent Policy Activity ({filteredPolicies.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveBottomTab('payments')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeBottomTab === 'payments'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Stripe Sandbox Payments ({filteredPayments.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveBottomTab('distribution')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeBottomTab === 'distribution'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Book Status Distribution
            </button>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            {/* Search Input directly above the table it filters */}
            <div className="relative flex-1 md:w-64 max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Filter policies or payments in table"
                placeholder={
                  activeBottomTab === 'payments'
                    ? 'Filter payments by ID, customer...'
                    : 'Filter policies by #, customer, broker...'
                }
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200/90 rounded-full text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-[#EA580C] focus:bg-white transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear table search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                navigateTo(activeBottomTab === 'payments' ? 'payments' : 'policies')
              }
              className="text-xs font-semibold text-[#EA580C] hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <span>
                {activeBottomTab === 'payments'
                  ? 'Open Full Payments Subledger'
                  : 'Open Full Policy Directory'}
              </span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {activeBottomTab === 'policies' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-6">Policy Number</th>
                  <th className="py-2.5 px-4">Named Insured</th>
                  <th className="py-2.5 px-4">Line of Business</th>
                  <th className="py-2.5 px-4">Broker of Record</th>
                  <th className="py-2.5 px-4 text-right">Written Premium</th>
                  <th className="py-2.5 px-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredPolicies.slice(0, 6).map((pol) => (
                  <tr key={pol.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-6 font-mono font-medium text-slate-900 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => navigateTo('policies', pol.id)}
                        className="text-left hover:text-[#EA580C] hover:underline"
                      >
                        {pol.policyNumber}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-slate-800 font-medium truncate max-w-[200px]">
                      {pol.customerName}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {pol.lineOfBusiness}
                    </td>
                    <td className="py-3 px-4 text-slate-500 truncate max-w-[180px]">
                      {pol.brokerName}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 font-semibold">
                      {formatCurrency(pol.writtenPremium)}
                    </td>
                    <td className="py-3 px-6 whitespace-nowrap">
                      <StatusIndicator status={pol.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeBottomTab === 'payments' && (
          <div className="divide-y divide-slate-200">
            {filteredPayments.slice(0, 6).map((pay) => (
              <div
                key={pay.id}
                className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-900 truncate">
                      {pay.customerName}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className="font-mono text-slate-500">{pay.paymentMethod}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 font-mono">
                    <span>{pay.policyNumber}</span>
                    <span aria-hidden="true">·</span>
                    <span>{pay.stripePaymentIntentId}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDate(pay.createdAt)}</span>
                  </div>
                </div>
                <div className="text-right shrink-0 flex items-center gap-4">
                  <p className="text-xs font-mono font-semibold text-slate-900 tabular-nums">
                    {formatCurrency(pay.amount)}
                  </p>
                  <StatusIndicator status={pay.status} />
                </div>
              </div>
            ))}
          </div>
        )}

        {activeBottomTab === 'distribution' && (
          <div className="p-6 grid grid-cols-1 sm:grid-cols-5 gap-4">
            {statusDistribution.map((row) => {
              const pct =
                policies.length > 0 ? Math.round((row.count / policies.length) * 100) : 0;
              return (
                <div
                  key={row.status}
                  className="p-4 border border-slate-200 rounded-xl flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between">
                    <StatusIndicator status={row.status} />
                    <span className="text-xs font-mono text-slate-400 tabular-nums">
                      {pct}%
                    </span>
                  </div>
                  <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-3">
                    {row.count}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 mt-1 tabular-nums">
                    {formatCurrency(row.premium)} written
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Quick Action Modal 1: Issue Policy */}
      <Modal
        isOpen={issueModalOpen}
        onClose={() => setIssueModalOpen(false)}
        title="Issue Commercial Insurance Policy"
        subtitle="Binds coverage immediately and posts initial double-entry unearned premium journal."
      >
        <form onSubmit={handleIssuePolicySubmit} className="space-y-4">
          <div>
            <label htmlFor="dash-customer-name" className="block text-xs font-medium text-slate-700 mb-1">
              Named Insured / Legal Entity Name
            </label>
            <input
              id="dash-customer-name"
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g., Sierra Autonomous Freight Systems Inc."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/25 focus:border-[#EA580C]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="dash-lob" className="block text-xs font-medium text-slate-700 mb-1">
                Line of Business
              </label>
              <select
                id="dash-lob"
                value={lineOfBusiness}
                onChange={(e) => setLineOfBusiness(e.target.value as Policy['lineOfBusiness'])}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="Commercial General Liability">Commercial General Liability</option>
                <option value="Cyber & Tech E&O">Cyber & Tech E&O</option>
                <option value="Commercial Property">Commercial Property</option>
                <option value="Workers Compensation">Workers Compensation</option>
                <option value="Directors & Officers">Directors & Officers</option>
              </select>
            </div>

            <div>
              <label htmlFor="dash-broker" className="block text-xs font-medium text-slate-700 mb-1">
                Producer / Broker of Record
              </label>
              <select
                id="dash-broker"
                value={brokerId}
                onChange={(e) => setBrokerId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {brokers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.agencyName} ({b.kybStatus} KYB)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="dash-premium" className="block text-xs font-medium text-slate-700 mb-1">
                Annual Written Premium ($)
              </label>
              <input
                id="dash-premium"
                type="number"
                value={writtenPremium}
                onChange={(e) => setWrittenPremium(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="dash-limit" className="block text-xs font-medium text-slate-700 mb-1">
                Aggregate Limit ($)
              </label>
              <input
                id="dash-limit"
                type="number"
                value={aggregateLimit}
                onChange={(e) => setAggregateLimit(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="dash-deductible" className="block text-xs font-medium text-slate-700 mb-1">
                Deductible ($)
              </label>
              <input
                id="dash-deductible"
                type="number"
                value={deductible}
                onChange={(e) => setDeductible(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label htmlFor="dash-industry" className="block text-xs font-medium text-slate-700 mb-1">
              Industry Classification
            </label>
            <input
              id="dash-industry"
              type="text"
              value={customerIndustry}
              onChange={(e) => setCustomerIndustry(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          {issueError && <p className="text-xs text-red-600 font-medium">{issueError}</p>}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIssueModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg"
            >
              Bind & Issue Policy
            </button>
          </div>
        </form>
      </Modal>

      {/* Quick Action Modal 2: Create Endorsement */}
      <Modal
        isOpen={endorseModalOpen}
        onClose={() => setEndorseModalOpen(false)}
        title="Create Policy Endorsement"
        subtitle="Applies mid-term coverage modification and books pro-rata premium delta."
      >
        <form onSubmit={handleEndorseSubmit} className="space-y-4">
          <div>
            <label htmlFor="dash-endorse-policy" className="block text-xs font-medium text-slate-700 mb-1">
              Select Active Policy
            </label>
            <select
              id="dash-endorse-policy"
              value={endorsePolicyId}
              onChange={(e) => setEndorsePolicyId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {activePolicies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.policyNumber} — {p.customerName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="dash-endorse-delta" className="block text-xs font-medium text-slate-700 mb-1">
              Pro-Rata Premium Change ($, positive or negative)
            </label>
            <input
              id="dash-endorse-delta"
              type="number"
              value={endorseDelta}
              onChange={(e) => setEndorseDelta(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="dash-endorse-desc" className="block text-xs font-medium text-slate-700 mb-1">
              Endorsement Schedule Description
            </label>
            <textarea
              id="dash-endorse-desc"
              rows={3}
              value={endorseDesc}
              onChange={(e) => setEndorseDesc(e.target.value)}
              placeholder="e.g., Added Austin distribution center and increased equipment breakdown sub-limit by $250,000."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          {endorseError && <p className="text-xs text-red-600 font-medium">{endorseError}</p>}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setEndorseModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg"
            >
              Bind Endorsement
            </button>
          </div>
        </form>
      </Modal>

      {/* Quick Action Modal 3: Open Claim */}
      <Modal
        isOpen={claimModalOpen}
        onClose={() => setClaimModalOpen(false)}
        title="Open New Commercial Claim (FNOL)"
        subtitle="Validates claimed amount against policy coverage limit and establishes initial case reserve."
      >
        <form onSubmit={handleOpenClaimSubmit} className="space-y-4">
          <div>
            <label htmlFor="dash-claim-policy" className="block text-xs font-medium text-slate-700 mb-1">
              Policy Reference
            </label>
            <select
              id="dash-claim-policy"
              value={claimPolicyId}
              onChange={(e) => setClaimPolicyId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {activePolicies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.policyNumber} — {p.customerName} (Limit: {formatCurrency(p.aggregateCoverageLimit)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="dash-claim-date" className="block text-xs font-medium text-slate-700 mb-1">
                Date of Loss
              </label>
              <input
                id="dash-claim-date"
                type="date"
                value={claimLossDate}
                onChange={(e) => setClaimLossDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="dash-claim-amount" className="block text-xs font-medium text-slate-700 mb-1">
                Claimed Amount ($)
              </label>
              <input
                id="dash-claim-amount"
                type="number"
                value={claimedAmount}
                onChange={(e) => setClaimedAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="dash-claim-reserve" className="block text-xs font-medium text-slate-700 mb-1">
                Initial Case Reserve ($)
              </label>
              <input
                id="dash-claim-reserve"
                type="number"
                value={initialReserve}
                onChange={(e) => setInitialReserve(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label htmlFor="dash-claim-desc" className="block text-xs font-medium text-slate-700 mb-1">
              Loss Description & Cause
            </label>
            <textarea
              id="dash-claim-desc"
              rows={3}
              value={claimDesc}
              onChange={(e) => setClaimDesc(e.target.value)}
              placeholder="Describe the incident, location, and preliminary loss estimate..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          {claimError && (
            <p role="alert" className="text-xs text-red-600 font-medium">
              {claimError}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setClaimModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg"
            >
              Register Claim & Post Reserve
            </button>
          </div>
        </form>
      </Modal>

      {/* Quick Action Modal 4: Assign Team Collaboration Task */}
      <Modal
        isOpen={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        title="Assign Underwriting or Finance Task"
        subtitle="Adds a tracked operational task to the Corgi Team Collaboration desk."
      >
        <form onSubmit={handleAddTeamTask} className="space-y-4">
          <div>
            <label htmlFor="dash-task-member" className="block text-xs font-medium text-slate-700 mb-1">
              Assign To Specialist
            </label>
            <select
              id="dash-task-member"
              value={newTaskMember}
              onChange={(e) => setNewTaskMember(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="Alex Rivera">Alex Rivera (Operations Admin)</option>
              <option value="Sarah Chen, CPA">Sarah Chen, CPA (Finance Approver)</option>
              <option value="Elena Rostova">Elena Rostova (Lead Underwriter)</option>
              <option value="Claire Beaumont">Claire Beaumont (Claims Adjuster)</option>
            </select>
          </div>

          <div>
            <label htmlFor="dash-task-title" className="block text-xs font-medium text-slate-700 mb-1">
              Task / Deliverable Description
            </label>
            <input
              id="dash-task-title"
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="e.g., Verify SOC2 Type II endorsement schedule for Vanguard Cloud"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="dash-task-ref" className="block text-xs font-medium text-slate-700 mb-1">
              Related Policy / Claim Reference
            </label>
            <input
              id="dash-task-ref"
              type="text"
              value={newTaskRef}
              onChange={(e) => setNewTaskRef(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setTaskModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg inline-flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Assign Task</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
