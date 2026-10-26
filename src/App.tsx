import type { ReactNode } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { MachineStatusProvider } from "./lib/machineStatus";
import { MonitoringSync } from "./lib/monitoringSync";
import { RouteMemory } from "./lib/routeMemory";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Sales from "./pages/Sales";
import OrderForm from "./pages/OrderForm";
import OrderDetail from "./pages/OrderDetail";
import Inventory from "./pages/Inventory";
import InventoryItemDetail from "./pages/InventoryItemDetail";
import InventoryItemForm from "./pages/InventoryItemForm";
import InventoryPurchases from "./pages/InventoryPurchases";
import InventoryPurchaseDetail from "./pages/InventoryPurchaseDetail";
import InventoryPurchaseEditForm from "./pages/InventoryPurchaseEditForm";
import RestockForm from "./pages/RestockForm";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import CustomerForm from "./pages/CustomerForm";
import LoyaltySettings from "./pages/LoyaltySettings";
import LoyaltyRedemptions from "./pages/LoyaltyRedemptions";
import ServicePackages from "./pages/ServicePackages";
import ServicePackageDetail from "./pages/ServicePackageDetail";
import ServicePackageForm from "./pages/ServicePackageForm";
import Services from "./pages/Services";
import ServiceForm from "./pages/ServiceForm";
import AddOns from "./pages/AddOns";
import AddOnForm from "./pages/AddOnForm";
import Promos from "./pages/Promos";
import PromoForm from "./pages/PromoForm";
import Expenses from "./pages/Expenses";
import ExpenseForm from "./pages/ExpenseForm";
import ExpenseDetail from "./pages/ExpenseDetail";
import Cashflow from "./pages/Cashflow";
import CashAdjustmentForm from "./pages/CashAdjustmentForm";
import CashAdjustmentDetail from "./pages/CashAdjustmentDetail";
import Employees from "./pages/Employees";
import EmployeeForm from "./pages/EmployeeForm";
import Attendance from "./pages/Attendance";
import AttendanceEntry from "./pages/AttendanceEntry";
import AttendanceDtr from "./pages/AttendanceDtr";
import CashAdvances from "./pages/CashAdvances";
import CashAdvanceForm from "./pages/CashAdvanceForm";
import Deductions from "./pages/Deductions";
import DeductionWorkerDetail from "./pages/DeductionWorkerDetail";
import DeductionTypes from "./pages/DeductionTypes";
import DeductionTypeForm from "./pages/DeductionTypeForm";
import Payroll from "./pages/Payroll";
import PayrollRunForm from "./pages/PayrollRunForm";
import PayrollRunDetail from "./pages/PayrollRunDetail";
import PayrollDtr from "./pages/PayrollDtr";
import PayslipDetail from "./pages/PayslipDetail";
import PayrollSettings from "./pages/PayrollSettings";
import Reports from "./pages/Reports";
import ReportExpenseCategories from "./pages/ReportExpenseCategories";
import ReportCashflowSource from "./pages/ReportCashflowSource";
import ReportServiceRevenue from "./pages/ReportServiceRevenue";
import ReportOrderStatus from "./pages/ReportOrderStatus";
import ReportUnpaidOrders from "./pages/ReportUnpaidOrders";
import ReportAttendance from "./pages/ReportAttendance";
import ReportOvertime from "./pages/ReportOvertime";
import ReportGovernmentDeductions from "./pages/ReportGovernmentDeductions";
import ReportTopCustomers from "./pages/ReportTopCustomers";
import ReportCustomerRetention from "./pages/ReportCustomerRetention";
import ReportPromoEffectiveness from "./pages/ReportPromoEffectiveness";
import ReportLoyaltyPoints from "./pages/ReportLoyaltyPoints";
import ReportRestockSpend from "./pages/ReportRestockSpend";
import ReportWaste from "./pages/ReportWaste";
import ReportItemUsage from "./pages/ReportItemUsage";
import ReportBusiestHours from "./pages/ReportBusiestHours";
import ReportExpenseTrend from "./pages/ReportExpenseTrend";
import ReportLoadVerification from "./pages/ReportLoadVerification";
import Settings from "./pages/Settings";
import Users from "./pages/Users";
import UserForm from "./pages/UserForm";
import RolePermissionsForm from "./pages/RolePermissionsForm";
import PrinterSettings from "./pages/PrinterSettings";
import Machines from "./pages/Machines";
import MachineStatus from "./pages/MachineStatus";
import BranchForm from "./pages/BranchForm";
import ScPwdDiscountSettings from "./pages/ScPwdDiscountSettings";
import AuditViewSettings from "./pages/AuditViewSettings";
import OnlineMonitoringSettings from "./pages/OnlineMonitoringSettings";
import OrSeries from "./pages/OrSeries";
import OrSeriesForm from "./pages/OrSeriesForm";
import OrSeriesDetail from "./pages/OrSeriesDetail";
import ZReading from "./pages/ZReading";
import Backup from "./pages/Backup";
import "./App.css";

