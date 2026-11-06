import type { Metadata } from "next";
import type { CSSProperties } from "react";
import localFont from "next/font/local";
import { Header } from "@/components/shared";
import "./globals.css";
import branding from "@/branding.json";
// Constructor: server-rendered website settings
import constructorWebsiteSettings from "../public/constructor-settings.json";
type constructorWebsiteSettingsMetadataValue<T> = Omit<NonNullable<T>, 'title' | 'description'> & { title: string; description: string };
function constructorWebsiteSettingsMetadata<T extends object | null | undefined>(value: PromiseLike<T>): Promise<constructorWebsiteSettingsMetadataValue<T>>;
function constructorWebsiteSettingsMetadata<T extends object | null | undefined>(value: T): constructorWebsiteSettingsMetadataValue<T>;
function constructorWebsiteSettingsMetadata(value: object | null | undefined | PromiseLike<object>): object | Promise<object> {
  if (value && 'then' in value && typeof value.then === 'function') return Promise.resolve(value).then(original => constructorWebsiteSettingsMetadata(original));
  return { ...value, title: constructorWebsiteSettings.title, description: constructorWebsiteSettings.description };
}


const atkinson = localFont({
  src: [
    {
      path: "../public/fonts/atkinson-400.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/atkinson-700.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-atkinson",
  display: "swap",
  declarations: [{ prop: "font-family", value: "Atkinson Hyperlegible" }],
});
const bundledFontSources = new Set([
  "https://fonts.gstatic.com/s/atkinsonhyperlegible/v12/9Bt23C1KxNDXMspQ1lPyU89-1h6ONRlW45GE5Q.ttf",
  "https://fonts.gstatic.com/s/atkinsonhyperlegible/v12/9Bt73C1KxNDXMspQ1lPyU89-1h6ONRlW45G8WbcNcw.ttf",
]);
const additionalFontFaces = branding.brandbook.fontFaces
  .filter((face) => !bundledFontSources.has(face.url))
  .map(
    (face) =>
      `@font-face{font-family:${JSON.stringify(face.family)};font-weight:${face.weight};font-style:normal;font-display:swap;src:url(${JSON.stringify(face.url)})}`,
  )
  .join("\n");
const brandStyle = {
  "--brand-background": branding.backgroundColor,
  "--brand-surface": branding.secondaryColor,
  "--brand-primary": branding.primaryColor,
  "--brand-accent": branding.accentColor,
  "--brand-text": branding.textColor,
  "--brand-font-heading": branding.fontHeading,
  "--brand-font-body": branding.fontBody,
} as CSSProperties;
export const metadata: Metadata = constructorWebsiteSettingsMetadata(({
  title: {
    default: `Menú · ${branding.logoText}`,
    template: `%s · ${branding.logoText}`,
  },
  description: `Explora el menú y guarda un pedido de demostración en ${branding.logoText}.`,
}));
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang={constructorWebsiteSettings.language} className={atkinson.variable} style={brandStyle}>
      <body>
        {additionalFontFaces && <style>{additionalFontFaces}</style>}
        <Header />
        {children}
        <footer className="site-footer">
          <span>{branding.logoText}</span>
          <span>Tu selección, a la vista.</span>
        </footer>
        <script src={"https://constructor-api-git-fix-two-projects-ai-p-5c3f22-useconstructor.vercel.app/v1/projects/P-6NY3YK/analytics/script.js"} defer></script>
        <script src="/constructor-editor.js" defer></script>
      <script src="/constructor-settings.js" defer></script><script src="/constructor-brand-identity.js" defer></script></body>
    </html>
  );
}
