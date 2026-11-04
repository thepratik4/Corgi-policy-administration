'use client';

import React, { useState } from 'react';
import { usePolicyAdmin } from '../../services/policyAdminStore';
import { Eye, EyeOff, ShieldCheck, UserCheck, Lock, ArrowRight } from 'lucide-react';

export function LoginView() {
  const { loginAsRole, loginWithEmail } = usePolicyAdmin();
  const [email, setEmail] = useState('alex.rivera@corgi.insure');
  const [password, setPassword] = useState('corgi-ops-sandbox-2026');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRolePreset, setSelectedRolePreset] = useState<'OPERATIONS_ADMIN' | 'FINANCE_APPROVER'>('OPERATIONS_ADMIN');
  const [error, setError] = useState('');
  const [imgError, setImgError] = useState(false);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter both your Corgi work email and password.');
      return;
    }
    setError('');
    loginWithEmail(email, selectedRolePreset);
  };

  const handleSelectDemoPreset = (role: 'OPERATIONS_ADMIN' | 'FINANCE_APPROVER') => {
    setSelectedRolePreset(role);
    if (role === 'OPERATIONS_ADMIN') {
      setEmail('alex.rivera@corgi.insure');
      setPassword('corgi-ops-sandbox-2026');
    } else {
      setEmail('sarah.chen@corgi.insure');
      setPassword('corgi-fin-approver-2026');
    }
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F8FAFC] to-[#EFF6FF] flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl w-full mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
        {/* Left Column: Brand & Hero Visual */}
        <div className="lg:col-span-6 bg-[#F0F7FF] p-8 lg:p-10 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-200">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#EA580C] flex items-center justify-center text-white font-display font-bold text-lg">
                C
              </div>
              <div>
                <span className="block text-lg font-bold tracking-tight text-slate-900 font-display leading-none">
                  Corgi
                </span>
                <span className="block text-xs text-slate-600 mt-0.5">
                  Commercial Insurance Technology
                </span>
              </div>
            </div>

            <h1 className="mt-6 text-2xl sm:text-3xl font-bold text-slate-900 font-display tracking-tight leading-snug">
              Commercial Policy Administration & Financial Subledger
            </h1>
            <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
              Unified underwriting bind operations, mid-term endorsements, claims reserve tracking, and immutable double-entry accounting.
            </p>
          </div>

          <div className="my-6 rounded-xl overflow-hidden border border-slate-200/80 bg-white shadow-2xs">
            {!imgError ? (
              <img
                src="/images/corgi-hero.png"
                alt="Corgi Commercial Insurance Policy Administration Illustration"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full h-56 sm:h-64 object-cover object-center"
              />
            ) : (
              <div className="w-full h-56 sm:h-64 bg-slate-100 flex flex-col items-center justify-center p-6 text-center">
                <ShieldCheck className="w-10 h-10 text-[#EA580C] mb-2" />
                <p className="text-sm font-semibold text-slate-800">
                  Corgi Commercial Insurance Platform
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Policy Administration · Claims · Ledger Reconciliation
                </p>
              </div>
            )}
          </div>

          <div className="text-xs text-slate-600 space-y-1 pt-2 border-t border-slate-200/70">
            <p className="font-medium text-slate-800">
              Architecture & Security Separation Notice
            </p>
            <p className="text-slate-500 leading-relaxed">
              This frontend workspace uses isolated client-side demo session profiles. Production authentication will enforce OIDC/SSO + MFA via the Express + PostgreSQL backend.
            </p>
          </div>
        </div>

        {/* Right Column: Login Form & Demo Role Selector */}
        <div className="lg:col-span-6 p-8 lg:p-10 flex flex-col justify-between bg-white">
          <div>
            <div className="mb-6">
              <p className="text-xs font-medium text-[#EA580C] mb-1">
                Policy Administration Portal
              </p>
              <h2 className="text-xl font-bold text-slate-900 font-display">
                Sign in to your workspace
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Use the credentials form or launch directly with a one-click role profile below.
              </p>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Work Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@corgi.insure"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/25 focus:border-[#EA580C]"
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-3.5 pr-10 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/25 focus:border-[#EA580C]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-700"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <p role="alert" className="text-xs text-red-600 font-medium">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-[#EA580C] hover:bg-[#C2410C] text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-2xs"
              >
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Demo Authentication Section (Clearly Separated) */}
            <div className="mt-8 pt-6 border-t border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-800">
                  Instant Demo Login Profiles (Frontend Phase)
                </span>
                <span className="text-[11px] text-slate-500">
                  Sandbox Auth Only
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    handleSelectDemoPreset('OPERATIONS_ADMIN');
                    loginAsRole('OPERATIONS_ADMIN');
                  }}
                  className="p-3.5 text-left rounded-xl border border-slate-200 hover:border-[#EA580C] hover:bg-orange-50/30 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900 group-hover:text-[#EA580C]">
                      Operations Admin
                    </span>
                    <UserCheck className="w-4 h-4 text-slate-400 group-hover:text-[#EA580C]" />
                  </div>
                  <p className="text-xs text-slate-600 mt-1 font-mono">
                    alex.rivera@corgi.insure
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Issue policies, bind endorsements, open claims, initiate refunds
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSelectDemoPreset('FINANCE_APPROVER');
                    loginAsRole('FINANCE_APPROVER');
                  }}
                  className="p-3.5 text-left rounded-xl border border-slate-200 hover:border-[#EA580C] hover:bg-orange-50/30 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900 group-hover:text-[#EA580C]">
                      Finance Approver
                    </span>
                    <ShieldCheck className="w-4 h-4 text-slate-400 group-hover:text-[#EA580C]" />
                  </div>
                  <p className="text-xs text-slate-600 mt-1 font-mono">
                    sarah.chen@corgi.insure
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Approve queue requests, reverse/rebook ledger entries, resolve breaks
                  </p>
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>Demo Authentication · No Production Credentials Required</span>
            </span>
            <span>Corgi Insurance Services</span>
          </div>
        </div>
      </div>
    </div>
  );
}
