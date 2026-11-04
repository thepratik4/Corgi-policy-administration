'use client';

import React, { useState } from 'react';
import { usePolicyAdmin } from '../services/policyAdminStore';
import { NavigationTab, UserRole } from '../types/domain';
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
  UserCheck,
  Shield,
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

  const handleToggleRole = () => {
    if (!currentUser) return;
    const nextRole: UserRole =
      currentUser.role === 'OPERATIONS_ADMIN' ? 'FINANCE_APPROVER' : 'OPERATIONS_ADMIN';
    switchRole(nextRole);
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

        {/* Corgi Statutory Audit Pack Card (Matches Reference Sidebar Promo Card) */}
        <div className="px-3 pb-3">
          <div className="rounded-2xl bg-[#0F172A] text-white p-4 relative overflow-hidden">
            <svg
              aria-hidden="true"
              className="absolute -right-6 -bottom-6 w-28 h-28 text-[#EA580C]/25 pointer-events-none"
              viewBox="0 0 100 100"
              fill="none"
            >
              <circle cx="65" cy="65" r="42" stroke="currentColor" strokeWidth="8" />
              <circle cx="65" cy="65" r="24" stroke="currentColor" strokeWidth="6" />
            </svg>
            <p className="text-xs font-bold font-display text-white relative z-10">
              Statutory Audit Pack
            </p>
            <p className="text-[11px] text-slate-300 mt-0.5 leading-snug relative z-10">
              NAIC &amp; GAAP subledger trial balance schedule
            </p>
            <button
              type="button"
              onClick={() => navigateTo('ledger')}
              className="mt-3 w-full py-1.5 px-3 rounded-full bg-gradient-to-r from-[#EA580C] to-[#C2410C] hover:from-[#C2410C] hover:to-[#9A3412] text-white text-[11px] font-semibold transition-all relative z-10"
            >
              Open Ledger Schedule
            </button>
          </div>
        </div>

        {/* Active User & Demo Role Switcher Footer */}
        {currentUser && (
          <div className="p-4 border-t border-slate-200 bg-slate-50/60 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                  {currentUser.avatarInitials}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">
                    {currentUser.name}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {currentUser.roleLabel}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={logout}
                aria-label="Sign out of demo session"
                title="Sign out"
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            <div className="pt-2 border-t border-slate-200/80">
              <p className="text-[11px] text-slate-500 mb-1.5">
                Active Demo Role
              </p>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-200/70 rounded-lg">
                <button
                  type="button"
                  onClick={() => switchRole('OPERATIONS_ADMIN')}
                  className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap truncate ${
                    currentUser.role === 'OPERATIONS_ADMIN'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Ops Admin
                </button>
                <button
                  type="button"
                  onClick={() => switchRole('FINANCE_APPROVER')}
                  className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap truncate ${
                    currentUser.role === 'FINANCE_APPROVER'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Finance Approver
                </button>
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
        {/* Top Navigation Bar (Strict 3-Zone SaaS Contract: Breadcrumb — Quick Nav — Primary Role Switch CTA) */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-8 sticky top-0 z-20">
          {/* Zone 1: Mobile Menu Trigger + Breadcrumb */}
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm whitespace-nowrap">
              <span className="text-slate-500 hidden sm:inline">Corgi Commercial</span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">/</span>
              <span className="font-semibold text-slate-900 font-display">
                {activeNavObj.label}
              </span>
            </div>
          </div>

          {/* Zone 2: Concise Single-Line Workspace Jump Links */}
          <nav
            aria-label="Quick Workspace Links"
            className="hidden xl:flex items-center gap-6 text-xs font-medium text-slate-600"
          >
            <button
              type="button"
              onClick={() => handleNavClick('policies')}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Policy Book
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('claims')}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Claims & Reserves
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('ledger')}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Double-Entry Ledger
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('approvals')}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Approvals ({pendingApprovalsCount})
            </button>
          </nav>

          {/* Zone 3: Single Primary Role Action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleToggleRole}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200/80 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {currentUser?.role === 'FINANCE_APPROVER' ? (
                <Shield className="w-3.5 h-3.5 text-[#EA580C]" />
              ) : (
                <UserCheck className="w-3.5 h-3.5 text-[#EA580C]" />
              )}
              <span>
                {currentUser?.roleLabel} · Switch Role
              </span>
            </button>
          </div>
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
