export interface NavItem {
  label: string;
  href: string;
}

export interface HeroMetric {
  label: string;
  value: string;
}

export interface FeatureItem {
  title: string;
  description: string;
}

export interface StepItem {
  title: string;
  description: string;
}

export interface PricingItem {
  tier: string;
  price: string;
  summary: string;
  features: string[];
  highlighted?: boolean;
}

export interface TestimonialItem {
  quote: string;
  name: string;
  role: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}
