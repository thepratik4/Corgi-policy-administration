'use client';

import React, { useState } from 'react';
import { usePolicyAdmin } from '../services/policyAdminStore';
import { NavigationTab } from '../types/domain';
import {
  LayoutDashboard,
  FileText,
  Building2,
  CreditCard,
  ShieldAlert,
  BookOpen,
  Scale,
  CheckSquare,
  FolderOpen,
  LogOut,
  Menu,
  X,
} from 'lucide-react';

const NAV_ITEMS: {
  id: NavigationTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: 'Core Operations' | 'Financial Accounting';
}[] = [
  { id: 'dashboard', label: 'Operations Dashboard', icon: LayoutDashboard, group: 'Core Operations' },
  { id: 'policies', label: 'Policies', icon: FileText, group: 'Core Operations' },
  { id: 'brokers', label: 'Brokers & KYB', icon: Building2, group: 'Core Operations' },
  { id: 'claims', label: 'Claims & Reserves', icon: ShieldAlert, group: 'Core Operations' },
  { id: 'documents', label: 'Documents', icon: FolderOpen, group: 'Core Operations' },
  { id: 'payments', label: 'Payments', icon: CreditCard, group: 'Financial Accounting' },
  { id: 'ledger', label: 'Financial Ledger', icon: BookOpen, group: 'Financial Accounting' },
  { id: 'reconciliation', label: 'Reconciliation', icon: Scale, group: 'Financial Accounting' },
  { id: 'approvals', label: 'Approval Queue', icon: CheckSquare, group: 'Financial Accounting' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const {
    currentUser,
    activeTab,
    navigateTo,
    switchRole,
    logout,
    approvalRequests,
    reconciliationItems,
    toasts,
    dismissToast,
  } = usePolicyAdmin();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const pendingApprovalsCount = approvalRequests.filter((r) => r.status === 'Pending').length;
  const openBreaksCount = reconciliationItems.filter((r) => r.matchStatus !== 'Matched').length;

  const activeNavObj = NAV_ITEMS.find((n) => n.id === activeTab) || NAV_ITEMS[0];

  const handleNavClick = (tab: NavigationTab) => {
    navigateTo(tab, null);
    setMobileMenuOpen(false);
  };


  return (
    <div className="min-h-screen flex bg-[#F8FAFC] text-[#0F172A]">
      {/* Persistent Left Sidebar (Desktop) */}
      <aside
        aria-label="Primary Sidebar Navigation"
        className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 select-none z-30"
      >
        {/* Brand Wordmark */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
          <button
            type="button"
            onClick={() => handleNavClick('dashboard')}
            className="flex items-center gap-2.5 text-left focus:outline-none"
          >
            <div className="w-8 h-8 rounded-lg bg-[#EA580C] flex items-center justify-center text-white font-display font-bold text-base shadow-xs">
              C
            </div>
            <div>
              <span className="block text-base font-bold tracking-tight text-slate-900 font-display leading-none">
                Corgi
              </span>
              <span className="block text-[11px] text-slate-500 mt-0.5 leading-none">
                Policy Administration
              </span>
            </div>
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-5 space-y-6 overflow-y-auto">
          {(['Core Operations', 'Financial Accounting'] as const).map((group) => (
            <div key={group}>
              <div className="px-3 mb-2 text-[11px] font-semibold text-slate-400 tracking-wide">
                {group}
              </div>
              <div className="space-y-1">
                {NAV_ITEMS.filter((item) => item.group === group).map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  const count =
                    item.id === 'approvals'
                      ? pendingApprovalsCount
                      : item.id === 'reconciliation'
                      ? openBreaksCount
                      : 0;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                        isActive
                          ? 'bg-orange-50/90 text-[#EA580C] font-semibold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 truncate">
                        <Icon
                          className={`w-4 h-4 shrink-0 ${
                            isActive ? 'text-[#EA580C]' : 'text-slate-400'
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {count > 0 && (
                        <span className="font-mono text-[11px] tabular-nums text-slate-500">
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>


        {/* Active User & Demo Role Switcher Card (Styled with Dark Corgi Aesthetic) */}
        {currentUser && (
          <div className="p-3 border-t border-slate-200">
            <div className="rounded-2xl bg-[#0F172A] text-white p-3.5 relative overflow-hidden shadow-sm">
              <svg
                aria-hidden="true"
                className="absolute -right-6 -bottom-6 w-28 h-28 text-[#EA580C]/20 pointer-events-none"
                viewBox="0 0 100 100"
                fill="none"
              >
                <circle cx="65" cy="65" r="42" stroke="currentColor" strokeWidth="8" />
                <circle cx="65" cy="65" r="24" stroke="currentColor" strokeWidth="6" />
              </svg>

              {/* User Header */}
              <div className="flex items-center justify-between gap-2 relative z-10">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center ring-1 ring-white/10 shrink-0">
                    {currentUser.avatarInitials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate font-display">
                      {currentUser.name}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {currentUser.roleLabel}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  aria-label="Sign out of demo session"
                  title="Sign out"
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Demo Role Switcher Controls */}
              <div className="pt-2.5 mt-2.5 border-t border-white/10 relative z-10">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Active Demo Role
                </p>
                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900/90 rounded-xl border border-white/5">
                  <button
                    type="button"
                    onClick={() => switchRole('OPERATIONS_ADMIN')}
                    className={`px-2 py-1.5 text-[11px] font-semibold rounded-lg transition-all whitespace-nowrap text-center ${
                      currentUser.role === 'OPERATIONS_ADMIN'
                        ? 'bg-[#EA580C] text-white shadow-xs'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    Ops Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => switchRole('FINANCE_APPROVER')}
                    title="Finance Approver"
                    className={`px-2 py-1.5 text-[11px] font-semibold rounded-lg transition-all whitespace-nowrap text-center ${
                      currentUser.role === 'FINANCE_APPROVER'
                        ? 'bg-[#EA580C] text-white shadow-xs'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    Fin Approver
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col z-10 border-r border-slate-200">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
              <span className="text-base font-bold text-slate-900 font-display">
                Corgi Policy Admin
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium ${
                      isActive
                        ? 'bg-orange-50 text-[#EA580C] font-semibold'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0">
        {/* Mobile Header (Accessible navigation drawer on small screens) */}
        <header className="lg:hidden h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between sticky top-0 z-20">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
            className="p-2 text-slate-600 hover:text-slate-900 rounded-lg"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold text-slate-900 font-display">
            {activeNavObj.label}
          </span>
          <div className="w-9" />
        </header>

        {/* Page Viewport */}
        <main className="flex-1 p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Toast Notification Stack */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className="pointer-events-auto bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg border border-slate-800 flex items-start justify-between gap-3"
            >
              <div>
                <p className="text-xs font-semibold text-white">{t.title}</p>
                {t.description && (
                  <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                    {t.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss notification"
                className="text-slate-400 hover:text-white p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
