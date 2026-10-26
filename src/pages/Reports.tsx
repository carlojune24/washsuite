import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ShoppingBag,
  ListChecks,
  Clock,
  PieChart,
  TrendingUp,
  Wallet,
  PackagePlus,
  Trash2,
  Boxes,
  UserCheck,
  Timer,
  Star,
  UserPlus,
  Percent,
  Gift,
  Landmark,
  Radar,
  BookOpen,
  Receipt,
} from "lucide-react";
import ListRow from "../components/ListRow";
import { useAuth } from "../lib/auth";

interface ReportLink {
  to: string;
  title: string;
  subtitle: string;
  icon: typeof ShoppingBag;
}

interface ReportSection {
  heading: string;
  items: ReportLink[];
}

const SECTIONS: ReportSection[] = [
  {
    heading: "Sales",
    items: [
      {
        to: "/reports/service-revenue",
        title: "Revenue by service/package",
        subtitle: "Which services and packages earn the most",
        icon: ShoppingBag,
      },
      {
        to: "/reports/order-status",
        title: "Order status breakdown",
        subtitle: "Pending, ready, claimed, delivered, cancelled over a period",
        icon: ListChecks,
      },
      {
        to: "/reports/busiest-hours",
        title: "Busiest hours & days",
        subtitle: "Order volume by hour of day and day of week",
        icon: Clock,
      },
      {
        to: "/reports/unpaid-orders",
        title: "Unpaid orders",
        subtitle: "Outstanding balances from unpaid and partially paid orders",
        icon: Wallet,
      },
      {
        to: "/settings/or-series",
        title: "OR series & liquidation",
        subtitle: "Registered BIR receipt series, issued/voided/unused numbers",
        icon: BookOpen,
      },
      {
        to: "/reports/z-reading",
        title: "Z-Reading / X-Reading",
        subtitle: "Daily sales close, grand total, VAT & SC/PWD breakdown",
        icon: Receipt,
      },
    ],
  },
  {
    heading: "Expenses & cashflow",
    items: [
      {
        to: "/reports/expense-categories",
        title: "Expense category breakdown",
        subtitle: "Which categories spend the most",
        icon: PieChart,
      },
      {
        to: "/reports/expense-trend",
        title: "Expense trend",
        subtitle: "Month-over-month spend",
        icon: TrendingUp,
      },
      {
        to: "/reports/cashflow-source",
        title: "Cashflow by source",
        subtitle: "Income and expenses grouped by where they came from",
        icon: Wallet,
      },
    ],
  },
  {
    heading: "Inventory",
    items: [
      {
        to: "/reports/restock-spend",
        title: "Restock spend",
        subtitle: "How much was spent restocking, and on what",
        icon: PackagePlus,
      },
      {
        to: "/reports/waste",
        title: "Waste & shrinkage",
        subtitle: "Stock lost to waste or adjustments, valued at cost",
        icon: Trash2,
      },
      {
        to: "/reports/item-usage",
        title: "Item usage & income",
        subtitle: "How much of an item was used, and what it earned",
        icon: Boxes,
      },
    ],
  },
  {
    heading: "Employees",
    items: [
      {
        to: "/reports/attendance",
        title: "Attendance performance",
        subtitle: "Attendance rate, lateness, and absences by worker",
        icon: UserCheck,
      },
      {
        to: "/reports/overtime",
        title: "Overtime",
        subtitle: "Workers with the most overtime hours",
        icon: Timer,
      },
      {
        to: "/reports/government-deductions",
        title: "Government deductions",
        subtitle: "SSS, PhilHealth, Pag-IBIG remitted, split by employee and employer share",
        icon: Landmark,
      },
    ],
  },
  {
    heading: "Customers",
    items: [
      {
        to: "/reports/top-customers",
        title: "Top customers by spend",
        subtitle: "Ranked by total amount spent over a period",
        icon: Star,
      },
      {
        to: "/reports/customer-retention",
        title: "New vs. returning customers",
        subtitle: "First-time vs. repeat customers over a period",
        icon: UserPlus,
      },
      {
        to: "/reports/promo-effectiveness",
        title: "Promo effectiveness",
        subtitle: "Usage count and total discount given per promo",
        icon: Percent,
      },
      {
        to: "/reports/loyalty-points",
        title: "Loyalty points issued vs. redeemed",
        subtitle: "Points earned vs. points redeemed over a period",
        icon: Gift,
      },
    ],
  },
];

// Owner-only, appended separately (rather than living in SECTIONS) so the link itself stays
// invisible to staff even if they've been granted general "reports" access via role permissions
// -- the route it points to is hard-gated with OwnerOnly (see App.tsx), and showing a link that
// just redirects away would be confusing.
const OWNER_SECTION: ReportSection = {
  heading: "Sensors",
  items: [
    {
      to: "/reports/load-verification",
      title: "Declared vs. sensor-detected loads",
      subtitle: "Owner-only check on staff-reported load counts against machine sensors",
      icon: Radar,
    },
  ],
};

export default function Reports() {
  const { currentUser } = useAuth();
  const sections = currentUser?.role === "owner" ? [...SECTIONS, OWNER_SECTION] : SECTIONS;

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/settings"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Reports</h1>
      </div>

      {sections.map((section) => (
        <div key={section.heading} className="mb-6">
          <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">{section.heading}</p>
          <ul className="space-y-2">
            {section.items.map((item) => (
              <ListRow
                key={item.to}
                to={item.to}
                icon={item.icon}
                title={item.title}
                subtitle={item.subtitle}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
