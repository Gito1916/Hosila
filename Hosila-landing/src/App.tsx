import { Navbar } from './components/landing/Navbar';
import { Hero } from './components/landing/Hero';
import { Features } from './components/landing/Features';
import { HowItWorks } from './components/landing/HowItWorks';
import { Pricing } from './components/landing/Pricing';
import { Testimonials } from './components/landing/Testimonials';
import { Faq } from './components/landing/Faq';
import { Cta } from './components/landing/Cta';
import { Footer } from './components/landing/Footer';
import type {
  FaqItem,
  FeatureItem,
  HeroMetric,
  NavItem,
  PricingItem,
  StepItem,
  TestimonialItem
} from './types/landing';

const navItems: NavItem[] = [
  { label: 'Features', href: '#features' },
  { label: 'Workflow', href: '#workflow' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Testimonials', href: '#testimonials' },
  { label: 'FAQ', href: '#faq' }
];

const heroMetrics: HeroMetric[] = [
  { label: 'Check-ins Processed', value: '1.4M+' },
  { label: 'Active Properties', value: '260+' },
  { label: 'Average Setup Time', value: '7 days' },
  { label: 'Ops Visibility', value: '24/7' }
];

const features: FeatureItem[] = [
  {
    title: 'Front Desk Command Center',
    description:
      'Track arrivals, departures, room readiness, and check-ins without jumping between tools.'
  },
  {
    title: 'Unified Guest Ledger',
    description:
      'Capture all room and service charges in one timeline, with payment history and balance visibility.'
  },
  {
    title: 'Restaurant & Charge-to-Room',
    description:
      'Run POS operations and post orders directly to guest folios with department-level tracking.'
  },
  {
    title: 'Inventory Movement Reporting',
    description:
      'Monitor opening stock, usage, wastage, and restocks from one report-friendly workflow.'
  },
  {
    title: 'Tax-Ready Financial Views',
    description:
      'Get VAT/SC/TDL-ready summaries and department-level reporting for cleaner month-end reviews.'
  },
  {
    title: 'Role-Aware Team Access',
    description:
      'Assign capabilities by role so each team only sees workflows that match their responsibilities.'
  }
];

const steps: StepItem[] = [
  {
    title: 'Configure your property profile',
    description:
      'Set up room types, pricing rules, taxes, and departments using guided onboarding.'
  },
  {
    title: 'Import or start fresh',
    description:
      'Bring over active reservations and guest records, or begin clean with your current roster.'
  },
  {
    title: 'Operate daily in one system',
    description:
      'Run front desk, service billing, and reporting from one interface with live team visibility.'
  }
];

const pricingPlans: PricingItem[] = [
  {
    tier: 'Starter',
    price: '$39/mo',
    summary: 'For small teams operating a single property.',
    features: ['Up to 20 rooms', 'Booking and check-in workflows', 'Basic financial summaries']
  },
  {
    tier: 'Growth',
    price: '$79/mo',
    summary: 'For hotels with higher volume and daily service operations.',
    features: [
      'Up to 80 rooms',
      'Restaurant + charge-to-room',
      'Inventory movement reports',
      'Tax summary dashboards'
    ],
    highlighted: true
  },
  {
    tier: 'Enterprise',
    price: 'Custom',
    summary: 'For larger groups requiring deeper controls and onboarding support.',
    features: ['Multi-property support', 'Priority onboarding', 'Custom reporting workflows']
  }
];

const testimonials: TestimonialItem[] = [
  {
    quote:
      'Shift handovers became cleaner because everyone now tracks check-ins and balances in the same place.',
    name: 'Amina O.',
    role: 'Operations Manager, Oasis Suites'
  },
  {
    quote:
      'We reduced end-of-day reconciliation time and finally have clear visibility of restaurant charges.',
    name: 'Tunde A.',
    role: 'General Manager, Hillcrest Hotel'
  },
  {
    quote:
      'The team adopted Hosila quickly, and monthly tax reporting is far less stressful than before.',
    name: 'Grace E.',
    role: 'Finance Lead, Seabreeze Lodge'
  }
];

const faqItems: FaqItem[] = [
  {
    question: 'Can Hosila run as a separate marketing site and core PMS app?',
    answer:
      'Yes. This landing package is intentionally independent and can be deployed separately from the core Hosila PMS frontend.'
  },
  {
    question: 'Does the landing page include backend integrations?',
    answer:
      'This first version is static by design. API-integrated forms or analytics can be layered in a later iteration.'
  },
  {
    question: 'Will this support future Figma-driven updates?',
    answer:
      'Yes. The structure is section-based so design-generated sections can be swapped in when Figma MCP access is enabled.'
  }
];

export function App() {
  return (
    <div className="min-h-screen bg-surface-base text-body">
      <Navbar links={navItems} />
      <main>
        <Hero metrics={heroMetrics} />
        <Features items={features} />
        <HowItWorks steps={steps} />
        <Pricing plans={pricingPlans} />
        <Testimonials testimonials={testimonials} />
        <Faq faqs={faqItems} />
        <Cta />
      </main>
      <Footer links={navItems} />
    </div>
  );
}
