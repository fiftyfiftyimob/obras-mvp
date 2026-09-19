import './globals.css';

export const metadata = {
  title: 'Obras MVP',
  description: 'Gestão de produção em obras',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
