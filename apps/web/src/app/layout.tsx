import type { Metadata } from 'next';
import './style.css';
export const metadata: Metadata = {
  title: 'Patchlens · Change auditor',
  description: 'Deterministic, local code change auditing.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
