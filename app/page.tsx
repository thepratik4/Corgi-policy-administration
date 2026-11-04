'use client';

import React, { useEffect } from 'react';
import { PolicyAdminProvider, usePolicyAdmin } from '../services/policyAdminStore';
import { AppShell } from '../layouts/AppShell';
import { LoginView } from '../features/auth/LoginView';
import { DashboardView } from '../features/dashboard/DashboardView';
import { PoliciesView } from '../features/policies/PoliciesView';
import { BrokersView } from '../features/brokers/BrokersView';
import { PaymentsView } from '../features/payments/PaymentsView';
import { ClaimsView } from '../features/claims/ClaimsView';
import { LedgerView } from '../features/ledger/LedgerView';
import { ReconciliationView } from '../features/reconciliation/ReconciliationView';
import { ApprovalsView } from '../features/approvals/ApprovalsView';
import { DocumentsView } from '../features/documents/DocumentsView';

function WorkspaceRouter() {
  const { currentUser, activeTab, loginAsRole } = usePolicyAdmin();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1' && !currentUser) {
        loginAsRole('OPERATIONS_ADMIN');
      }
    }
  }, [currentUser, loginAsRole]);

  if (!currentUser) {
    return <LoginView />;
  }

  return (
    <AppShell>
      {activeTab === 'dashboard' && <DashboardView />}
      {activeTab === 'policies' && <PoliciesView />}
      {activeTab === 'brokers' && <BrokersView />}
      {activeTab === 'payments' && <PaymentsView />}
      {activeTab === 'claims' && <ClaimsView />}
      {activeTab === 'ledger' && <LedgerView />}
      {activeTab === 'reconciliation' && <ReconciliationView />}
      {activeTab === 'approvals' && <ApprovalsView />}
      {activeTab === 'documents' && <DocumentsView />}
    </AppShell>
  );
}

export default function HomePage() {
  return (
    <PolicyAdminProvider>
      <WorkspaceRouter />
    </PolicyAdminProvider>
  );
}
