import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Icon = ({ path, className = "" }: { path: string; className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d={path} />
  </svg>
);

const Shield = (p: any) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
  </svg>
);

const ArrowRight = (p: any) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "secondary";
  size?: "default" | "lg";
};

const Button = ({ variant = "primary", size = "default", className = "", ...props }: BtnProps) => {
  const base =
    "inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none";
  const v: Record<string, string> = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-white text-blue-600 hover:bg-gray-100",
    ghost: "text-gray-600 hover:text-gray-900 hover:bg-gray-100",
    outline: "border border-gray-200 bg-white text-gray-900 hover:bg-gray-100",
  };
  const s: Record<string, string> = { default: "h-10 px-4 py-2", lg: "h-11 px-8" };
  return <button className={`${base} ${v[variant]} ${s[size]} ${className}`} {...props} />;
};

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const go = (to: string) => navigate(to);

  const goAuth = () => {
    if (user) go("/dashboard");
    else go("/login");
  };

  const scrollToFeatures = () => {
    document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
  };

  const link = (label: string, onClick: () => void) => (
    <button onClick={onClick} className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
      {label}
    </button>
  );

  const FeatureCard = ({
    title,
    text,
    icon,
  }: {
    title: string;
    text: string;
    icon: React.ReactNode;
  }) => (
    <div className="p-6 border border-gray-200 rounded-lg hover:shadow-lg transition-shadow bg-white">
      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-2 text-gray-900">{title}</h3>
      <p className="text-gray-600">{text}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      <nav className="border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <button className="flex items-center gap-2" onClick={() => go("/")}>
              <Shield className="w-8 h-8 text-blue-600" />
              <span className="text-xl font-bold">Fraudly</span>
            </button>

            <div className="hidden md:flex items-center gap-8">
              {link("Features", scrollToFeatures)}
              {link("About", () => {})}
              {link("Pricing", () => {})}
              {link("Contact", () => {})}
            </div>

            <div className="flex items-center gap-4">
              {user ? (
                <Button onClick={() => go("/dashboard")}>Dashboard</Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={goAuth}>
                    Sign In
                  </Button>
                  <Button onClick={goAuth}>Get Started</Button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6 text-gray-900">
              Advanced Fraud Detection for Your Business
            </h1>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              Protect your customers and your business with real-time fraud detection powered by advanced analytics and machine learning.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" onClick={goAuth}>
                {user ? "Go to Dashboard" : "Request Demo"}
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={scrollToFeatures}>
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-gray-50 px-4 sm:px-6 lg:px-8 border-y border-gray-100">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-blue-600 mb-2">Moderate%</div>
              <div className="text-gray-600 font-medium">Accuracy Rate</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-blue-600 mb-2">Fast</div>
              <div className="text-gray-600 font-medium">Detection Time</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-blue-600 mb-2">24/7</div>
              <div className="text-gray-600 font-medium">Real-time Monitoring</div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4 text-gray-900">Powerful Features</h2>
            <p className="text-xl text-gray-600">Everything you need to detect and prevent fraud</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              title="Real-time Analysis"
              text="Instant fraud detection with advanced machine learning algorithms analyzing every transaction."
              icon={<Icon className="w-6 h-6 text-blue-600" path="M23 6 13.5 15.5 8.5 10.5 1 18" />}
            />
            <FeatureCard
              title="Smart Alerts"
              text="Receive instant notifications for suspicious activities with customizable alert thresholds."
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-blue-600">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
              }
            />
            <FeatureCard
              title="Role-based Access"
              text="Secure access controls with distinct permissions for admins, employees, and users."
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-blue-600">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              }
            />
            <FeatureCard
              title="User Management"
              text="Comprehensive tools for managing user accounts and monitoring customer activity."
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-blue-600">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              }
            />
            <FeatureCard
              title="Advanced Analytics"
              text="Detailed insights and reporting with comprehensive fraud scoring visualization."
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-blue-600">
                  <path d="M3 3v18h18" />
                  <path d="M18 17V9" />
                  <path d="M13 17V5" />
                  <path d="M8 17v-3" />
                </svg>
              }
            />
            <FeatureCard
              title="Enterprise Security"
              text="Bank-level security with AWS infrastructure and MongoDB data protection."
              icon={<Shield className="w-6 h-6 text-blue-600" />}
            />
          </div>
        </div>
      </section>

      <section className="py-20 bg-blue-600 text-white px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to Protect Your Business?</h2>
          <p className="text-xl mb-8 text-blue-100">
            Join thousands of businesses that trust Fraudly for their fraud detection needs.
          </p>
          <Button size="lg" variant="secondary" onClick={goAuth}>
            Get Started Today
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      </section>

      <footer className="bg-gray-900 text-gray-300 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-6 h-6 text-blue-400" />
                <span className="text-white font-bold text-lg">Fraudly</span>
              </div>
              <p className="text-sm text-gray-400">Advanced fraud detection and prevention for modern businesses.</p>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><button onClick={scrollToFeatures} className="hover:text-white transition-colors">Features</button></li>
                <li><button onClick={() => {}} className="hover:text-white transition-colors">Pricing</button></li>
                <li><button onClick={() => {}} className="hover:text-white transition-colors">Security</button></li>
                <li><button onClick={() => {}} className="hover:text-white transition-colors">Integrations</button></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><button onClick={() => {}} className="hover:text-white transition-colors">About Us</button></li>
                <li><button onClick={() => {}} className="hover:text-white transition-colors">Careers</button></li>
                <li><button onClick={() => {}} className="hover:text-white transition-colors">Blog</button></li>
                <li><button onClick={() => {}} className="hover:text-white transition-colors">Contact</button></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><button onClick={() => {}} className="hover:text-white transition-colors">Privacy Policy</button></li>
                <li><button onClick={() => {}} className="hover:text-white transition-colors">Terms of Service</button></li>
                <li><button onClick={() => {}} className="hover:text-white transition-colors">Compliance</button></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-12 pt-8 text-sm text-center text-gray-500">
            <p>&copy; 2025 Fraudly. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
