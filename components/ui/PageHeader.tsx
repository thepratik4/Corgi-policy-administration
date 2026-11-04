'use client';

import React from 'react';

interface PageHeaderProps {
  kicker?: string;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}

export function PageHeader({ kicker, title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
      <div>
        {kicker && (
          <p className="text-xs font-medium text-slate-500 mb-1">{kicker}</p>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-display">
          {title}
        </h1>
        <p className="text-sm text-slate-600 mt-1">{subtitle}</p>
      </div>
      {actions && <div className="flex items-center gap-2.5 shrink-0">{actions}</div>}
    </div>
  );
}
