import React from 'react';
import { ConsignmentRecord, ValidationStatus } from '../types';

interface StatsProps {
  records: ConsignmentRecord[];
}

export const Stats: React.FC<StatsProps> = ({ records }) => {
  const total = records.length;
  const valid = records.filter(r => r.status === ValidationStatus.VALID).length;
  const invalid = records.filter(r => r.status !== ValidationStatus.VALID).length;
  
  const totalAmount = records
    .filter(r => r.status === ValidationStatus.VALID)
    .reduce((sum, r) => sum + (r.amount || 0), 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <p className="text-sm font-medium text-gray-500">Total Procesados</p>
        <p className="text-2xl font-bold text-gray-900">{total}</p>
      </div>
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <p className="text-sm font-medium text-gray-500">Válidos</p>
        <div className="flex items-end gap-2">
            <p className="text-2xl font-bold text-green-600">{valid}</p>
            <span className="text-xs text-gray-400 mb-1">registros</span>
        </div>
      </div>
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <p className="text-sm font-medium text-gray-500">Monto Total Aprobado</p>
        <p className="text-2xl font-bold text-brand-600">
          {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(totalAmount)}
        </p>
      </div>
    </div>
  );
};