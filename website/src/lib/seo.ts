import {
  LICENSE_URL,
  REPO_URL,
  SITE_DESCRIPTION,
  SITE_TITLE,
  SITE_URL,
  X_URL,
} from "./site";

// Evaluated at build time; never use a request host as a canonical identity.
export function isSiteIndexable(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return (
    environment.ARGENT_SITE_NOINDEX !== "1" &&
    (!environment.VERCEL_ENV || environment.VERCEL_ENV === "production")
  );
}

export const siteStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}#website`,
      url: SITE_URL,
      name: "Argent",
      inLanguage: "en",
    },
    {
      "@type": "WebPage",
      "@id": `${SITE_URL}#webpage`,
      url: SITE_URL,
      name: SITE_TITLE,
      description: SITE_DESCRIPTION,
      inLanguage: "en",
      isPartOf: { "@id": `${SITE_URL}#website` },
      about: { "@id": `${SITE_URL}#application` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}#application`,
      name: "Argent",
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "macOS (Apple silicon)",
      license: LICENSE_URL,
      sameAs: [REPO_URL, X_URL],
    },
  ],
};