function Protected({ pageKey, children }: { pageKey: string; children: ReactNode }) {
  const { hasAccess } = useAuth();
  if (!hasAccess(pageKey)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function OwnerOnly({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  if (currentUser?.role !== "owner") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function App() {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-page">
        <p className="text-sm text-ink/40">Loading…</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Login />;
  }

  return (
    <MachineStatusProvider>
    <MonitoringSync />
    <HashRouter>
      <RouteMemory />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />

          <Route path="sales" element={<Protected pageKey="sales"><Sales /></Protected>} />
          <Route path="sales/new" element={<Protected pageKey="sales"><OrderForm /></Protected>} />
          <Route path="sales/:id" element={<Protected pageKey="sales"><OrderDetail /></Protected>} />

          <Route path="inventory" element={<Protected pageKey="inventory"><Inventory /></Protected>} />
          <Route path="inventory/new" element={<Protected pageKey="inventory"><InventoryItemForm /></Protected>} />
          <Route path="inventory/restock" element={<Protected pageKey="inventory"><RestockForm /></Protected>} />
          <Route path="inventory/purchases" element={<Protected pageKey="inventory"><InventoryPurchases /></Protected>} />
          <Route path="inventory/purchases/:id" element={<Protected pageKey="inventory"><InventoryPurchaseDetail /></Protected>} />
          <Route
            path="inventory/purchases/:id/edit"
            element={<Protected pageKey="restock_edit"><InventoryPurchaseEditForm /></Protected>}
          />
          <Route path="inventory/:id" element={<Protected pageKey="inventory"><InventoryItemDetail /></Protected>} />
          <Route path="inventory/:id/edit" element={<Protected pageKey="inventory"><InventoryItemForm /></Protected>} />

          <Route path="customers" element={<Protected pageKey="customers"><Customers /></Protected>} />
          <Route path="customers/new" element={<Protected pageKey="customers"><CustomerForm /></Protected>} />
          <Route path="customers/:id" element={<Protected pageKey="customers"><CustomerDetail /></Protected>} />
          <Route path="customers/:id/edit" element={<Protected pageKey="customers"><CustomerForm /></Protected>} />
          <Route path="loyalty-settings" element={<Protected pageKey="customers"><LoyaltySettings /></Protected>} />
          <Route path="loyalty-redemptions" element={<Protected pageKey="customers"><LoyaltyRedemptions /></Protected>} />

          <Route path="packages" element={<Protected pageKey="packages"><ServicePackages /></Protected>} />
          <Route path="packages/new" element={<Protected pageKey="packages"><ServicePackageForm /></Protected>} />
          <Route path="packages/:id" element={<Protected pageKey="packages"><ServicePackageDetail /></Protected>} />
          <Route path="packages/:id/edit" element={<Protected pageKey="packages"><ServicePackageForm /></Protected>} />

          <Route path="services" element={<Protected pageKey="services"><Services /></Protected>} />
          <Route path="services/new" element={<Protected pageKey="services"><ServiceForm /></Protected>} />
          <Route path="services/:id/edit" element={<Protected pageKey="services"><ServiceForm /></Protected>} />

          <Route path="addons" element={<Protected pageKey="addons"><AddOns /></Protected>} />
          <Route path="addons/new" element={<Protected pageKey="addons"><AddOnForm /></Protected>} />
          <Route path="addons/:id/edit" element={<Protected pageKey="addons"><AddOnForm /></Protected>} />

          <Route path="promos" element={<Protected pageKey="promos"><Promos /></Protected>} />
          <Route path="promos/new" element={<Protected pageKey="promos"><PromoForm /></Protected>} />
          <Route path="promos/:id/edit" element={<Protected pageKey="promos"><PromoForm /></Protected>} />

          <Route path="expenses" element={<Protected pageKey="expenses"><Expenses /></Protected>} />
          <Route path="expenses/new" element={<Protected pageKey="expenses"><ExpenseForm /></Protected>} />
          <Route path="expenses/:id" element={<Protected pageKey="expenses"><ExpenseDetail /></Protected>} />

          <Route path="cashflow" element={<Protected pageKey="cashflow"><Cashflow /></Protected>} />
          <Route path="cashflow/new" element={<Protected pageKey="cashflow"><CashAdjustmentForm /></Protected>} />
          <Route
            path="cashflow/adjustments/:id"
            element={<Protected pageKey="cashflow"><CashAdjustmentDetail /></Protected>}
          />

          <Route path="employees" element={<Protected pageKey="employees"><Employees /></Protected>} />
          <Route path="employees/new" element={<Protected pageKey="employees"><EmployeeForm /></Protected>} />
          <Route path="employees/:id/edit" element={<Protected pageKey="employees"><EmployeeForm /></Protected>} />

          <Route path="attendance" element={<Protected pageKey="attendance"><Attendance /></Protected>} />
          <Route path="attendance/:workerId" element={<Protected pageKey="attendance"><AttendanceEntry /></Protected>} />
          <Route path="attendance/:workerId/dtr" element={<Protected pageKey="attendance"><AttendanceDtr /></Protected>} />

          <Route path="cash-advances" element={<Protected pageKey="cash_advances"><CashAdvances /></Protected>} />
          <Route path="cash-advances/new" element={<Protected pageKey="cash_advances"><CashAdvanceForm /></Protected>} />

          <Route path="deductions" element={<Protected pageKey="deductions"><Deductions /></Protected>} />
          <Route path="deductions/:workerId" element={<Protected pageKey="deductions"><DeductionWorkerDetail /></Protected>} />
          <Route path="deduction-types" element={<Protected pageKey="deductions"><DeductionTypes /></Protected>} />
          <Route path="deduction-types/new" element={<Protected pageKey="deductions"><DeductionTypeForm /></Protected>} />
          <Route path="deduction-types/:id/edit" element={<Protected pageKey="deductions"><DeductionTypeForm /></Protected>} />

          <Route path="payroll" element={<Protected pageKey="payroll"><Payroll /></Protected>} />
          <Route path="payroll/new" element={<Protected pageKey="payroll"><PayrollRunForm /></Protected>} />
          <Route path="payroll/:id" element={<Protected pageKey="payroll"><PayrollRunDetail /></Protected>} />
          <Route path="payroll/:runId/dtr/:workerId" element={<Protected pageKey="payroll"><PayrollDtr /></Protected>} />
          <Route path="payroll/:runId/payslip/:workerId" element={<Protected pageKey="payroll"><PayslipDetail /></Protected>} />
          <Route path="payroll-settings" element={<Protected pageKey="payroll"><PayrollSettings /></Protected>} />

          <Route path="reports" element={<Protected pageKey="reports"><Reports /></Protected>} />
          <Route
            path="reports/expense-categories"
            element={<Protected pageKey="reports"><ReportExpenseCategories /></Protected>}
          />
          <Route
            path="reports/cashflow-source"
            element={<Protected pageKey="reports"><ReportCashflowSource /></Protected>}
          />
          <Route
            path="reports/service-revenue"
            element={<Protected pageKey="reports"><ReportServiceRevenue /></Protected>}
          />
          <Route
            path="reports/order-status"
            element={<Protected pageKey="reports"><ReportOrderStatus /></Protected>}
          />
          <Route
            path="reports/unpaid-orders"
            element={<Protected pageKey="reports"><ReportUnpaidOrders /></Protected>}
          />
          <Route
            path="reports/z-reading"
            element={<Protected pageKey="reports"><ZReading /></Protected>}
          />
          <Route
            path="reports/attendance"
            element={<Protected pageKey="reports"><ReportAttendance /></Protected>}
          />
          <Route
            path="reports/overtime"
            element={<Protected pageKey="reports"><ReportOvertime /></Protected>}
          />
          <Route
            path="reports/government-deductions"
            element={<Protected pageKey="reports"><ReportGovernmentDeductions /></Protected>}
          />
          <Route
            path="reports/top-customers"
            element={<Protected pageKey="reports"><ReportTopCustomers /></Protected>}
          />
          <Route
            path="reports/customer-retention"
            element={<Protected pageKey="reports"><ReportCustomerRetention /></Protected>}
          />
          <Route
            path="reports/promo-effectiveness"
            element={<Protected pageKey="reports"><ReportPromoEffectiveness /></Protected>}
          />
          <Route
            path="reports/loyalty-points"
            element={<Protected pageKey="reports"><ReportLoyaltyPoints /></Protected>}
          />
          <Route
            path="reports/restock-spend"
            element={<Protected pageKey="reports"><ReportRestockSpend /></Protected>}
          />
          <Route
            path="reports/waste"
            element={<Protected pageKey="reports"><ReportWaste /></Protected>}
          />
          <Route
            path="reports/item-usage"
            element={<Protected pageKey="reports"><ReportItemUsage /></Protected>}
          />
          <Route
            path="reports/busiest-hours"
            element={<Protected pageKey="reports"><ReportBusiestHours /></Protected>}
          />
          <Route
            path="reports/expense-trend"
            element={<Protected pageKey="reports"><ReportExpenseTrend /></Protected>}
          />
          <Route
            path="reports/load-verification"
            element={<OwnerOnly><ReportLoadVerification /></OwnerOnly>}
          />

          <Route path="settings" element={<Settings />} />
          <Route path="settings/printer" element={<PrinterSettings />} />
          <Route path="settings/machine-status" element={<MachineStatus />} />
          <Route path="settings/machines" element={<Machines />} />
          <Route path="settings/branch" element={<BranchForm />} />
          <Route path="settings/sc-pwd-discount" element={<ScPwdDiscountSettings />} />
          <Route path="settings/audit-view" element={<OwnerOnly><AuditViewSettings /></OwnerOnly>} />
          <Route path="settings/online-monitoring" element={<OwnerOnly><OnlineMonitoringSettings /></OwnerOnly>} />
          <Route path="settings/or-series" element={<OrSeries />} />
          <Route path="settings/or-series/new" element={<OrSeriesForm />} />
          <Route path="settings/or-series/:id" element={<OrSeriesDetail />} />
          <Route path="settings/backup" element={<Backup />} />

          <Route path="users" element={<OwnerOnly><Users /></OwnerOnly>} />
          <Route path="users/new" element={<OwnerOnly><UserForm /></OwnerOnly>} />
          <Route path="users/:id/edit" element={<OwnerOnly><UserForm /></OwnerOnly>} />
          <Route path="users/permissions" element={<OwnerOnly><RolePermissionsForm /></OwnerOnly>} />
        </Route>
      </Routes>
    </HashRouter>
    </MachineStatusProvider>
  );
}

export default App;
